import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Scope } from "./activate.js";
import { activeSkillsDir, LIBRARY_DIR } from "./paths.js";
import { listLibrarySkills } from "./library.js";
import { listSuits } from "./suits.js";
import { resolveSafe } from "./fsutil.js";

/**
 * Zero-state detection (XO-158): a fresh machine should get a concrete
 * next-step path from every command, never blank output. Pure inspection —
 * nothing here writes.
 */

export interface ZeroState {
  libraryCount: number;
  suitsCount: number;
  /** Real directories in the active skills dir — unmanaged, adoptable by init. */
  unmigratedReal: number;
  /** Symlinks in the active dir that do not point into the library. */
  foreignLinks: number;
}

export function detectState(scope: Scope): ZeroState {
  let unmigratedReal = 0;
  let foreignLinks = 0;
  // realpath, not resolve: on macOS the temp home sits under /var → /private/var,
  // and link targets come back realpathed — a prefix check on the unresolved
  // root would count every managed link as foreign.
  let libraryRoot: string;
  try {
    libraryRoot = fs.realpathSync(LIBRARY_DIR);
  } catch {
    libraryRoot = path.resolve(LIBRARY_DIR);
  }
  const activeDir = activeSkillsDir(scope);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(activeDir, { withFileTypes: true });
  } catch {
    /* no active dir at all — that is just another zero state */
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(activeDir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = resolveSafe(full);
      if (target === null || !path.resolve(target).startsWith(libraryRoot + path.sep)) {
        foreignLinks++;
      }
    } else if (entry.isDirectory()) {
      unmigratedReal++;
    }
  }

  return {
    libraryCount: listLibrarySkills().length,
    suitsCount: listSuits().length,
    unmigratedReal,
    foreignLinks,
  };
}

/**
 * The next-step lines for an empty library, tailored to what the machine
 * actually has. Null when the library is populated — nothing to onboard.
 */
export function onboardingAdvice(scope: Scope): string[] | null {
  const state = detectState(scope);
  if (state.libraryCount > 0) return null;

  const lines: string[] = [];
  if (state.unmigratedReal > 0) {
    lines.push(
      chalk.yellow(
        `${state.unmigratedReal} skill(s) live unmanaged in ${activeSkillsDir(scope)}.`
      )
    );
    lines.push(`  1. ${chalk.bold("suit init")} — adopt them into the library (a backup is taken first)`);
  } else {
    lines.push(chalk.yellow("The library is empty."));
    lines.push(
      `  1. ${chalk.bold("suit init")} — adopt existing skills, or ${chalk.bold("suit import <path>")} / ${chalk.bold("suit install <owner/repo>")} to bring some in`
    );
  }
  lines.push(`  2. ${chalk.bold("suit new coding --skills a,b")} — define a set`);
  lines.push(`  3. ${chalk.bold("suit up coding")} — activate it (or ${chalk.bold("suit run coding")} for one session)`);
  if (state.foreignLinks > 0) {
    lines.push(
      chalk.dim(
        `Note: ${state.foreignLinks} symlink(s) in the active dir point outside the library; init leaves them alone.`
      )
    );
  }
  return lines;
}

export function printOnboarding(scope: Scope): boolean {
  const lines = onboardingAdvice(scope);
  if (!lines) return false;
  for (const line of lines) console.log(line);
  return true;
}
