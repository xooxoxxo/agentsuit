import type { Scope } from "./activate.js";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CLAUDE_HOME } from "./paths.js";

/**
 * Plugin reference: `plugin@marketplace` format
 */
export interface PluginRef {
  /** Plugin identifier (e.g., "vscode-integration") */
  plugin: string;
  /** Marketplace (e.g., "marketplace") */
  marketplace: string;
  /** Full reference string */
  fullRef: string;
}

/**
 * Validates and parses a plugin reference in the form "plugin@marketplace".
 * @throws Error with actionable message if validation fails
 */
export function parsePluginRef(ref: unknown): PluginRef {
  if (typeof ref !== "string") {
    throw new Error(
      `Invalid plugin reference: must be a string in the form 'plugin@marketplace' (got ${typeof ref})`
    );
  }

  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error(
      "Invalid plugin reference: must be a non-empty string"
    );
  }

  const parts = trimmed.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid plugin reference '${trimmed}': must be in the form 'plugin@marketplace' (e.g., 'vscode-integration@marketplace')`
    );
  }

  const [plugin, marketplace] = parts;
  return {
    plugin,
    marketplace,
    fullRef: trimmed,
  };
}

/**
 * Returns the config file path for enabledPlugins at the given scope.
 * - user: ~/.claude/settings.json (in CLAUDE_HOME)
 * - project: .claude/settings.json at project root
 */
export function pluginConfigPath(scope: Scope): string {
  if (scope === "project") {
    return path.join(process.cwd(), ".claude", "settings.json");
  }
  // user scope: ~/.claude/settings.json
  return path.join(CLAUDE_HOME, "settings.json");
}

/**
 * Returns the JSON path to enabledPlugins in the settings file.
 */
export function enabledPluginsPath(): string[] {
  return ["enabledPlugins"];
}

/**
 * A plugin as named by a suit: the reference, plus optionally where its
 * marketplace comes from so an unknown marketplace can be added.
 */
export interface PluginSpec {
  ref: PluginRef;
  /** Marketplace source (GitHub repo, URL or path) for `claude plugin marketplace add`. */
  source?: string;
}

/**
 * Accepts either `"plugin@marketplace"` or
 * `{ ref: "plugin@marketplace", marketplace: "owner/repo" }`.
 */
export function parsePluginEntry(entry: unknown): PluginSpec {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    if (!("ref" in obj)) {
      throw new Error(
        "Invalid plugin entry: object form requires a 'ref' field (e.g. {ref: 'x@y', marketplace: 'owner/repo'})"
      );
    }
    if ("marketplace" in obj && typeof obj.marketplace !== "string") {
      throw new Error(
        `Invalid plugin entry '${String(obj.ref)}': field 'marketplace' must be a string or omitted`
      );
    }
    return {
      ref: parsePluginRef(obj.ref),
      ...(obj.marketplace !== undefined ? { source: obj.marketplace as string } : {}),
    };
  }
  return { ref: parsePluginRef(entry) };
}

/** Result of running one command. */
export interface CommandResult {
  status: number;
  stdout: string;
}

/** Runs a command and reports its exit status and output. */
export type CommandRunner = (bin: string, args: string[]) => CommandResult;

function spawnRunner(bin: string, args: string[]): CommandResult {
  const result = spawnSync(bin, args, { encoding: "utf-8" });
  return {
    status: result.status ?? 1,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

let commandRunner: CommandRunner = spawnRunner;

/** Replaces the command runner. Pass null to restore the real one. */
export function setPluginCommandRunner(runner: CommandRunner | null): void {
  commandRunner = runner ?? spawnRunner;
}

/** Every state `ensurePluginInstalled` can end in. */
export type InstallState =
  | "already-installed"
  | "installed"
  | "marketplace-added-and-installed"
  | "marketplace-unknown"
  | "marketplace-add-failed"
  | "install-failed"
  | "install-failed-after-marketplace-add";

export interface InstallOutcome {
  state: InstallState;
  ref: string;
  /** What happened, in a form worth printing verbatim. */
  message: string;
  /** Command that undoes any change already made. Absent when nothing changed. */
  undo?: string;
}

const OK_STATES: InstallState[] = [
  "already-installed",
  "installed",
  "marketplace-added-and-installed",
];

/** True when the outcome left the plugin usable. */
export function installSucceeded(outcome: InstallOutcome): boolean {
  return OK_STATES.includes(outcome.state);
}

/**
 * Makes sure a plugin is installed, adding its marketplace first if needed.
 *
 * Every failure returns rather than throws, and names both what was left
 * behind and the command that undoes it — a half-finished install is the
 * normal case here, not an exceptional one, and the caller has to be able to
 * report it precisely.
 */
export function ensurePluginInstalled(spec: PluginSpec, bin = "claude"): InstallOutcome {
  const ref = spec.ref.fullRef;

  const listed = commandRunner(bin, ["plugin", "list"]);
  if (listed.status === 0 && listed.stdout.includes(ref)) {
    return { state: "already-installed", ref, message: `${ref} is already installed.` };
  }

  let marketplaceAdded = false;
  const marketplaces = commandRunner(bin, ["plugin", "marketplace", "list"]);
  const marketplaceKnown =
    marketplaces.status === 0 && marketplaces.stdout.includes(spec.ref.marketplace);

  if (!marketplaceKnown) {
    if (!spec.source) {
      return {
        state: "marketplace-unknown",
        ref,
        message:
          `Marketplace '${spec.ref.marketplace}' is not configured and the suit does not say where it comes from. ` +
          `Add it by hand, or give the entry a marketplace source: {ref: '${ref}', marketplace: 'owner/repo'}.`,
      };
    }

    const added = commandRunner(bin, ["plugin", "marketplace", "add", spec.source]);
    if (added.status !== 0) {
      return {
        state: "marketplace-add-failed",
        ref,
        message:
          `\`${bin} plugin marketplace add ${spec.source}\` failed (exit ${added.status}). Nothing was changed.\n` +
          added.stdout.trim(),
      };
    }
    marketplaceAdded = true;
  }

  const installed = commandRunner(bin, ["plugin", "install", ref]);
  if (installed.status !== 0) {
    return marketplaceAdded
      ? {
          state: "install-failed-after-marketplace-add",
          ref,
          message:
            `Marketplace '${spec.ref.marketplace}' was added, then \`${bin} plugin install ${ref}\` failed ` +
            `(exit ${installed.status}). The marketplace is still configured.\n${installed.stdout.trim()}`,
          undo: `${bin} plugin marketplace remove ${spec.ref.marketplace}`,
        }
      : {
          state: "install-failed",
          ref,
          message: `\`${bin} plugin install ${ref}\` failed (exit ${installed.status}). Nothing was changed.\n${installed.stdout.trim()}`,
        };
  }

  return marketplaceAdded
    ? {
        state: "marketplace-added-and-installed",
        ref,
        message: `Added marketplace '${spec.ref.marketplace}' and installed ${ref}.`,
      }
    : { state: "installed", ref, message: `Installed ${ref}.` };
}
