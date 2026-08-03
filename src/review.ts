import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import chalk from "chalk";
import type { Scope } from "./activate.js";
import type { SuitManifest } from "./suits.js";
import { ARTIFACT_TYPES, libraryPathForType } from "./artifact-types.js";
import { STRONGSUIT_DIR } from "./paths.js";
import { claudeMdPath } from "./claudemd.js";
import { validateHook, formatHook, settingsPath } from "./hooks.js";
import { parsePluginEntry, pluginConfigPath } from "./plugin.js";
import { validateMcpServer, mcpConfigPath } from "./mcp.js";

/**
 * Review of a suit before anything is activated.
 *
 * Every component is shown with what it can do to the machine, and approved or
 * rejected on its own. Rejecting one excludes that component; the rest still
 * proceeds. Decisions are recorded with a hash of what was approved, so a later
 * change to the same component is a new decision rather than an inherited one.
 */

/** How much damage a component type can do if it turns out to be hostile. */
export type RiskClass = "red" | "orange" | "yellow";

interface RiskInfo {
  risk: RiskClass;
  reason: string;
}

/**
 * Risk per component type. RED means the component can act on the machine on
 * its own — it is never approved by a flag, only by a human.
 */
export const RISK_CLASSES: Record<string, RiskInfo> = {
  hooks: { risk: "red", reason: "runs an arbitrary command on your machine" },
  permissions: { risk: "red", reason: "grants tool access without prompting" },
  mcp: { risk: "orange", reason: "starts a process or contacts a network service" },
  plugins: { risk: "orange", reason: "installs code from a marketplace" },
  skills: { risk: "yellow", reason: "instructions the agent will follow" },
  commands: { risk: "yellow", reason: "instructions the agent will follow" },
  agents: { risk: "yellow", reason: "instructions the agent will follow" },
  rules: { risk: "yellow", reason: "instructions the agent will follow" },
  claudemd: { risk: "yellow", reason: "instructions the agent will follow" },
};

/** True when this type can execute code or grant trust on its own. */
export function isCodeExecuting(type: string): boolean {
  return RISK_CLASSES[type]?.risk === "red";
}

/** One reviewable component. */
export interface ReviewItem {
  type: string;
  /** Display name — a skill name, a hook event, a server name. */
  id: string;
  risk: RiskClass;
  reason: string;
  /** What is being approved, in full. Never truncated. */
  detail: string;
  /** What is installed at this key today, when anything is. */
  installed?: string;
  /** The manifest entry this came from, so an approved plan can be rebuilt. */
  source: unknown;
}

export interface Decision {
  item: ReviewItem;
  approved: boolean;
}

const RISK_LABEL: Record<RiskClass, string> = {
  red: chalk.red("RED"),
  orange: chalk.yellow("ORANGE"),
  yellow: chalk.dim("YELLOW"),
};

/** Reads a JSON file, returning an empty object when absent or unparseable. */
function readJson(file: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function nested(obj: unknown, keys: string[]): unknown {
  let current = obj;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function show(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value, null, 2);
}

/**
 * Reads an entry's markdown so the reviewer sees the instructions the agent
 * would follow, not just a name. Content comes from the library for local
 * suits, or from a quarantine root for a remote being reviewed before
 * install — never from where the remote will eventually live.
 */
function entryContent(typeId: string, name: string, fileRoot?: string): string {
  const type = ARTIFACT_TYPES[typeId];
  if (!type) return name;
  const dir = fileRoot
    ? path.join(fileRoot, typeId, name)
    : path.join(libraryPathForType(type), name);
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    if (files.length === 0) return `${name} (no markdown files in ${dir})`;
    return files
      .map((f) => `--- ${f}\n${fs.readFileSync(path.join(dir, f), "utf-8")}`)
      .join("\n");
  } catch {
    return `${name} (not in the library yet: ${dir})`;
  }
}

/**
 * Turns a suit into the list of things a human has to agree to.
 *
 * Hooks are expanded one entry per hook — the per-entry rule is not a display
 * choice, it is what makes a single hostile command in an otherwise reasonable
 * suit impossible to wave through.
 */
export interface PlanOptions {
  /**
   * Root to read file-component content from, laid out as `<root>/<type>/<name>`.
   * Set when reviewing a remote suit still in quarantine.
   */
  fileRoot?: string;
}

export function buildReviewPlan(
  suit: SuitManifest,
  scope: Scope,
  options: PlanOptions = {}
): ReviewItem[] {
  const items: ReviewItem[] = [];
  const components = suit.components ?? {};

  const item = (
    type: string,
    id: string,
    detail: string,
    source: unknown,
    installed?: string
  ): ReviewItem => {
    const info = RISK_CLASSES[type] ?? { risk: "yellow" as RiskClass, reason: "unclassified" };
    return {
      type,
      id,
      risk: info.risk,
      reason: info.reason,
      detail,
      source,
      ...(installed !== undefined ? { installed } : {}),
    };
  };

  for (const typeId of ["skills", "commands", "agents", "rules"] as const) {
    for (const name of components[typeId] ?? []) {
      const activeDir = ARTIFACT_TYPES[typeId]?.activeDirForScope(scope);
      const active = activeDir && fs.existsSync(path.join(activeDir, name));
      items.push(
        item(
          typeId,
          name,
          entryContent(typeId, name, options.fileRoot),
          name,
          active ? "already active" : undefined
        )
      );
    }
  }

  for (const name of components.claudemd ?? []) {
    items.push(item("claudemd", name, `@${name} appended to ${claudeMdPath(scope)}`, name));
  }

  const mcpFile = mcpConfigPath(scope);
  const mcpCurrent = readJson(mcpFile);
  for (const config of components.mcp ?? []) {
    const server = validateMcpServer(config);
    items.push(
      item(
        "mcp",
        server.name,
        JSON.stringify(server, null, 2),
        config,
        show(nested(mcpCurrent, ["mcpServers", server.name]))
      )
    );
  }

  const pluginFile = pluginConfigPath(scope);
  const pluginCurrent = readJson(pluginFile);
  for (const entry of components.plugins ?? []) {
    const spec = parsePluginEntry(entry);
    const detail = spec.source
      ? `${spec.ref.fullRef}\n  marketplace source: ${spec.source}`
      : spec.ref.fullRef;
    items.push(
      item(
        "plugins",
        spec.ref.fullRef,
        detail,
        entry,
        show(nested(pluginCurrent, ["enabledPlugins", spec.ref.fullRef]))
      )
    );
  }

  const hookFile = settingsPath(scope);
  const hookCurrent = readJson(hookFile);
  for (const entry of components.hooks ?? []) {
    const hook = validateHook(entry);
    items.push(
      item(
        "hooks",
        hook.matcher ? `${hook.event} [${hook.matcher}]` : hook.event,
        formatHook(hook),
        entry,
        show(nested(hookCurrent, ["hooks", hook.event]))
      )
    );
  }

  return items;
}

/** Everything the reviewer is told about one item, ready to print. */
export function renderItem(item: ReviewItem): string {
  const head = `${RISK_LABEL[item.risk]}  ${item.type}: ${item.id}`;
  const why = chalk.dim(`  ${item.reason}`);
  const body = item.detail
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  const installed =
    item.installed === undefined
      ? ""
      : `\n  ${chalk.dim("currently installed:")}\n${item.installed
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n")}`;
  return `${head}\n${why}\n${body}${installed}`;
}

/** A one-line overview of what the suit contains, by risk. */
export function renderOverview(items: ReviewItem[]): string {
  if (items.length === 0) return "Nothing to review.";
  const counts = new Map<RiskClass, number>();
  for (const item of items) counts.set(item.risk, (counts.get(item.risk) ?? 0) + 1);
  const parts = (["red", "orange", "yellow"] as const)
    .filter((risk) => counts.has(risk))
    .map((risk) => `${counts.get(risk)} ${RISK_LABEL[risk]}`);
  return `Reviewing ${items.length} component${items.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

export interface ReviewOptions {
  /** Approve everything that is not RED without prompting. */
  yes?: boolean;
  /**
   * Approve RED components too. Separate from `yes` on purpose: code execution
   * is not something a general "assume yes" flag should ever cover.
   */
  approveCodeExecution?: boolean;
  /** Whether a human can answer. Defaults to whether stdin is a TTY. */
  interactive?: boolean;
  confirm?: (item: ReviewItem) => Promise<boolean>;
  print?: (line: string) => void;
}

async function defaultConfirm(item: ReviewItem): Promise<boolean> {
  const inquirer = (await import("inquirer")).default;
  const { approved } = await inquirer.prompt<{ approved: boolean }>([
    { type: "confirm", name: "approved", message: `Approve ${item.type}: ${item.id}?`, default: false },
  ]);
  return approved;
}

/**
 * Walks every component and returns a decision for each.
 *
 * Nothing is ever approved without first being printed in full. With no TTY
 * and no `--yes` this throws rather than deciding on the user's behalf; with
 * `--yes` it approves everything except RED, which stays rejected and is
 * listed, because a flag that means "don't ask me" cannot also mean "run this
 * command for me".
 */
export async function reviewComponents(
  items: ReviewItem[],
  options: ReviewOptions = {}
): Promise<Decision[]> {
  if (items.length === 0) return [];

  const print = options.print ?? ((line: string) => console.log(line));
  print(renderOverview(items));
  for (const item of items) print(renderItem(item));

  if (options.yes) {
    const decisions = items.map((item) => ({
      item,
      approved: !isCodeExecuting(item.type) || options.approveCodeExecution === true,
    }));
    const refused = decisions.filter((d) => !d.approved);
    if (refused.length > 0) {
      print(
        chalk.red(
          `\n--yes does not approve code execution. ${refused.length} component${refused.length === 1 ? " was" : "s were"} left out:`
        )
      );
      for (const { item } of refused) print(`  ${item.type}: ${item.id}`);
      print(chalk.dim("Re-run interactively, or pass --approve-code-execution to accept them."));
    }
    return decisions;
  }

  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
  if (!interactive) {
    throw new Error(
      `Refusing to activate ${items.length} component${items.length === 1 ? "" : "s"} without review. ` +
        `Run this in an interactive terminal, or pass --yes to accept everything listed above ` +
        `(code-executing components still need --approve-code-execution).`
    );
  }

  const confirm = options.confirm ?? defaultConfirm;
  const decisions: Decision[] = [];
  for (const item of items) {
    decisions.push({ item, approved: await confirm(item) });
  }
  return decisions;
}

/** The components that survived review, grouped back into a suit's shape. */
export function approvedByType(decisions: Decision[]): Record<string, string[]> {
  const byType: Record<string, string[]> = {};
  for (const { item, approved } of decisions) {
    if (!approved) continue;
    (byType[item.type] ??= []).push(item.id);
  }
  return byType;
}

/**
 * The suit with every rejected component removed.
 *
 * Rebuilt from the manifest entries the plan carried, so what gets activated is
 * exactly what was shown and approved — not a second interpretation of the
 * manifest that could drift from the one the reviewer saw.
 */
export function filterApproved(suit: SuitManifest, decisions: Decision[]): SuitManifest {
  const components: Record<string, unknown[]> = {};
  for (const { item, approved } of decisions) {
    if (!approved) continue;
    (components[item.type] ??= []).push(item.source);
  }
  return { ...suit, components: components as SuitManifest["components"] };
}

/** What was decided, in one line per component. */
export function summarize(decisions: Decision[]): string {
  if (decisions.length === 0) return "Nothing reviewed.";
  const approved = decisions.filter((d) => d.approved).length;
  const rejected = decisions.length - approved;
  const lines = decisions.map(
    ({ item, approved: ok }) =>
      `  ${ok ? chalk.green("✓") : chalk.red("✗")} ${item.type}: ${item.id}`
  );
  return `${approved} approved, ${rejected} rejected\n${lines.join("\n")}`;
}

/** Where review decisions are kept, for the lockfile to build on. */
export function decisionsPath(suitName: string): string {
  return path.join(STRONGSUIT_DIR, "reviews", `${suitName}.json`);
}

export interface RecordedDecision {
  type: string;
  id: string;
  risk: RiskClass;
  approved: boolean;
  /** Hash of exactly what was shown, so an edited component is undecided again. */
  contentHash: string;
  decidedAt: string;
}

export function contentHash(detail: string): string {
  return crypto.createHash("sha256").update(detail).digest("hex");
}

/** Writes the decisions for a suit, replacing any previous record. */
export function recordDecisions(suitName: string, decisions: Decision[]): void {
  const file = decisionsPath(suitName);
  const records: RecordedDecision[] = decisions.map(({ item, approved }) => ({
    type: item.type,
    id: item.id,
    risk: item.risk,
    approved,
    contentHash: contentHash(item.detail),
    decidedAt: new Date().toISOString(),
  }));

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(records, null, 2), "utf-8");
  fs.renameSync(temp, file);
}

/** Reads the decisions previously recorded for a suit. */
export function readDecisions(suitName: string): RecordedDecision[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(decisionsPath(suitName), "utf-8"));
    return Array.isArray(parsed) ? (parsed as RecordedDecision[]) : [];
  } catch {
    return [];
  }
}

/**
 * True when this exact content was approved before.
 *
 * The hash is what makes the record safe to reuse: a component whose content
 * changed since the decision does not match, so it is reviewed again rather
 * than inheriting an approval given to different text.
 */
export function previouslyApproved(suitName: string, item: ReviewItem): boolean {
  const wanted = contentHash(item.detail);
  return readDecisions(suitName).some(
    (record) =>
      record.type === item.type &&
      record.id === item.id &&
      record.approved &&
      record.contentHash === wanted
  );
}
