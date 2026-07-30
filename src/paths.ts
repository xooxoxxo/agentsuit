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

/**
 * Returns all managed paths under the CLAUDE_HOME root for user scope.
 * Used by G3 path-containment guard to verify nothing escapes the temp home.
 * Project-scoped paths (CWD-relative) are legitimately outside CLAUDE_HOME.
 */
export function allManagedPaths(scope: "user" | "project"): string[] {
  if (scope === "project") {
    // Project-scoped paths are in .claude inside the project, not in CLAUDE_HOME
    return [];
  }

  const paths = [
    CLAUDE_HOME,
    AGENTSUIT_DIR,
    LIBRARY_DIR,
    SUITS_DIR,
    SETS_FILE,
    activeSkillsDir(scope),
    path.join(CLAUDE_HOME, "CLAUDE.md"),
    // Artifact type library sections
    path.join(AGENTSUIT_DIR, "library", "commands"),
    path.join(AGENTSUIT_DIR, "library", "agents"),
    path.join(AGENTSUIT_DIR, "library", "rules"),
    // Artifact type active dirs
    path.join(CLAUDE_HOME, "commands"),
    path.join(CLAUDE_HOME, "agents"),
    path.join(CLAUDE_HOME, "rules"),
  ];

  return paths;
}
