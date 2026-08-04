import fs from "node:fs";
import path from "node:path";
import ora from "ora";
import chalk from "chalk";
import { loadSuit, suitExists, listSuits } from "../suits.js";
import { onboardingAdvice } from "../onboarding.js";
import { clearOffOverrides } from "../skill-overrides.js";
import {
  activateOnlyFor,
  getActiveEntriesFor,
  type Scope,
} from "../activate.js";
import { setFragments, claudeMdPath } from "../claudemd.js";
import { ARTIFACT_TYPES, libraryPathForType } from "../artifact-types.js";
import { lstatOrNull, immediateTarget, isInside } from "../fsutil.js";
import { ManagedJson } from "../managed-json.js";
import { validateMcpServer, mcpConfigPath, mcpConfigPathForProject } from "../mcp.js";
import {
  parsePluginEntry,
  ensurePluginInstalled,
  installSucceeded,
  pluginConfigPath,
  enabledPluginsPath,
} from "../plugin.js";
import {
  validateHook,
  activateHooks,
  deactivateHooks,
  disabledNotice,
  settingsPath,
  type HookEntry,
} from "../hooks.js";
import {
  buildReviewPlan,
  reviewComponents,
  filterApproved,
  recordDecisions,
  renderItem,
  type Decision,
  summarize,
} from "../review.js";
import type { SuitManifest } from "../suits.js";
import { verifyAgainstLock, pinSuit, driftDiff } from "../lock.js";
import { ledgerPath, backupsDir } from "../paths.js";

/** Options accepted by `suit up`. */
export interface UpOptions {
  /** Approve every non-RED component without prompting. Everything is still printed. */
  yes?: boolean;
  /** Also approve RED components. Separate from `yes` on purpose. */
  approveCodeExecution?: boolean;
}

/** Single operation in the journal for rollback. */
export interface JournalEntry {
  type: "link-created" | "link-removed" | "claudemd-written" | "json-entry";
  path: string;
  previousTarget?: string; // For links: the target they pointed to before removal
  previousContent?: string; // For CLAUDE.md: the content before it was written
  jsonPath?: string | string[]; // For json-entry: path to the modified value
  previousValue?: unknown; // For json-entry: the value before modification (or undefined if absent)
  scope?: Scope; // For json-entry: which scope's ledger owns this write
}

/** Execution result for a single artifact type. */
interface TypeResult {
  type: string;
  linked: string[];
  removed: string[];
  skipped: string[];
  foreign: string[];
}

/**
 * Captures the current state of an active directory before activation.
 * Records link targets so we can restore them on rollback.
 */
interface CapturedLink {
  /** Exactly what the link held, so rollback can recreate it byte-identically. */
  raw: string;
  /** First hop with its parent resolved — used to decide ownership. */
  resolved: string | null;
}

function captureDirectoryState(dirPath: string): Map<string, CapturedLink> {
  const state = new Map<string, CapturedLink>();
  try {
    if (!fs.existsSync(dirPath)) return state;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        const linkPath = path.join(dirPath, entry.name);
        state.set(entry.name, {
          raw: fs.readlinkSync(linkPath),
          resolved: immediateTarget(linkPath),
        });
      }
    }
  } catch {
    // Ignore errors reading directory
  }
  return state;
}

/**
 * Checks if a link is managed (points into the library).
 */
function isManagedLink(
  linkPath: string,
  libReal: string
): boolean {
  const stat = lstatOrNull(linkPath);
  if (!stat?.isSymbolicLink()) return false;
  const target = immediateTarget(linkPath);
  return target !== null && isInside(target, libReal);
}

/**
 * Executes suit activation with full rollback on failure.
 * Records every filesystem operation in a journal and reverses all changes
 * if any step throws.
 */
async function activateWithRollback(
  suitName: string,
  scope: Scope,
  journal: JournalEntry[],
  reviewed: SuitManifest,
  approvedHooks: HookEntry[] = []
): Promise<TypeResult[]> {
  const suit = reviewed;
  const results: TypeResult[] = [];

  // Pre-flight: capture the state of all directories before we start
  const preflightState = new Map<string, Map<string, CapturedLink>>();
  for (const type of Object.values(ARTIFACT_TYPES)) {
    const activeDir = type.activeDirForScope(scope);
    preflightState.set(type.id, captureDirectoryState(activeDir));
  }

  // Also capture CLAUDE.md state
  const claudeMdPath_ = claudeMdPath(scope);
  const preflightClaudeMd = fs.existsSync(claudeMdPath_)
    ? fs.readFileSync(claudeMdPath_, "utf-8")
    : null;

  try {
    // Activate each artifact type in order
    for (const typeId of ["skills", "commands", "agents", "rules"] as const) {
      const type = ARTIFACT_TYPES[typeId];
      const entryNames = suit.components?.[typeId] ?? [];
      const libraryDir = libraryPathForType(type);
      // A fresh home only has the skills library; realpath on a missing
      // directory throws and takes the whole activation down with it.
      fs.mkdirSync(libraryDir, { recursive: true });
      const libReal = fs.realpathSync(libraryDir);
      const activeDir = type.activeDirForScope(scope);

      // Get what was there before for this type
      const beforeState = preflightState.get(type.id) || new Map();

      // Activate only the specified entries
      const activeResult = activateOnlyFor(
        type,
        entryNames as string[],
        scope,
        libraryDir
      );

      // Record all newly created links in the journal
      for (const linkedName of activeResult.linked) {
        const linkPath = path.join(activeDir, linkedName);
        journal.push({
          type: "link-created",
          path: linkPath,
        });
      }

      // Record all links that were removed (for rollback).
      // Ownership is decided from the pre-flight target, not by probing the
      // path: activateOnlyFor has already deleted these links, so an lstat
      // would report "not managed" and the removal would never be journaled —
      // leaving rollback with nothing to restore.
      for (const [entryName, previous] of beforeState) {
        const linkPath = path.join(activeDir, entryName);
        if (
          !activeResult.linked.includes(entryName) &&
          !activeResult.foreign.includes(entryName) &&
          previous.resolved &&
          isInside(previous.resolved, libReal)
        ) {
          // It was removed, record it for rollback
          journal.push({
            type: "link-removed",
            path: linkPath,
            previousTarget: previous.raw,
          });
        }
      }

      results.push({
        type: typeId,
        linked: activeResult.linked,
        removed: [], // Will be inferred from the journal
        skipped: activeResult.skipped,
        foreign: activeResult.foreign,
      });
    }

    // Handle CLAUDE.md for claudemd fragment entries
    const claudemdNames = suit.components?.claudemd ?? [];
    const claudeMdFile = claudeMdPath(scope);

    // Use empty string as libraryPath since claudemd references are just names for now
    setFragments(claudemdNames, scope, "");

    // Record the CLAUDE.md change in the journal
    journal.push({
      type: "claudemd-written",
      path: claudeMdFile,
      previousContent: preflightClaudeMd ?? undefined,
    });

    results.push({
      type: "claudemd",
      linked: claudemdNames,
      removed: [],
      skipped: [],
      foreign: [],
    });

    // Handle MCP server entries
    const mcpConfigs = suit.components?.mcp ?? [];
    await activateMcpServers(mcpConfigs, scope, suitName, journal);

    results.push({
      type: "mcp",
      linked: mcpConfigs.map((cfg: unknown) => {
        const c = cfg as Record<string, unknown>;
        return (c.name as string) || "";
      }),
      removed: [],
      skipped: [],
      foreign: [],
    });

    // Handle plugin entries
    const pluginRefs = suit.components?.plugins ?? [];
    await activatePlugins(pluginRefs, scope, suitName, journal);

    results.push({
      type: "plugins",
      linked: pluginRefs as string[],
      removed: [],
      skipped: [],
      foreign: [],
    });

    // Handle hook entries. They were approved before this ran — activation
    // only writes what a human (or an explicit --yes) already signed off on.
    writeApprovedHooks(approvedHooks, scope, suitName, journal);

    results.push({
      type: "hooks",
      linked: approvedHooks.map((hook) => hook.event),
      removed: [],
      skipped: [],
      foreign: [],
    });

    return results;
  } catch (err) {
    // Rollback: reverse the journal in LIFO order
    rollbackJournal(journal);
    throw err;
  }
}

/**
 * Reverses all journal entries in LIFO order (last in, first out).
 */
export function rollbackJournal(journal: JournalEntry[]): void {
  // Process in reverse order
  for (let i = journal.length - 1; i >= 0; i--) {
    const entry = journal[i];

    try {
      if (entry.type === "link-created") {
        // Remove the link we just created
        if (fs.existsSync(entry.path)) {
          fs.unlinkSync(entry.path);
        }
      } else if (entry.type === "link-removed") {
        // Restore the link we removed
        if (entry.previousTarget && !fs.existsSync(entry.path)) {
          fs.symlinkSync(entry.previousTarget, entry.path, "dir");
        }
      } else if (entry.type === "claudemd-written") {
        // Restore the previous content of CLAUDE.md
        if (entry.previousContent !== undefined) {
          fs.mkdirSync(path.dirname(entry.path), { recursive: true });
          fs.writeFileSync(entry.path, entry.previousContent, "utf-8");
        } else if (fs.existsSync(entry.path)) {
          // There was no previous content, so delete the file
          fs.unlinkSync(entry.path);
        }
      } else if (entry.type === "json-entry") {
        // Restore the previous JSON state
        // Canonical paths for the scope this entry was written under.
        // Deriving them from the config file's directory puts the ledger in
        // the user's home root for user scope, and builds an empty ledger
        // that owns nothing — so the restore below would silently no-op.
        const entryScope = entry.scope ?? "user";
        const mg = new ManagedJson(ledgerPath(entryScope), backupsDir(entryScope));
        if (entry.previousValue !== undefined) {
          mg.setEntries(entry.path, [{ jsonPath: entry.jsonPath!, value: entry.previousValue }], "strongsuit");
        } else {
          mg.removeEntries(entry.path, [entry.jsonPath!]);
        }
      }
    } catch {
      // Rollback best-effort: continue with the rest even if one rollback fails
    }
  }
}

/**
 * Deactivates MCP servers that were installed by strongsuit.
 * Removes only the servers recorded in the ledger (not foreign ones).
 * Preserves disabledMcpServers and other user-defined keys untouched.
 */
async function deactivateMcpServers(
  scope: Scope,
  journal: JournalEntry[]
): Promise<void> {
  const configPath = mcpConfigPath(scope);
  if (!fs.existsSync(configPath)) {
    return;
  }

  const ledger = ledgerPath(scope);
  const backups = backupsDir(scope);

  if (scope === "user") {
    // User scope: read ~/.claude.json and find ledgered entries for this project
    const mg = new ManagedJson(ledger, backups);
    const ledgerEntries = mg.getLedgerEntries(configPath);

    // Find all MCP server entries for this project
    const projectPath = process.cwd();
    const pathPrefix = mcpConfigPathForProject(projectPath).join(".");

    for (const entry of ledgerEntries) {
      const entryPath = Array.isArray(entry.jsonPath) ? entry.jsonPath.join(".") : entry.jsonPath;
      if (entryPath.startsWith(pathPrefix + ".servers.")) {
        // This is one of our MCP servers
        const pathArray = Array.isArray(entry.jsonPath) ? entry.jsonPath : (entry.jsonPath as string).split(".");

        // Read current value for rollback — capture what's actually there
        let currentConfig: unknown = {};
        try {
          const content = fs.readFileSync(configPath, "utf-8");
          currentConfig = JSON.parse(content);
        } catch {
          currentConfig = {};
        }

        let currentValue = currentConfig;
        for (const key of pathArray) {
          if (typeof currentValue === "object" && currentValue !== null) {
            currentValue = (currentValue as Record<string, unknown>)[key];
          } else {
            currentValue = undefined;
            break;
          }
        }

        // Record in journal before removal
        journal.push({
          type: "json-entry",
          scope,
          path: configPath,
          jsonPath: pathArray,
          previousValue: currentValue,
        });

        // Remove the server (only those in the ledger, preserving foreign entries)
        mg.removeEntries(configPath, [pathArray]);
      }
    }
  } else {
    // Project scope: read .mcp.json and deactivate all ledgered servers
    const mg = new ManagedJson(ledger, backups);
    const ledgerEntries = mg.getLedgerEntries(configPath);

    for (const entry of ledgerEntries) {
      const pathArray = Array.isArray(entry.jsonPath) ? entry.jsonPath : (entry.jsonPath as string).split(".");

      // Read current value for rollback — capture what's actually there
      let currentConfig: unknown = {};
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, "utf-8");
          currentConfig = JSON.parse(content);
        } catch {
          currentConfig = {};
        }
      }

      let currentValue = currentConfig;
      for (const key of pathArray) {
        if (typeof currentValue === "object" && currentValue !== null) {
          currentValue = (currentValue as Record<string, unknown>)[key];
        } else {
          currentValue = undefined;
          break;
        }
      }

      // Record in journal before removal
      journal.push({
        type: "json-entry",
        scope,
        path: configPath,
        jsonPath: pathArray,
        previousValue: currentValue,
      });

      // Remove the server (only those in the ledger, preserving foreign entries)
      mg.removeEntries(configPath, [pathArray]);
    }
  }
}

/**
 * Activates MCP servers from a suit manifest.
 * Validates each server and writes to the appropriate config file through the ledger.
 * For project scope, prints a workspace-trust notice since servers require approval.
 */
async function activateMcpServers(
  mcpConfigs: unknown[],
  scope: Scope,
  suitName: string,
  journal: JournalEntry[]
): Promise<void> {
  if (mcpConfigs.length === 0) {
    return;
  }

  // Validate all servers first
  const validatedServers = mcpConfigs.map((cfg) => {
    try {
      return validateMcpServer(cfg);
    } catch (err) {
      throw new Error(`Failed to activate MCP servers for suit '${suitName}': ${(err as Error).message}`);
    }
  });

  const configPath = mcpConfigPath(scope);

  if (scope === "user") {
    // User scope: write to ~/.claude.json under per-project nesting
    const projectPath = process.cwd();
    const projectNesting = mcpConfigPathForProject(projectPath);
    const ledger = ledgerPath("user");
    const backups = backupsDir("user");

    const mg = new ManagedJson(ledger, backups);

    // Read current config to capture previous values for rollback
    let currentConfig: unknown = {};
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        currentConfig = JSON.parse(content);
      } catch {
        currentConfig = {};
      }
    }

    // Write all servers to the config file using per-project nesting
    for (const server of validatedServers) {
      const serverPath = [...projectNesting, "servers", server.name];

      // Capture the actual prior value at this path for rollback
      let previousValue: unknown = undefined;
      let current = currentConfig;
      for (const key of serverPath) {
        if (typeof current === "object" && current !== null) {
          current = (current as Record<string, unknown>)[key];
        } else {
          previousValue = undefined;
          break;
        }
      }
      if (current !== undefined) {
        previousValue = current;
      }

      mg.setEntries(configPath, [{ jsonPath: serverPath, value: server }], suitName);

      // Record in journal for rollback — use actual prior value or undefined if absent
      journal.push({
        type: "json-entry",
        scope,
        path: configPath,
        jsonPath: serverPath,
        previousValue,
      });
    }
  } else {
    // Project scope: write to .mcp.json
    const ledger = ledgerPath("project");
    const backups = backupsDir("project");

    const mg = new ManagedJson(ledger, backups);

    // Read current config to capture previous values for rollback
    let currentConfig: unknown = {};
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        currentConfig = JSON.parse(content);
      } catch {
        currentConfig = {};
      }
    }

    // Write all servers to the config file
    for (const server of validatedServers) {
      const serverPath = ["mcpServers", server.name];

      // Capture the actual prior value at this path for rollback
      let previousValue: unknown = undefined;
      let current = currentConfig;
      for (const key of serverPath) {
        if (typeof current === "object" && current !== null) {
          current = (current as Record<string, unknown>)[key];
        } else {
          previousValue = undefined;
          break;
        }
      }
      if (current !== undefined) {
        previousValue = current;
      }

      mg.setEntries(configPath, [{ jsonPath: serverPath, value: server }], suitName);

      // Record in journal for rollback — use actual prior value or undefined if absent
      journal.push({
        type: "json-entry",
        scope,
        path: configPath,
        jsonPath: serverPath,
        previousValue,
      });
    }

    // Print workspace-trust notice for project scope
    console.log(
      chalk.yellow(
        "⚠️  Project-scope MCP servers require Claude Code trust approval before they take effect."
      )
    );
  }
}

/**
 * Deactivates plugins that were installed by strongsuit.
 * Removes only the plugins recorded in the ledger (not foreign ones).
 */
async function deactivatePlugins(
  scope: Scope,
  journal: JournalEntry[]
): Promise<void> {
  const configPath = pluginConfigPath(scope);
  if (!fs.existsSync(configPath)) {
    return;
  }

  const ledger = ledgerPath(scope);
  const backups = backupsDir(scope);

  const mg = new ManagedJson(ledger, backups);
  const ledgerEntries = mg.getLedgerEntries(configPath);
  const pluginPath = enabledPluginsPath();

  // Find all plugin entries in the ledger for this config file
  for (const entry of ledgerEntries) {
    const entryPath = Array.isArray(entry.jsonPath) ? entry.jsonPath : (entry.jsonPath as string).split(".");

    // Check if this is an enabledPlugins entry
    if (
      entryPath.length >= 2 &&
      entryPath[0] === "enabledPlugins"
    ) {
      // Read current value for rollback
      let currentConfig: unknown = {};
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, "utf-8");
          currentConfig = JSON.parse(content);
        } catch {
          currentConfig = {};
        }
      }

      let currentValue: unknown = currentConfig;
      for (const key of entryPath) {
        if (typeof currentValue === "object" && currentValue !== null) {
          currentValue = (currentValue as Record<string, unknown>)[key];
        } else {
          currentValue = undefined;
          break;
        }
      }

      // Record in journal before removal
      journal.push({
        type: "json-entry",
        scope,
        path: configPath,
        jsonPath: entryPath,
        previousValue: currentValue,
      });

      // Remove the plugin entry (only those in the ledger, preserving foreign entries)
      mg.removeEntries(configPath, [entryPath]);
    }
  }
}

/**
 * Activates plugins from a suit manifest.
 * Validates each plugin reference and writes to enabledPlugins through the ledger.
 */
async function activatePlugins(
  pluginRefs: unknown[],
  scope: Scope,
  suitName: string,
  journal: JournalEntry[]
): Promise<void> {
  if (pluginRefs.length === 0) {
    return;
  }

  // Validate every reference before touching anything
  const specs = pluginRefs.map((entry) => {
    try {
      return parsePluginEntry(entry);
    } catch (err) {
      throw new Error(
        `Failed to activate plugins for suit '${suitName}': ${(err as Error).message}`
      );
    }
  });

  // Install anything missing before the toggle. Each outcome names what it
  // left behind, so a failure half-way through reports the exact state and
  // how to undo it instead of a bare stack trace.
  for (const spec of specs) {
    const outcome = ensurePluginInstalled(spec);
    if (!installSucceeded(outcome)) {
      const undo = outcome.undo ? `\nTo undo: ${outcome.undo}` : "";
      throw new Error(
        `Failed to activate plugins for suit '${suitName}': ${outcome.message}${undo}`
      );
    }
    if (outcome.state !== "already-installed") {
      console.log(chalk.dim(outcome.message));
    }
  }

  const validatedPlugins = specs.map((spec) => spec.ref);

  const configPath = pluginConfigPath(scope);
  const ledger = ledgerPath(scope);
  const backups = backupsDir(scope);

  // Ensure directories exist
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const mg = new ManagedJson(ledger, backups);

  // Read current config to capture previous values for rollback
  let currentConfig: unknown = {};
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      currentConfig = JSON.parse(content);
    } catch {
      currentConfig = {};
    }
  }

  // enabledPlugins is an array in settings.json
  // Each plugin is a string entry like "plugin@marketplace"
  const pluginsPath = enabledPluginsPath();

  for (const plugin of validatedPlugins) {
    // Each plugin entry is stored at ["enabledPlugins", index, plugin.fullRef]
    // But since we're managing individual entries in a managed way, store by full ref
    const entryPath = [...pluginsPath, plugin.fullRef];

    // Capture the actual prior value at this path for rollback
    let previousValue: unknown = undefined;
    let current = currentConfig;
    for (const key of entryPath) {
      if (typeof current === "object" && current !== null) {
        current = (current as Record<string, unknown>)[key];
      } else {
        previousValue = undefined;
        break;
      }
    }
    if (current !== undefined) {
      previousValue = current;
    }

    // Mark this plugin as enabled
    mg.setEntries(configPath, [{ jsonPath: entryPath, value: true }], suitName);

    // Record in journal for rollback
    journal.push({
      type: "json-entry",
      scope,
      path: configPath,
      jsonPath: entryPath,
      previousValue,
    });
  }
}

/**
 * Puts every component of the suit in front of the user and returns what
 * survived review.
 *
 * Runs before the spinner starts and before anything is written: components
 * can run code, and nothing about them may be decided while a progress
 * animation is covering the terminal.
 */
async function reviewSuit(
  suitName: string,
  scope: Scope,
  options: UpOptions
): Promise<{ reviewed: SuitManifest; hooks: HookEntry[] }> {
  const suit = loadSuit(suitName);
  const plan = buildReviewPlan(suit, scope);
  if (plan.length === 0) return { reviewed: suit, hooks: [] };

  // The lock first. A component whose content still matches its pin was
  // already approved in exactly this form — activating it silently is the
  // point of pinning. A component that no longer matches is blocked: upstream
  // drift and local tamper look identical here, deliberately.
  const verified = verifyAgainstLock(suitName, plan);
  const decisions: Decision[] = [];
  const needReview = [];

  const trustedLocal: typeof plan = [];
  for (const entry of verified) {
    if (entry.state === "unchanged") {
      decisions.push({ item: entry.item, approved: true });
    } else if (entry.state === "changed") {
      console.log(
        chalk.red(
          `\n⛔ ${entry.item.type}: ${entry.item.id} has changed since it was approved.`
        )
      );
      console.log(driftDiff(entry.pinned!.detail, entry.item.detail));
      if (options.yes) {
        // --yes never re-approves drifted content; that is what it drifted from.
        decisions.push({ item: entry.item, approved: false });
      } else {
        needReview.push(entry.item);
      }
    } else {
      // Unpinned = local provenance. Pins exist only for content that came
      // through install/sync review; everything else was put here by the
      // user — init adoption, suit import, a hand-written manifest. Review
      // guards the remote boundary; it does not gate the user's own files,
      // and local content is deliberately NOT pinned so editing your own
      // skills never triggers a drift block.
      trustedLocal.push(entry.item);
      decisions.push({ item: entry.item, approved: true });
    }
  }

  if (trustedLocal.length > 0) {
    console.log(
      chalk.gray(
        `${trustedLocal.length} local component(s) activated without review — review applies to remote installs (suit install/sync).`
      )
    );
    for (const item of trustedLocal) {
      if (item.type === "hooks") {
        // Disclosure survives the trust rule: a hook's full command is
        // always printed before it can run.
        console.log(chalk.yellow(`  hook ${item.id}: ${item.detail}`));
      }
    }
  }

  // Only genuinely reviewed items are recorded and (re)pinned. Trusted-local
  // approvals must stay OUT of the lock: pinning them would drift-block the
  // user's next edit to their own file.
  let reviewedDecisions: Decision[] = [];
  if (needReview.length > 0) {
    reviewedDecisions = await reviewComponents(needReview, {
      yes: options.yes,
      approveCodeExecution: options.approveCodeExecution,
    });
    decisions.push(...reviewedDecisions);
  }
  if (reviewedDecisions.length > 0) {
    recordDecisions(suitName, reviewedDecisions);
    pinSuit(suitName, reviewedDecisions);
  }

  const reviewed = filterApproved(suit, decisions);
  const hooks = (reviewed.components?.hooks ?? []).map((entry) => validateHook(entry));

  if (decisions.some((decision) => !decision.approved)) {
    console.log(summarize(decisions));
  }

  return { reviewed, hooks };
}

/** Writes approved hooks through the ledger, journalling every change. */
function writeApprovedHooks(
  approved: HookEntry[],
  scope: Scope,
  suitName: string,
  journal: JournalEntry[]
): void {
  if (approved.length === 0) return;

  const file = settingsPath(scope);
  const managed = new ManagedJson(ledgerPath(scope), backupsDir(scope));

  const record = (write: { jsonPath: string[]; previousValue: unknown }) => {
    journal.push({
      type: "json-entry",
      scope,
      path: file,
      jsonPath: write.jsonPath,
      previousValue: write.previousValue,
    });
  };

  // Clear what this scope already owns first. Without it, switching from a
  // suit that hooks PreToolUse to one that only hooks Stop would leave the
  // old suit's hook running.
  for (const write of deactivateHooks(scope, managed)) record(write);
  for (const write of activateHooks(approved, scope, suitName, managed)) record(write);

  const notice = disabledNotice(scope);
  if (notice) console.log(notice);
}

export async function runUp(
  suitName: string,
  scope: Scope,
  options: UpOptions = {}
): Promise<void> {
  if (!suitExists(suitName)) {
    const available = listSuits();
    if (available.length > 0) {
      throw new Error(`No suit named '${suitName}'. Available: ${available.join(", ")}`);
    }
    const advice = onboardingAdvice(scope) ?? [];
    throw new Error(["No suits defined yet.", ...advice].join("\n"));
  }

  const spinner = ora(`Activating suit "${suitName}"...`);
  const journal: JournalEntry[] = [];

  try {
    // Review happens before the spinner so the prompts are not drawn over.
    const { reviewed, hooks: approvedHooks } = await reviewSuit(suitName, scope, options);
    spinner.start();
    const results = await activateWithRollback(suitName, scope, journal, reviewed, approvedHooks);

    // Claude Code's /skills panel toggles ("skillOverrides") beat symlink
    // presence — a linked skill stays unloaded while its override says off.
    // The user naming this suit is the consent to flip their own toggle.
    const linkedSkills = results.find((r) => r.type === "skills")?.linked ?? [];
    const clearedOverrides = clearOffOverrides(linkedSkills, scope);
    if (clearedOverrides.length > 0) {
      console.log(
        chalk.yellow(
          `  ⚠ cleared Claude Code /skills "off" toggles for: ${clearedOverrides.join(", ")} — activation wins over the old panel state.`
        )
      );
    }

    // Report per-type summary
    const summaryLines: string[] = [];
    for (const result of results) {
      if (result.linked.length > 0) {
        summaryLines.push(
          `  ${chalk.green("✓")} ${result.type}: ${result.linked.join(", ")}`
        );
      }
      if (result.skipped.length > 0) {
        summaryLines.push(
          `  ${chalk.yellow("⊘")} ${result.type} skipped: ${result.skipped.join(", ")}`
        );
      }
      if (result.foreign.length > 0) {
        summaryLines.push(
          `  ${chalk.dim("→")} ${result.type} foreign (${result.foreign.length}): ${result.foreign.slice(0, 3).join(", ")}${result.foreign.length > 3 ? "..." : ""}`
        );
      }
    }

    spinner.succeed(
      `Suit "${suitName}" activated (${scope}):\n${summaryLines.join("\n")}`
    );

    // Print session note
    console.log(
      chalk.dim(
        "\n💡 Session note: New Claude sessions will pick up this activation. Already-running sessions keep their previous activation."
      )
    );
  } catch (err) {
    spinner.fail(`Failed to activate suit: ${(err as Error).message}`);
    console.log(chalk.yellow("Rolled back all changes."));
    process.exitCode = 1;
  }
}

export async function runOff(scope: Scope): Promise<void> {
  const spinner = ora("Deactivating all managed entries...").start();
  const journal: JournalEntry[] = [];

  try {
    // Pre-flight: capture the state of all directories
    const preflightState = new Map<string, Map<string, CapturedLink>>();
    for (const type of Object.values(ARTIFACT_TYPES)) {
      const activeDir = type.activeDirForScope(scope);
      preflightState.set(type.id, captureDirectoryState(activeDir));
    }

    // Deactivate all artifact types
    for (const type of Object.values(ARTIFACT_TYPES)) {
      const libraryDir = libraryPathForType(type);
      // A fresh home only has the skills library; realpath on a missing
      // directory throws and takes the whole activation down with it.
      fs.mkdirSync(libraryDir, { recursive: true });
      const libReal = fs.realpathSync(libraryDir);
      const activeDir = type.activeDirForScope(scope);

      // Get what was there before for this type
      const beforeState = preflightState.get(type.id) || new Map();

      const activeResult = activateOnlyFor(type, [], scope, libraryDir);

      // Record all links that were removed (for rollback)
      for (const [entryName, previous] of beforeState) {
        if (
          previous &&
          !activeResult.foreign.includes(entryName)
        ) {
          // This was a managed link that was removed. Journal the raw link
          // text: the captured value is an object, and passing it whole made
          // the symlink call in rollbackJournal throw into its catch, so
          // `suit off` could never restore anything it removed.
          const linkPath = path.join(activeDir, entryName);
          journal.push({
            type: "link-removed",
            path: linkPath,
            previousTarget: previous.raw,
          });
        }
      }
    }

    // Clear CLAUDE.md
    const claudeMdFile = claudeMdPath(scope);
    const previousContent = fs.existsSync(claudeMdFile)
      ? fs.readFileSync(claudeMdFile, "utf-8")
      : undefined;

    setFragments([], scope, "");

    journal.push({
      type: "claudemd-written",
      path: claudeMdFile,
      previousContent,
    });

    // Deactivate MCP servers
    await deactivateMcpServers(scope, journal);

    // Deactivate plugins
    await deactivatePlugins(scope, journal);

    // Deactivate hooks — only the events this scope's ledger owns
    const hookManaged = new ManagedJson(ledgerPath(scope), backupsDir(scope));
    for (const write of deactivateHooks(scope, hookManaged)) {
      journal.push({
        type: "json-entry",
        scope,
        path: settingsPath(scope),
        jsonPath: write.jsonPath,
        previousValue: write.previousValue,
      });
    }

    spinner.succeed(`All managed entries deactivated (${scope})`);

    // Print session note
    console.log(
      chalk.dim(
        "\n💡 Session note: New Claude sessions will have no suit active. Already-running sessions keep their previous activation."
      )
    );
  } catch (err) {
    spinner.fail(`Failed to deactivate: ${(err as Error).message}`);
    console.log(chalk.yellow("Rolled back all changes."));
    rollbackJournal(journal);
    process.exitCode = 1;
  }
}
