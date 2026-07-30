import fs from "node:fs";
import path from "node:path";
import { CLAUDE_HOME } from "./paths.js";

/**
 * Manages the agentsuit-controlled fragment block in CLAUDE.md.
 * The block is delimited by <!-- agentsuit:begin --> and <!-- agentsuit:end -->
 * and contains @references to library entries.
 */

const BEGIN_MARKER = "<!-- agentsuit:begin (do not edit inside) -->";
const END_MARKER = "<!-- agentsuit:end -->";

/**
 * Gets the path to CLAUDE.md for a given scope.
 */
function claudeMdPath(scope: "user" | "project"): string {
  return scope === "project"
    ? path.join(process.cwd(), ".claude", "CLAUDE.md")
    : path.join(CLAUDE_HOME, "CLAUDE.md");
}

/**
 * Reads CLAUDE.md if it exists, returns empty string if not.
 */
function readClaudeMd(scope: "user" | "project"): string {
  const filepath = claudeMdPath(scope);
  try {
    return fs.readFileSync(filepath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Validates that the marker block is well-formed (at most one, balanced).
 * Throws if markers are malformed.
 */
function validateMarkers(content: string): void {
  const beginCount = (content.match(new RegExp(BEGIN_MARKER, "g")) || []).length;
  const endCount = (content.match(new RegExp(END_MARKER, "g")) || []).length;

  if (beginCount > 1 || endCount > 1) {
    throw new Error(
      "Malformed CLAUDE.md: duplicate agentsuit markers. Fix manually and retry."
    );
  }

  if (beginCount !== endCount) {
    throw new Error(
      "Malformed CLAUDE.md: unmatched agentsuit markers. Fix manually and retry."
    );
  }
}

/**
 * Extracts the content outside the agentsuit block.
 * Returns { outside, hasBlock } where outside is the content without the block,
 * and hasBlock indicates whether a block was present.
 */
function extractOutside(
  content: string
): { outside: string; hasBlock: boolean } {
  const beginIdx = content.indexOf(BEGIN_MARKER);
  if (beginIdx === -1) {
    return { outside: content, hasBlock: false };
  }

  const endIdx = content.indexOf(END_MARKER, beginIdx);
  if (endIdx === -1) {
    throw new Error("Malformed CLAUDE.md: begin marker without end marker");
  }

  const before = content.substring(0, beginIdx);
  const after = content.substring(endIdx + END_MARKER.length);

  return { outside: before + after, hasBlock: true };
}

/**
 * Updates the agentsuit fragment block in CLAUDE.md.
 *
 * @param names - Array of library entry names to include in the block.
 *                Each becomes a @reference to its absolute path in library.
 * @param scope - User or project scope
 * @param libraryPath - Absolute path to the library directory for the artifact type
 *
 * If names is empty, the block is removed entirely (if present).
 * If the file doesn't exist, it is created with the block at the end.
 * Content outside the markers is never modified.
 */
export function setFragments(
  names: string[],
  scope: "user" | "project",
  libraryPath: string
): void {
  const filepath = claudeMdPath(scope);
  const content = readClaudeMd(scope);

  validateMarkers(content);
  const { outside } = extractOutside(content);

  if (names.length === 0) {
    // Remove the block entirely
    const newContent = outside.trimEnd();
    if (newContent === "") {
      // Don't create an empty file
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      return;
    }
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, newContent + "\n", "utf-8");
    return;
  }

  // Build the new block with references
  const references = names
    .map((name) => {
      const fullPath = path.join(libraryPath, name);
      return `@${fullPath}`;
    })
    .join("\n");

  const newBlock = `${BEGIN_MARKER}
${references}
${END_MARKER}`;

  const newContent = outside.trimEnd() + "\n\n" + newBlock + "\n";

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, newContent, "utf-8");
}

/**
 * Clears the agentsuit fragment block from CLAUDE.md (if present).
 */
export function clearFragments(scope: "user" | "project"): void {
  setFragments([], scope, "");
}
