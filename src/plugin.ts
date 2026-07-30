import type { Scope } from "./activate.js";
import path from "node:path";
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
