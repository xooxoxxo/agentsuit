import os from "node:os";
import path from "node:path";

/**
 * Root of the Claude home dir. Overridable via CLAUDE_SKILLSETS_HOME for
 * testing/CI so nothing touches a real ~/.claude by accident.
 */
export const CLAUDE_HOME =
  process.env.CLAUDE_SKILLSETS_HOME ?? path.join(os.homedir(), ".claude");

export function activeSkillsDir(scope: "user" | "project"): string {
  return scope === "project"
    ? path.join(process.cwd(), ".claude", "skills")
    : path.join(CLAUDE_HOME, "skills");
}

export const SKILLSETS_DIR = path.join(CLAUDE_HOME, "skillsets");
export const LIBRARY_DIR = path.join(SKILLSETS_DIR, "library");
export const SETS_FILE = path.join(SKILLSETS_DIR, "sets.json");
