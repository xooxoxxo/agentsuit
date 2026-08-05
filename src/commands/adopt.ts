import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import type { Scope } from "../activate.js";
import { initMigrate } from "../activate.js";
import { activeSkillsDir, LIBRARY_DIR } from "../paths.js";
import { createInitBackup } from "../backup.js";
import { listLibrarySkills } from "../library.js";
import { runTailor } from "./tailor.js";

/**
 * External arrivals: skills installed by other tools (Claude Code
 * marketplace, npx skills, hand-copied). Post-init every managed entry is a
 * symlink, so a NEW REAL DIRECTORY in the active dir is by definition one of
 * these. We cannot hook the other installers; we detect on our next touch.
 */
export function externalArrivals(scope: Scope): string[] {
  try {
    return fs
      .readdirSync(activeSkillsDir(scope), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * The one-line, never-interrupting notice (user decision: notify + command).
 * Only after init — before it, onboarding owns this story.
 */
export function printArrivalNotice(scope: Scope): void {
  if (listLibrarySkills().length === 0) return;
  const arrivals = externalArrivals(scope);
  if (arrivals.length === 0) return;
  console.log(
    chalk.gray(
      `${arrivals.length} new skill(s) arrived outside strongsuit: ${arrivals.join(", ")} — 'suit adopt' to library them (add to a suit with --to <suit>).`
    )
  );
}

export interface AdoptOptions {
  /** Also tailor the adopted skills into this suit. */
  to?: string;
}

export async function runAdopt(scope: Scope, options: AdoptOptions = {}): Promise<void> {
  const arrivals = externalArrivals(scope);
  if (arrivals.length === 0) {
    console.log(chalk.dim("Nothing new to adopt — every skill here is already managed."));
    return;
  }

  // Same safety as init: snapshot first, then the idempotent migration.
  const backup = createInitBackup(scope);
  if (backup) {
    console.log(chalk.dim(`Backup taken: ${backup.dir}`));
  }
  const { migrated, adopted, conflicts } = initMigrate(scope, LIBRARY_DIR);
  const newNames = [...migrated, ...adopted];

  if (newNames.length > 0) {
    console.log(chalk.green(`Adopted into the library (${newNames.length}): ${newNames.join(", ")}`));
  }
  if (conflicts.length > 0) {
    console.log(
      chalk.red(`Name already taken in library, skipped (${conflicts.length}): ${conflicts.join(", ")}`)
    );
  }

  if (options.to && newNames.length > 0) {
    await runTailor(options.to, { add: newNames });
  } else if (newNames.length > 0) {
    console.log(chalk.dim(`Add them to a suit: suit tailor <suit> --add ${newNames.join(",")}`));
  }
}
