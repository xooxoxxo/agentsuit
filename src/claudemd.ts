import fs from "node:fs";
import path from "node:path";
import { CLAUDE_HOME } from "./paths.js";

/**
 * Manages the strongsuit-controlled fragment block in CLAUDE.md.
 * The block is delimited by <!-- strongsuit:begin --> and <!-- strongsuit:end -->
 * and contains @references to library entries.
 */

const BEGIN_MARKER = "<!-- strongsuit:begin (do not edit inside) -->";
const END_MARKER = "<!-- strongsuit:end -->";

// Legacy markers from agentsuit era, used for migration only
const LEGACY_BEGIN_MARKER = "<!-- agentsuit:begin (do not edit inside) -->";
const LEGACY_END_MARKER = "<!-- agentsuit:end -->";

/**
 * Gets the path to CLAUDE.md for a given scope.
 */
export function claudeMdPath(scope: "user" | "project"): string {
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
 * Allows either new or legacy markers, but not both.
 * Throws if markers are malformed.
 */
function validateMarkers(content: string): void {
  const newBeginCount = (content.match(new RegExp(BEGIN_MARKER, "g")) || []).length;
  const newEndCount = (content.match(new RegExp(END_MARKER, "g")) || []).length;
  const legacyBeginCount = (content.match(new RegExp(LEGACY_BEGIN_MARKER, "g")) || []).length;
  const legacyEndCount = (content.match(new RegExp(LEGACY_END_MARKER, "g")) || []).length;

  // Check that we have at most one type of marker pair
  const hasNew = newBeginCount > 0 || newEndCount > 0;
  const hasLegacy = legacyBeginCount > 0 || legacyEndCount > 0;

  if (hasNew && hasLegacy) {
    throw new Error(
      "Malformed CLAUDE.md: mixed strongsuit and legacy agentsuit markers. Fix manually and retry."
    );
  }

  if (newBeginCount > 1 || newEndCount > 1) {
    throw new Error(
      "Malformed CLAUDE.md: duplicate strongsuit markers. Fix manually and retry."
    );
  }

  if (legacyBeginCount > 1 || legacyEndCount > 1) {
    throw new Error(
      "Malformed CLAUDE.md: duplicate legacy agentsuit markers. Fix manually and retry."
    );
  }

  if (newBeginCount !== newEndCount) {
    throw new Error(
      "Malformed CLAUDE.md: unmatched strongsuit markers. Fix manually and retry."
    );
  }

  if (legacyBeginCount !== legacyEndCount) {
    throw new Error(
      "Malformed CLAUDE.md: unmatched legacy agentsuit markers. Fix manually and retry."
    );
  }
}

/**
 * Extracts the content outside the strongsuit/legacy block.
 * Returns { outside, hasBlock, blockContent } where outside is the content without the block,
 * hasBlock indicates whether a block was present, and blockContent is the extracted content
 * (useful for migrating legacy markers).
 * Handles both new and legacy markers, automatically migrating legacy to new.
 */
function extractOutside(
  content: string
): { outside: string; hasBlock: boolean; blockContent: string } {
  // Try new markers first
  let beginIdx = content.indexOf(BEGIN_MARKER);
  let endIdx = -1;
  let endMarker = END_MARKER;
  let isLegacy = false;

  if (beginIdx === -1) {
    // Fall back to legacy markers
    beginIdx = content.indexOf(LEGACY_BEGIN_MARKER);
    endMarker = LEGACY_END_MARKER;
    isLegacy = true;
  }

  if (beginIdx === -1) {
    return { outside: content, hasBlock: false, blockContent: "" };
  }

  endIdx = content.indexOf(endMarker, beginIdx);
  if (endIdx === -1) {
    throw new Error("Malformed CLAUDE.md: begin marker without end marker");
  }

  const before = content.substring(0, beginIdx);
  const after = content.substring(endIdx + endMarker.length);
  const blockStart = beginIdx + (isLegacy ? LEGACY_BEGIN_MARKER.length : BEGIN_MARKER.length);
  const blockEnd = endIdx;
  const blockContent = content.substring(blockStart, blockEnd).trim();

  return { outside: before + after, hasBlock: true, blockContent };
}

/**
 * Updates the strongsuit fragment block in CLAUDE.md.
 *
 * @param names - Array of library entry names to include in the block.
 *                Each becomes a @reference to its absolute path in library.
 * @param scope - User or project scope
 * @param libraryPath - Absolute path to the library directory for the artifact type
 *
 * If names is empty, the block is removed entirely (if present).
 * If the file doesn't exist, it is created with the block at the end.
 * Content outside the markers is never modified.
 * Automatically migrates legacy agentsuit markers to new strongsuit markers.
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
