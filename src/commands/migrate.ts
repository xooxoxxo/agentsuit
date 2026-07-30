import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { CLAUDE_HOME, STRONGSUIT_DIR, LIBRARY_DIR, activeSkillsDir } from "../paths.js";
import { resolveSafe, lstatOrNull, isInside, immediateTarget, linkDir } from "../fsutil.js";
import { loadSets, saveSets } from "../sets.js";

export interface MigrateResult {
  /** Real directories moved from legacy library. */
  movedLibrary: string[];
  /** External symlinks recreated in new library pointing to original targets. */
  recreatedExternalLinks: string[];
  /** Active links re-pointed from legacy library to new library. */
  repointedActive: string[];
  /** Active links pointing outside the library (left untouched). */
  foreignSkipped: string[];
  /** Entries left in legacy root after migration (couldn't be safely removed). */
  leftovers: string[];
}

/**
 * Relocates legacy installations to the new ~/.claude/strongsuit root.
 * Handles migration from both ~/.claude/skillsets and ~/.claude/agentsuit.
 * - Moves library entries: real dirs moved; symlink entries recreated at new path.
 * - Moves sets.json verbatim (will convert to suit manifests on next loadSets call).
 * - Re-points active links in user active dir.
 * - Removes legacy root only if fully empty.
 */
export function runMigrate(): void {
  // Try agentsuit first (most recent), then skillsets (original)
  const agentsuiteRoot = path.join(CLAUDE_HOME, "agentsuit");
  const skillsetsRoot = path.join(CLAUDE_HOME, "skillsets");

  let legacyRoot: string | null = null;
  let legacyLabel = "";

  if (fs.existsSync(agentsuiteRoot)) {
    legacyRoot = agentsuiteRoot;
    legacyLabel = "agentsuit";
  } else if (fs.existsSync(skillsetsRoot)) {
    legacyRoot = skillsetsRoot;
    legacyLabel = "skillsets";
  }

  if (!legacyRoot) {
    console.log(chalk.dim("No legacy installation found (checked ~/.claude/agentsuit and ~/.claude/skillsets) — nothing to migrate."));
    return;
  }

  const legacyLibrary = path.join(legacyRoot, "library");
  const legacySets = path.join(legacyRoot, "sets.json");

  // Check if new root already populated AND legacy exists (refuse)
  if (fs.existsSync(STRONGSUIT_DIR) && fs.readdirSync(STRONGSUIT_DIR).length > 0) {
    throw new Error(
      `New strongsuit root (${STRONGSUIT_DIR}) is already populated. ` +
        `To prevent data loss, migration requires an empty target. ` +
        `Back up your legacy ${legacyRoot} and manually review the new root if needed.`
    );
  }

  const result = migrate(legacyRoot, legacyLibrary, legacySets);

  // Report results
  console.log(chalk.green(`\nMigrated from ~/.claude/${legacyLabel} to ~/.claude/strongsuit`));
  if (result.movedLibrary.length > 0) {
    console.log(chalk.green(`Moved library entries (${result.movedLibrary.length}): ${result.movedLibrary.join(", ")}`));
  }
  if (result.recreatedExternalLinks.length > 0) {
    console.log(
      chalk.green(
        `Recreated external symlinks (${result.recreatedExternalLinks.length}): ${result.recreatedExternalLinks.join(", ")}`
      )
    );
  }
  if (result.repointedActive.length > 0) {
    console.log(
      chalk.green(
        `Re-pointed active links (${result.repointedActive.length}): ${result.repointedActive.join(", ")}`
      )
    );
  }
  if (result.foreignSkipped.length > 0) {
    console.log(
      chalk.dim(
        `Foreign active links left untouched (${result.foreignSkipped.length}): ${result.foreignSkipped.join(", ")}`
      )
    );
  }
  if (result.leftovers.length > 0) {
    console.log(
      chalk.yellow(
        `Leftovers in legacy root (${result.leftovers.length}): ${result.leftovers.join(", ")}. ` +
          `Review and remove manually.`
      )
    );
  }

  // Inform about project-scope re-runs
  console.log(
    chalk.dim(
      `\nProject-scope active dirs (./.claude/skills) need to run 'suit use <set> --project' to update links if any managed links were active there.`
    )
  );
}

export function migrate(legacyRoot: string, legacyLibrary: string, legacySets: string): MigrateResult {
  const result: MigrateResult = {
    movedLibrary: [],
    recreatedExternalLinks: [],
    repointedActive: [],
    foreignSkipped: [],
    leftovers: [],
  };

  // Ensure new structure exists
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });

  // Resolve paths (needed for isInside checks)
  const legacyLibReal = resolveSafe(legacyLibrary) ?? legacyLibrary;
  const libReal = resolveSafe(LIBRARY_DIR) ?? LIBRARY_DIR;

  // Migrate library entries
  if (fs.existsSync(legacyLibrary)) {
    for (const entry of fs.readdirSync(legacyLibrary, { withFileTypes: true })) {
      const legacyEntryPath = path.join(legacyLibrary, entry.name);
      const newEntryPath = path.join(LIBRARY_DIR, entry.name);

      // Skip if new library already has this name
      if (fs.existsSync(newEntryPath)) {
        result.leftovers.push(`library/${entry.name}`);
        continue;
      }

      if (entry.isSymbolicLink()) {
        // External symlink: read its first-hop target and recreate at new path
        const target = immediateTarget(legacyEntryPath);
        if (target !== null) {
          linkDir(target, newEntryPath);
          fs.unlinkSync(legacyEntryPath); // Remove old symlink
          result.recreatedExternalLinks.push(entry.name);
        } else {
          result.leftovers.push(`library/${entry.name} (broken link)`);
        }
      } else if (entry.isDirectory()) {
        // Real directory: move it
        fs.renameSync(legacyEntryPath, newEntryPath);
        result.movedLibrary.push(entry.name);
      }
    }
  }

  // Migrate sets.json
  if (fs.existsSync(legacySets)) {
    const setsContent = fs.readFileSync(legacySets, "utf8");
    fs.writeFileSync(path.join(STRONGSUIT_DIR, "sets.json"), setsContent, "utf8");
    fs.unlinkSync(legacySets); // Remove old sets.json
  }

  // Re-point active links: scan user active dir
  const userActiveDir = activeSkillsDir("user");

  if (fs.existsSync(userActiveDir)) {
    for (const entry of fs.readdirSync(userActiveDir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;

      const activePath = path.join(userActiveDir, entry.name);
      const target = immediateTarget(activePath);

      // Check if this link points into the legacy library
      if (target !== null && isInside(target, legacyLibReal)) {
        const skillName = path.basename(target);
        const newLibEntry = path.join(LIBRARY_DIR, skillName);

        if (fs.existsSync(newLibEntry)) {
          // Re-point to new library entry
          fs.unlinkSync(activePath);
          linkDir(newLibEntry, activePath);
          result.repointedActive.push(entry.name);
        }
      } else if (target !== null && !isInside(target, libReal)) {
        // Foreign link pointing outside library
        result.foreignSkipped.push(entry.name);
      }
    }
  }

  // Remove legacy root if now empty
  const legacy = tryRemoveEmptyDirs(legacyRoot);
  result.leftovers = result.leftovers.concat(legacy);

  return result;
}

/**
 * Recursively attempts to remove a directory and its empty parents up to the root.
 * Returns a list of entries that could not be removed (were non-empty).
 */
function tryRemoveEmptyDirs(dir: string): string[] {
  const leftovers: string[] = [];

  // Check for non-empty directories before attempting removal
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (!entry.isDirectory()) {
      leftovers.push(entry.name);
      continue;
    }
    // Recursively check subdirectories
    const subLeftovers = tryRemoveEmptyDirs(entryPath);
    if (subLeftovers.length > 0) {
      leftovers.push(...subLeftovers.map((l) => path.join(entry.name, l)));
    }
  }

  // Only remove if directory is empty
  if (leftovers.length === 0) {
    try {
      fs.rmdirSync(dir);
    } catch {
      // If removal fails, mark as leftover
      leftovers.push(".");
    }
  }

  return leftovers;
}
