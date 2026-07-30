import fs from "node:fs";
import path from "node:path";
import ora from "ora";
import chalk from "chalk";
import { loadSuit } from "../suits.js";
import {
  activateOnlyFor,
  getActiveEntriesFor,
  type Scope,
} from "../activate.js";
import { setFragments, claudeMdPath } from "../claudemd.js";
import { ARTIFACT_TYPES, libraryPathForType } from "../artifact-types.js";
import { lstatOrNull, immediateTarget, isInside } from "../fsutil.js";

/** Single operation in the journal for rollback. */
interface JournalEntry {
  type: "link-created" | "link-removed" | "claudemd-written";
  path: string;
  previousTarget?: string; // For links: the target they pointed to before removal
  previousContent?: string; // For CLAUDE.md: the content before it was written
}

/** Execution result for a single artifact type. */
interface TypeResult {
  type: string;
  linked: string[];
  removed: string[];
  skipped: string[];
  foreign: string[];
}

/**
 * Captures the current state of an active directory before activation.
 * Records link targets so we can restore them on rollback.
 */
interface CapturedLink {
  /** Exactly what the link held, so rollback can recreate it byte-identically. */
  raw: string;
  /** First hop with its parent resolved — used to decide ownership. */
  resolved: string | null;
}

function captureDirectoryState(dirPath: string): Map<string, CapturedLink> {
  const state = new Map<string, CapturedLink>();
  try {
    if (!fs.existsSync(dirPath)) return state;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        const linkPath = path.join(dirPath, entry.name);
        state.set(entry.name, {
          raw: fs.readlinkSync(linkPath),
          resolved: immediateTarget(linkPath),
        });
      }
    }
  } catch {
    // Ignore errors reading directory
  }
  return state;
}

/**
 * Checks if a link is managed (points into the library).
 */
function isManagedLink(
  linkPath: string,
  libReal: string
): boolean {
  const stat = lstatOrNull(linkPath);
  if (!stat?.isSymbolicLink()) return false;
  const target = immediateTarget(linkPath);
  return target !== null && isInside(target, libReal);
}

/**
 * Executes suit activation with full rollback on failure.
 * Records every filesystem operation in a journal and reverses all changes
 * if any step throws.
 */
async function activateWithRollback(
  suitName: string,
  scope: Scope,
  journal: JournalEntry[]
): Promise<TypeResult[]> {
  const suit = loadSuit(suitName);
  const results: TypeResult[] = [];

  // Pre-flight: capture the state of all directories before we start
  const preflightState = new Map<string, Map<string, CapturedLink>>();
  for (const type of Object.values(ARTIFACT_TYPES)) {
    const activeDir = type.activeDirForScope(scope);
    preflightState.set(type.id, captureDirectoryState(activeDir));
  }

  // Also capture CLAUDE.md state
  const claudeMdPath_ = claudeMdPath(scope);
  const preflightClaudeMd = fs.existsSync(claudeMdPath_)
    ? fs.readFileSync(claudeMdPath_, "utf-8")
    : null;

  try {
    // Activate each artifact type in order
    for (const typeId of ["skills", "commands", "agents", "rules"] as const) {
      const type = ARTIFACT_TYPES[typeId];
      const entryNames = suit.components?.[typeId] ?? [];
      const libraryDir = libraryPathForType(type);
      const libReal = fs.realpathSync(libraryDir);
      const activeDir = type.activeDirForScope(scope);

      // Get what was there before for this type
      const beforeState = preflightState.get(type.id) || new Map();

      // Activate only the specified entries
      const activeResult = activateOnlyFor(
        type,
        entryNames as string[],
        scope,
        libraryDir
      );

      // Record all newly created links in the journal
      for (const linkedName of activeResult.linked) {
        const linkPath = path.join(activeDir, linkedName);
        journal.push({
          type: "link-created",
          path: linkPath,
        });
      }

      // Record all links that were removed (for rollback).
      // Ownership is decided from the pre-flight target, not by probing the
      // path: activateOnlyFor has already deleted these links, so an lstat
      // would report "not managed" and the removal would never be journaled —
      // leaving rollback with nothing to restore.
      for (const [entryName, previous] of beforeState) {
        const linkPath = path.join(activeDir, entryName);
        if (
          !activeResult.linked.includes(entryName) &&
          !activeResult.foreign.includes(entryName) &&
          previous.resolved &&
          isInside(previous.resolved, libReal)
        ) {
          // It was removed, record it for rollback
          journal.push({
            type: "link-removed",
            path: linkPath,
            previousTarget: previous.raw,
          });
        }
      }

      results.push({
        type: typeId,
        linked: activeResult.linked,
        removed: [], // Will be inferred from the journal
        skipped: activeResult.skipped,
        foreign: activeResult.foreign,
      });
    }

    // Handle CLAUDE.md for claudemd fragment entries
    const claudemdNames = suit.components?.claudemd ?? [];
    const claudeMdFile = claudeMdPath(scope);

    // Use empty string as libraryPath since claudemd references are just names for now
    setFragments(claudemdNames, scope, "");

    // Record the CLAUDE.md change in the journal
    journal.push({
      type: "claudemd-written",
      path: claudeMdFile,
      previousContent: preflightClaudeMd ?? undefined,
    });

    results.push({
      type: "claudemd",
      linked: claudemdNames,
      removed: [],
      skipped: [],
      foreign: [],
    });

    return results;
  } catch (err) {
    // Rollback: reverse the journal in LIFO order
    rollbackJournal(journal);
    throw err;
  }
}

/**
 * Reverses all journal entries in LIFO order (last in, first out).
 */
function rollbackJournal(journal: JournalEntry[]): void {
  // Process in reverse order
  for (let i = journal.length - 1; i >= 0; i--) {
    const entry = journal[i];

    try {
      if (entry.type === "link-created") {
        // Remove the link we just created
        if (fs.existsSync(entry.path)) {
          fs.unlinkSync(entry.path);
        }
      } else if (entry.type === "link-removed") {
        // Restore the link we removed
        if (entry.previousTarget && !fs.existsSync(entry.path)) {
          fs.symlinkSync(entry.previousTarget, entry.path, "dir");
        }
      } else if (entry.type === "claudemd-written") {
        // Restore the previous content of CLAUDE.md
        if (entry.previousContent !== undefined) {
          fs.mkdirSync(path.dirname(entry.path), { recursive: true });
          fs.writeFileSync(entry.path, entry.previousContent, "utf-8");
        } else if (fs.existsSync(entry.path)) {
          // There was no previous content, so delete the file
          fs.unlinkSync(entry.path);
        }
      }
    } catch {
      // Rollback best-effort: continue with the rest even if one rollback fails
    }
  }
}

export async function runUp(suitName: string, scope: Scope): Promise<void> {
  const spinner = ora(`Activating suit "${suitName}"...`).start();
  const journal: JournalEntry[] = [];

  try {
    const results = await activateWithRollback(suitName, scope, journal);

    // Report per-type summary
    const summaryLines: string[] = [];
    for (const result of results) {
      if (result.linked.length > 0) {
        summaryLines.push(
          `  ${chalk.green("✓")} ${result.type}: ${result.linked.join(", ")}`
        );
      }
      if (result.skipped.length > 0) {
        summaryLines.push(
          `  ${chalk.yellow("⊘")} ${result.type} skipped: ${result.skipped.join(", ")}`
        );
      }
      if (result.foreign.length > 0) {
        summaryLines.push(
          `  ${chalk.dim("→")} ${result.type} foreign (${result.foreign.length}): ${result.foreign.slice(0, 3).join(", ")}${result.foreign.length > 3 ? "..." : ""}`
        );
      }
    }

    spinner.succeed(
      `Suit "${suitName}" activated (${scope}):\n${summaryLines.join("\n")}`
    );

    // Print session note
    console.log(
      chalk.dim(
        "\n💡 Session note: New Claude sessions will pick up this activation. Already-running sessions keep their previous activation."
      )
    );
  } catch (err) {
    spinner.fail(`Failed to activate suit: ${(err as Error).message}`);
    console.log(chalk.yellow("Rolled back all changes."));
    process.exitCode = 1;
  }
}

export async function runOff(scope: Scope): Promise<void> {
  const spinner = ora("Deactivating all managed entries...").start();
  const journal: JournalEntry[] = [];

  try {
    // Pre-flight: capture the state of all directories
    const preflightState = new Map<string, Map<string, CapturedLink>>();
    for (const type of Object.values(ARTIFACT_TYPES)) {
      const activeDir = type.activeDirForScope(scope);
      preflightState.set(type.id, captureDirectoryState(activeDir));
    }

    // Deactivate all artifact types
    for (const type of Object.values(ARTIFACT_TYPES)) {
      const libraryDir = libraryPathForType(type);
      const libReal = fs.realpathSync(libraryDir);
      const activeDir = type.activeDirForScope(scope);

      // Get what was there before for this type
      const beforeState = preflightState.get(type.id) || new Map();

      const activeResult = activateOnlyFor(type, [], scope, libraryDir);

      // Record all links that were removed (for rollback)
      for (const [entryName, previousTarget] of beforeState) {
        if (
          previousTarget &&
          !activeResult.foreign.includes(entryName)
        ) {
          // This was a managed link that was removed
          const linkPath = path.join(activeDir, entryName);
          journal.push({
            type: "link-removed",
            path: linkPath,
            previousTarget,
          });
        }
      }
    }

    // Clear CLAUDE.md
    const claudeMdFile = claudeMdPath(scope);
    const previousContent = fs.existsSync(claudeMdFile)
      ? fs.readFileSync(claudeMdFile, "utf-8")
      : undefined;

    setFragments([], scope, "");

    journal.push({
      type: "claudemd-written",
      path: claudeMdFile,
      previousContent,
    });

    spinner.succeed(`All managed entries deactivated (${scope})`);

    // Print session note
    console.log(
      chalk.dim(
        "\n💡 Session note: New Claude sessions will have no suit active. Already-running sessions keep their previous activation."
      )
    );
  } catch (err) {
    spinner.fail(`Failed to deactivate: ${(err as Error).message}`);
    console.log(chalk.yellow("Rolled back all changes."));
    rollbackJournal(journal);
    process.exitCode = 1;
  }
}
