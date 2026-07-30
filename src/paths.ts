import os from "node:os";
import path from "node:path";

/**
 * Root of the Claude home dir. Overridable via STRONGSUIT_HOME for
 * testing/CI so nothing touches a real ~/.claude by accident.
 */
export const CLAUDE_HOME =
  process.env.STRONGSUIT_HOME ?? path.join(os.homedir(), ".claude");

export function activeSkillsDir(scope: "user" | "project"): string {
  return scope === "project"
    ? path.join(process.cwd(), ".claude", "skills")
    : path.join(CLAUDE_HOME, "skills");
}

export const STRONGSUIT_DIR = path.join(CLAUDE_HOME, "strongsuit");
export const LIBRARY_DIR = path.join(STRONGSUIT_DIR, "library");
export const SUITS_DIR = path.join(STRONGSUIT_DIR, "suits");
export const SETS_FILE = path.join(STRONGSUIT_DIR, "sets.json");

/** Ledger path for tracking MCP server and other managed JSON writes. */
export function ledgerPath(scope: "user" | "project"): string {
  const root = scope === "user" ? STRONGSUIT_DIR : path.join(process.cwd(), ".claude", "strongsuit");
  return path.join(root, "ledger.json");
}

/** Backups directory for managed JSON files. */
export function backupsDir(scope: "user" | "project"): string {
  const root = scope === "user" ? STRONGSUIT_DIR : path.join(process.cwd(), ".claude", "strongsuit");
  return path.join(root, "backups");
}

