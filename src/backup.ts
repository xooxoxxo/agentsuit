import fs from "node:fs";
import path from "node:path";
import { STRONGSUIT_DIR } from "./paths.js";
import { activeSkillsDir } from "./paths.js";
import type { Scope } from "./activate.js";
import { immediateTarget, isInside } from "./fsutil.js";

/**
 * Snapshot of the active skills directory, taken before `suit init` touches
 * it. `init` copies each real skill directory into the library, deletes the
 * original and leaves a symlink — reasonable, but one-directional. The
 * snapshot is what makes it a round trip: `suit restore` puts the directory
 * back exactly as it was, byte for byte, instead of re-deriving it from the
 * library and hoping nothing drifted.
 */

/** Where init snapshots live for a scope. */
export function initBackupsDir(scope: Scope): string {
  return path.join(STRONGSUIT_DIR, "init-backups", scope);
}

export interface InitBackup {
  /** Directory holding the snapshot. */
  dir: string;
  /** ISO timestamp encoded in the directory name. */
  takenAt: string;
  /** Entry names captured. */
  entries: string[];
}

interface BackupManifest {
  takenAt: string;
  scope: Scope;
  activeDir: string;
  entries: string[];
}

/**
 * Copies the active skills dir into a timestamped snapshot before init runs.
 *
 * Symlinks are copied verbatim, not followed: the pre-init state that matters
 * includes foreign links (init re-points them at the library), and restoring
 * a followed copy would turn a link back into a directory.
 *
 * Returns null when there is nothing to back up.
 */
export function createInitBackup(scope: Scope): InitBackup | null {
  const activeDir = activeSkillsDir(scope);
  let entries: string[];
  try {
    entries = fs.readdirSync(activeDir).sort();
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  const takenAt = new Date().toISOString();
  const dir = path.join(initBackupsDir(scope), takenAt.replace(/[:.]/g, "-"));
  const snapshot = path.join(dir, "skills");

  fs.mkdirSync(snapshot, { recursive: true });
  fs.cpSync(activeDir, snapshot, { recursive: true, verbatimSymlinks: true });

  const manifest: BackupManifest = { takenAt, scope, activeDir, entries };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  return { dir, takenAt, entries };
}

/** All snapshots for a scope, oldest first. */
export function listInitBackups(scope: Scope): InitBackup[] {
  const root = initBackupsDir(scope);
  let names: string[];
  try {
    names = fs.readdirSync(root).sort();
  } catch {
    return [];
  }

  const backups: InitBackup[] = [];
  for (const name of names) {
    const dir = path.join(root, name);
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, "manifest.json"), "utf-8")
      ) as BackupManifest;
      backups.push({ dir, takenAt: manifest.takenAt, entries: manifest.entries });
    } catch {
      // A snapshot without a readable manifest is not restorable; skip it.
    }
  }
  return backups;
}

export interface RestoreResult {
  /** Entries put back from the snapshot. */
  restored: string[];
  /**
   * Entries that were left alone because what is there now is not ours to
   * remove: a real directory or a link that does not point into the library.
   */
  refused: string[];
  /** Entries in the active dir that the snapshot does not know about. */
  untouched: string[];
}

/**
 * Restores the active skills dir to the most recent pre-init snapshot.
 *
 * Ownership discipline is the same as everywhere else: an entry is replaced
 * only when the current occupant is a managed symlink (first hop into the
 * library) or missing. A real directory or a foreign link at the same name
 * means the user changed things since init — it is reported and left alone,
 * never overwritten by an older copy.
 *
 * Entries that exist now but are absent from the snapshot are not removed;
 * restore returns to the pre-init state for what init saw, it does not
 * undo everything that happened since.
 */
export function restoreInitBackup(scope: Scope, libraryDir: string): RestoreResult {
  const backups = listInitBackups(scope);
  const backup = backups[backups.length - 1];
  if (!backup) {
    throw new Error(
      `No init backup found for ${scope} scope. Backups are taken by 'suit init' at ${initBackupsDir(scope)}.`
    );
  }

  const activeDir = activeSkillsDir(scope);
  const snapshot = path.join(backup.dir, "skills");
  let libReal: string | null = null;
  try {
    libReal = fs.realpathSync(libraryDir);
  } catch {
    libReal = null;
  }

  const restored: string[] = [];
  const refused: string[] = [];

  fs.mkdirSync(activeDir, { recursive: true });

  for (const name of backup.entries) {
    const current = path.join(activeDir, name);
    const saved = path.join(snapshot, name);

    let stat: fs.Stats | null = null;
    try {
      stat = fs.lstatSync(current);
    } catch {
      stat = null;
    }

    if (stat) {
      const managed =
        stat.isSymbolicLink() &&
        libReal !== null &&
        (() => {
          const hop = immediateTarget(current);
          return hop !== null && isInside(hop, libReal);
        })();

      if (!managed) {
        refused.push(name);
        continue;
      }
      fs.unlinkSync(current);
    }

    fs.cpSync(saved, current, { recursive: true, verbatimSymlinks: true });
    restored.push(name);
  }

  const known = new Set(backup.entries);
  const untouched = fs
    .readdirSync(activeDir)
    .filter((name) => !known.has(name))
    .sort();

  return { restored, refused, untouched };
}
