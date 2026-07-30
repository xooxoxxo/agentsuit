import fs from "node:fs";
import path from "node:path";
import { SETS_FILE, AGENTSUIT_DIR, SUITS_DIR } from "./paths.js";
import type { SetsFile } from "./types.js";
import { listSuits, loadSuit, saveSuit, deleteSuit, suitExists } from "./suits.js";

/**
 * Load sets from suit manifests. Derives setName -> skills from each suit's
 * components.skills field. Also handles legacy conversion on first call.
 */
export function loadSets(): SetsFile {
  fs.mkdirSync(AGENTSUIT_DIR, { recursive: true });

  // Legacy conversion: if sets.json exists and suits/ doesn't, convert
  if (fs.existsSync(SETS_FILE) && !fs.existsSync(SUITS_DIR)) {
    convertLegacySets();
  }

  // Derive sets from suit manifests
  const sets: SetsFile = {};
  for (const suitName of listSuits()) {
    try {
      const suit = loadSuit(suitName);
      const skills = suit.components?.skills ?? [];
      if (skills.length > 0 || true) {
        // Include all suits, even empty ones
        sets[suit.name] = skills;
      }
    } catch {
      // Skip suits that can't be loaded
    }
  }

  return sets;
}

/**
 * Save sets by creating/updating/deleting suit manifests to match the record.
 * Each setName becomes a suit with components.skills populated.
 */
export function saveSets(sets: SetsFile): void {
  fs.mkdirSync(AGENTSUIT_DIR, { recursive: true });

  // Determine which suits should exist
  const targetSuits = new Set(Object.keys(sets));
  const currentSuits = new Set(listSuits());

  // Delete suits not in the new sets
  for (const suitName of currentSuits) {
    if (!targetSuits.has(suitName)) {
      deleteSuit(suitName);
    }
  }

  // Create or update suits
  for (const [setName, skills] of Object.entries(sets)) {
    saveSuit({
      name: setName,
      components: {
        skills,
      },
    });
  }
}

/**
 * Convert legacy sets.json to suit manifests.
 * Creates one manifest per set, then renames sets.json to sets.json.migrated.
 * Prints a one-line notice. Idempotent.
 */
function convertLegacySets(): void {
  if (!fs.existsSync(SETS_FILE)) return;

  try {
    const raw = fs.readFileSync(SETS_FILE, "utf8");
    const sets = JSON.parse(raw) as SetsFile;

    // Create manifests for each set
    for (const [setName, skills] of Object.entries(sets)) {
      saveSuit({
        name: setName,
        components: {
          skills,
        },
      });
    }

    // Backup: rename sets.json to sets.json.migrated
    const backupPath = SETS_FILE + ".migrated";
    fs.renameSync(SETS_FILE, backupPath);

    console.log(`Migrated legacy sets.json to suit manifests (backup: sets.json.migrated)`);
  } catch {
    // If conversion fails, leave sets.json alone; loadSets will derive from empty suits
  }
}
