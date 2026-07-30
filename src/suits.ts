import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { SUITS_DIR } from "./paths.js";

/** Suit manifest schema */
export interface SuitManifest {
  name: string;
  description?: string;
  components?: {
    skills?: string[];
    commands?: string[];
    agents?: string[];
    rules?: string[];
    claudemd?: string[];
    mcp?: object[];
    plugins?: string[];
    hooks?: object[];
  };
}

/**
 * List all suit names (directories in SUITS_DIR).
 */
export function listSuits(): string[] {
  fs.mkdirSync(SUITS_DIR, { recursive: true });
  if (!fs.existsSync(SUITS_DIR)) return [];

  try {
    return fs
      .readdirSync(SUITS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Check if a suit exists.
 */
export function suitExists(name: string): boolean {
  const suitDir = path.join(SUITS_DIR, name);
  return fs.existsSync(suitDir) && fs.statSync(suitDir).isDirectory();
}

/**
 * Load a suit manifest by name.
 * @throws Error if the suit directory doesn't exist, or if the YAML is malformed
 */
export function loadSuit(name: string): SuitManifest {
  const suitDir = path.join(SUITS_DIR, name);
  const manifestPath = path.join(suitDir, "suit.yaml");

  if (!fs.existsSync(suitDir)) {
    throw new Error(`Suit directory not found: ${suitDir}`);
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Suit manifest not found: ${manifestPath}`);
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = parse(raw) as SuitManifest;

    // Validate manifest structure
    validateManifest(manifest, manifestPath);

    return manifest;
  } catch (err) {
    // If it's our validation error, re-throw
    if (err instanceof Error && err.message.includes("Validation error")) {
      throw err;
    }
    // Otherwise it's a YAML parse error
    const lineInfo = extractYamlLineInfo(err as Error);
    throw new Error(`Failed to parse YAML in ${manifestPath}${lineInfo}: ${(err as Error).message}`);
  }
}

/**
 * Save a suit manifest. Creates the suit directory if needed.
 * @throws Error if validation fails
 */
export function saveSuit(suit: SuitManifest): void {
  validateManifest(suit, "<memory>");

  const suitDir = path.join(SUITS_DIR, suit.name);
  const manifestPath = path.join(suitDir, "suit.yaml");

  fs.mkdirSync(suitDir, { recursive: true });

  const yaml = stringify(suit);
  fs.writeFileSync(manifestPath, yaml, "utf8");
}

/**
 * Delete a suit (removes the entire suit directory).
 */
export function deleteSuit(name: string): void {
  const suitDir = path.join(SUITS_DIR, name);
  if (fs.existsSync(suitDir)) {
    fs.rmSync(suitDir, { recursive: true, force: true });
  }
}

/**
 * Validate a suit manifest:
 * - name is required and is a string
 * - description is optional string
 * - components fields must be arrays or objects, unknown keys rejected
 */
function validateManifest(manifest: unknown, filePath: string): void {
  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Validation error in ${filePath}: manifest must be an object`);
  }

  const obj = manifest as Record<string, unknown>;

  // Validate name
  if (!("name" in obj)) {
    throw new Error(`Validation error in ${filePath}: required field 'name' is missing`);
  }
  if (typeof obj.name !== "string" || obj.name.trim() === "") {
    throw new Error(`Validation error in ${filePath}: field 'name' must be a non-empty string`);
  }

  // Validate description
  if ("description" in obj && obj.description !== null && typeof obj.description !== "string") {
    throw new Error(`Validation error in ${filePath}: field 'description' must be a string or null`);
  }

  // Validate components
  if ("components" in obj) {
    const components = obj.components;
    if (components !== null && typeof components !== "object") {
      throw new Error(`Validation error in ${filePath}: field 'components' must be an object or null`);
    }

    if (components && typeof components === "object") {
      const comps = components as Record<string, unknown>;
      const allowedKeys = new Set([
        "skills",
        "commands",
        "agents",
        "rules",
        "claudemd",
        "mcp",
        "plugins",
        "hooks",
      ]);

      for (const [key, value] of Object.entries(comps)) {
        if (!allowedKeys.has(key)) {
          throw new Error(
            `Validation error in ${filePath}: unknown field 'components.${key}' (allowed: ${Array.from(allowedKeys).join(", ")})`
          );
        }

        // Validate each component field is an array or object
        if (!Array.isArray(value) && (value === null || typeof value !== "object")) {
          throw new Error(
            `Validation error in ${filePath}: field 'components.${key}' must be an array or object`
          );
        }
      }
    }
  }

  // Reject unknown top-level keys
  const allowedTopKeys = new Set(["name", "description", "components"]);
  for (const key of Object.keys(obj)) {
    if (!allowedTopKeys.has(key)) {
      throw new Error(`Validation error in ${filePath}: unknown field '${key}' at root level`);
    }
  }
}

/**
 * Extract line number from YAML parse error if available.
 */
function extractYamlLineInfo(err: Error): string {
  const match = err.message.match(/line (\d+)/i);
  return match ? ` (line ${match[1]})` : "";
}
