import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getArtifactType, libraryPathForType } from "./artifact-types.js";
import { CLAUDE_HOME } from "./paths.js";
import { validateMcpServer } from "./mcp.js";
import { validateHook, toSettingsGroup, type HookEntry } from "./hooks.js";
import type { SuitManifest } from "./suits.js";

/**
 * Materializes a suit as an ephemeral plugin directory for one Claude Code
 * session (`--plugin-dir`), plus the session's MCP config for
 * `--strict-mcp-config` and a settings file when the suit carries hooks.
 *
 * Everything lives in a throwaway dir under the OS temp root — never inside
 * ~/.claude — and the plugin's entries are symlinks into the library, so
 * materializing costs a few symlink() calls and deleting the dir leaves the
 * library untouched. Measured foundation: docs/session-isolation.md claims
 * 8/10 (plugin-dir delivers skills per session; entries may be symlinks).
 */

/** Distinctive prefix so the sweeper can identify our dirs and only ours. */
const RUN_PREFIX = "strongsuit-run-";

/** Component types a plugin directory can deliver as symlinks. */
const PLUGIN_FILE_TYPES = ["skills", "commands", "agents"] as const;

export interface Materialized {
  /** The plugin directory itself — pass as `--plugin-dir <root>`. */
  root: string;
  /** Always emitted (empty mcpServers when the suit has none) so strict replacement is deterministic. */
  mcpConfigFile: string;
  /** Only when the suit carries hooks. */
  settingsFile?: string;
  /** Ready-to-splice claude flags. */
  flags: string[];
  /** Component types the plugin layout cannot deliver per session. */
  skipped: string[];
}

/**
 * Temp root for materialized suits. Overridable via STRONGSUIT_TMP so tests
 * never write to the shared OS temp dir. Read at call time, not module load,
 * so tests don't need the resetModules dance paths.ts requires.
 */
export function materializeTmpRoot(): string {
  return process.env.STRONGSUIT_TMP ?? os.tmpdir();
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "suit";
}

/** Deterministic per-process dir: same suit + same process → same path. */
export function materializedDirFor(suitName: string, pid: number = process.pid): string {
  return path.join(materializeTmpRoot(), `${RUN_PREFIX}${sanitize(suitName)}-${pid}`);
}

/**
 * Resolve a library entry for a file component. Entries are dirs (skills) or
 * either dirs or single .md files (commands, agents).
 * @throws when the entry does not exist or is a broken symlink — a session
 * silently missing a skill is worse than a refusal to launch.
 */
function resolveLibraryEntry(type: (typeof PLUGIN_FILE_TYPES)[number], name: string): { source: string; basename: string } {
  const libDir = libraryPathForType(getArtifactType(type));
  for (const basename of [name, `${name}.md`]) {
    const candidate = path.join(libDir, basename);
    if (!fs.existsSync(candidate)) continue; // existsSync follows symlinks: broken link fails here
    return { source: candidate, basename };
  }
  throw new Error(`Cannot materialize ${type}/${name}: not found in library (${libDir})`);
}

export function materializeSuit(suit: SuitManifest, pid: number = process.pid): Materialized {
  const root = materializedDirFor(suit.name, pid);
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot === path.resolve(CLAUDE_HOME) || resolvedRoot.startsWith(path.resolve(CLAUDE_HOME) + path.sep)) {
    throw new Error(`Refusing to materialize inside the Claude home: ${root}`);
  }

  // Same suit re-materialized by the same process: replace the previous dir.
  fs.rmSync(root, { recursive: true, force: true });
  try {
    return buildMaterialized(root, suit);
  } catch (err) {
    // A half-built plugin dir must not outlive the failure.
    fs.rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

function buildMaterialized(root: string, suit: SuitManifest): Materialized {
  fs.mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify(
      { name: `${RUN_PREFIX}${sanitize(suit.name)}`, description: `Ephemeral materialization of suit '${suit.name}'` },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const components = suit.components ?? {};

  for (const type of PLUGIN_FILE_TYPES) {
    const names = components[type] ?? [];
    if (names.length === 0) continue;
    const typeDir = path.join(root, type);
    fs.mkdirSync(typeDir, { recursive: true });
    for (const name of names) {
      const { source, basename } = resolveLibraryEntry(type, name);
      fs.symlinkSync(source, path.join(typeDir, basename));
    }
  }

  const skipped: string[] = [];
  if ((components.rules ?? []).length > 0) skipped.push("rules");
  if ((components.claudemd ?? []).length > 0) skipped.push("claudemd");
  if ((components.plugins ?? []).length > 0) skipped.push("plugins");

  // MCP config — always written, empty or not, so `--strict-mcp-config` gives
  // the session exactly the suit's servers (or none) on every launch.
  const mcpServers: Record<string, unknown> = {};
  for (const entry of components.mcp ?? []) {
    const { name, ...rest } = validateMcpServer(entry);
    mcpServers[name] = rest;
  }
  const mcpConfigFile = path.join(root, "mcp.json");
  fs.writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers }, null, 2) + "\n", "utf8");

  // Hooks → settings file for `--settings`.
  let settingsFile: string | undefined;
  const hookEntries = (components.hooks ?? []).map((h) => validateHook(h));
  if (hookEntries.length > 0) {
    const hooks: Record<string, unknown[]> = {};
    for (const hook of hookEntries) {
      (hooks[hook.event] ??= []).push(toSettingsGroup(hook as HookEntry));
    }
    settingsFile = path.join(root, "settings.json");
    fs.writeFileSync(settingsFile, JSON.stringify({ hooks }, null, 2) + "\n", "utf8");
  }

  const flags = [
    "--plugin-dir",
    root,
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfigFile,
    ...(settingsFile ? ["--settings", settingsFile] : []),
  ];

  return { root, mcpConfigFile, settingsFile, flags, skipped };
}

/**
 * Remove a materialized dir. Refuses anything that is not directly under the
 * temp root with our prefix — this function must never be usable to delete an
 * arbitrary path.
 */
export function cleanupMaterialized(root: string): void {
  const resolved = path.resolve(root);
  const tmp = path.resolve(materializeTmpRoot());
  if (path.dirname(resolved) !== tmp || !path.basename(resolved).startsWith(RUN_PREFIX)) {
    throw new Error(`Refusing to remove non-materialized path: ${root}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

/** Best-effort removal when this process exits. */
export function registerExitCleanup(root: string): void {
  process.on("exit", () => {
    try {
      cleanupMaterialized(root);
    } catch {
      /* exit handler: nothing useful to do */
    }
  });
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Remove materialized dirs left behind by crashed runs: our prefix, a pid
 * suffix, and that pid no longer alive. Never touches the current process's
 * dirs. Returns the paths removed.
 */
export function sweepStaleMaterialized(isAlive: (pid: number) => boolean = pidIsAlive): string[] {
  const tmp = materializeTmpRoot();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tmp, { withFileTypes: true });
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^strongsuit-run-.+-(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid === process.pid || isAlive(pid)) continue;
    const full = path.join(tmp, entry.name);
    fs.rmSync(full, { recursive: true, force: true });
    removed.push(full);
  }
  return removed;
}
