import path from "node:path";
import {
  CLAUDE_HOME,
  STRONGSUIT_DIR,
  LIBRARY_DIR,
  SUITS_DIR,
  SETS_FILE,
  ledgerPath,
  backupsDir,
} from "./paths.js";
import { ARTIFACT_TYPES, libraryPathForType } from "./artifact-types.js";
import { claudeMdPath } from "./claudemd.js";
import { pluginConfigPath } from "./plugin.js";
import { settingsPath } from "./hooks.js";
import { initBackupsDir } from "./backup.js";
import { quarantineRoot } from "./install.js";

/**
 * Every filesystem location the tool may read or write for a scope.
 *
 * Derived from the artifact-type registry rather than restated here, so the
 * containment guard exercises the same path arithmetic the commands use. A
 * type that computes its directory without going through CLAUDE_HOME shows up
 * as a violation instead of passing unnoticed. Lives outside paths.ts because
 * the registry imports from it.
 */
export function allManagedPaths(scope: "user" | "project"): string[] {
  const paths: string[] = [];

  if (scope === "user") {
    paths.push(CLAUDE_HOME, STRONGSUIT_DIR, LIBRARY_DIR, SUITS_DIR, SETS_FILE);
    // Ledger and backups for managed JSON config surfaces — derived from paths.ts
    paths.push(ledgerPath("user"));
    paths.push(backupsDir("user"));
  } else {
    // Project scope also has ledger and backups
    paths.push(ledgerPath("project"));
    paths.push(backupsDir("project"));
  }

  for (const type of Object.values(ARTIFACT_TYPES)) {
    paths.push(type.activeDirForScope(scope));
    if (scope === "user") paths.push(libraryPathForType(type));
  }

  paths.push(claudeMdPath(scope));
  // Plugin config paths (settings.json) for managed enabledPlugins entries
  paths.push(pluginConfigPath(scope));
  // Hook entries live in the same settings file. Enumerated through its own
  // helper rather than assumed equal to the plugin one, so a change to either
  // is caught by the containment guard instead of by a mutation that has to be
  // executed — and executing a path-redirection mutant writes to the real
  // config before any test can report it.
  paths.push(settingsPath(scope));
  // Init snapshots — restore's source of truth, so its location is guarded too.
  if (scope === "user") paths.push(initBackupsDir("user"));
  // Quarantine — remote bytes live only here until reviewed.
  if (scope === "user") paths.push(quarantineRoot());

  return paths;
}

/** Paths that must sit inside CLAUDE_HOME: user scope only. */
export function containedPaths(): string[] {
  return allManagedPaths("user").map((p) => path.resolve(p));
}
