import os from "node:os";
import path from "node:path";

/**
 * Root of the Claude home dir. Overridable via AGENTSUIT_HOME for
 * testing/CI so nothing touches a real ~/.claude by accident.
 */
export const CLAUDE_HOME =
  process.env.AGENTSUIT_HOME ?? path.join(os.homedir(), ".claude");

export function activeSkillsDir(scope: "user" | "project"): string {
  return scope === "project"
    ? path.join(process.cwd(), ".claude", "skills")
    : path.join(CLAUDE_HOME, "skills");
}

export const AGENTSUIT_DIR = path.join(CLAUDE_HOME, "agentsuit");
export const LIBRARY_DIR = path.join(AGENTSUIT_DIR, "library");
export const SUITS_DIR = path.join(AGENTSUIT_DIR, "suits");
export const SETS_FILE = path.join(AGENTSUIT_DIR, "sets.json");
