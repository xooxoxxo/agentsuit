import path from "node:path";
import { CLAUDE_HOME, AGENTSUIT_DIR } from "./paths.js";

/**
 * Artifact type definition for file-based, symlinkable artifact types.
 * Each type has a library section and per-scope active directories.
 */
export interface ArtifactType {
  /** Type key: "skills", "commands", "agents", "rules" */
  id: "skills" | "commands" | "agents" | "rules";
  /** Display name */
  label: string;
  /** Directory under library root where this type's entries live */
  librarySection: string;
  /** Function to compute active directory for user or project scope */
  activeDirForScope: (scope: "user" | "project") => string;
  /** Expected metadata file: SKILL.md, COMMAND.md, etc. */
  metadataFile: string;
}

const SKILLS_TYPE: ArtifactType = {
  id: "skills",
  label: "Skills",
  // Skills are special: they live flat in library/, not library/skills/
  librarySection: "library",
  activeDirForScope: (scope) =>
    scope === "project"
      ? path.join(process.cwd(), ".claude", "skills")
      : path.join(CLAUDE_HOME, "skills"),
  metadataFile: "SKILL.md",
};

const COMMANDS_TYPE: ArtifactType = {
  id: "commands",
  label: "Commands",
  librarySection: path.join("library", "commands"),
  activeDirForScope: (scope) =>
    scope === "project"
      ? path.join(process.cwd(), ".claude", "commands")
      : path.join(CLAUDE_HOME, "commands"),
  metadataFile: "COMMAND.md",
};

const AGENTS_TYPE: ArtifactType = {
  id: "agents",
  label: "Agents",
  librarySection: path.join("library", "agents"),
  activeDirForScope: (scope) =>
    scope === "project"
      ? path.join(process.cwd(), ".claude", "agents")
      : path.join(CLAUDE_HOME, "agents"),
  metadataFile: "AGENT.md",
};

const RULES_TYPE: ArtifactType = {
  id: "rules",
  label: "Rules",
  librarySection: path.join("library", "rules"),
  activeDirForScope: (scope) =>
    scope === "project"
      ? path.join(process.cwd(), ".claude", "rules")
      : path.join(CLAUDE_HOME, "rules"),
  metadataFile: "RULE.md",
};

/** All artifact types that support file-based symlinking */
export const ARTIFACT_TYPES: Record<string, ArtifactType> = {
  skills: SKILLS_TYPE,
  commands: COMMANDS_TYPE,
  agents: AGENTS_TYPE,
  rules: RULES_TYPE,
};

/**
 * Get artifact type by id
 */
export function getArtifactType(
  id: "skills" | "commands" | "agents" | "rules"
): ArtifactType {
  const type = ARTIFACT_TYPES[id];
  if (!type) throw new Error(`Unknown artifact type: ${id}`);
  return type;
}

/**
 * Get library path (under AGENTSUIT_DIR) for a given type
 */
export function libraryPathForType(type: ArtifactType): string {
  return path.join(AGENTSUIT_DIR, type.librarySection);
}
