import fs from "node:fs";
import path from "node:path";
import { activeSkillsDir } from "./paths.js";
import { findSkill, listLibrarySkills } from "./library.js";
import { resolveSafe, lstatOrNull, isInside, immediateTarget, linkDir } from "./fsutil.js";

export type Scope = "user" | "project";

function ensureActiveDir(scope: Scope): string {
  const dir = activeSkillsDir(scope);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Realpath of the library, needed because macOS resolves /tmp, /var etc. through symlinks. */
function libraryReal(libraryDir: string): string {
  fs.mkdirSync(libraryDir, { recursive: true });
  return fs.realpathSync(libraryDir);
}

/** True when an active-dir entry is a symlink this tool owns (i.e. points into the library). */
function isManagedLink(entryPath: string, libReal: string): boolean {
  const stat = lstatOrNull(entryPath);
  if (!stat?.isSymbolicLink()) return false;
  const target = immediateTarget(entryPath);
  return target !== null && isInside(target, libReal);
}

/** Names of skills currently present in the active dir. */
export function getActiveSkillNames(scope: Scope): Set<string> {
  const dir = activeSkillsDir(scope);
  const active = new Set<string>();

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return active;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.isDirectory()) active.add(entry.name);
  }
  return active;
}

/** Symlinks a single library skill into the active dir. No-op if already linked. */
export function enableSkill(name: string, scope: Scope): void {
  const skill = findSkill(name);
  if (!skill) throw new Error(`Unknown skill "${name}" \u2014 not found in library.`);
  if (skill.broken) throw new Error(`"${name}" is a broken link in the library; its target is gone.`);

  const activeDir = ensureActiveDir(scope);
  const linkPath = path.join(activeDir, name);
  const stat = lstatOrNull(linkPath);

  if (stat) {
    if (stat.isSymbolicLink()) return; // already linked
    throw new Error(
      `"${linkPath}" exists and is a real directory, not a managed symlink. Run "suit init" first.`
    );
  }

  linkDir(skill.path, linkPath);
}

/** Removes the symlink for a skill from the active dir. Library copy is untouched. */
export function disableSkill(name: string, scope: Scope): void {
  const activeDir = activeSkillsDir(scope);
  const linkPath = path.join(activeDir, name);
  const stat = lstatOrNull(linkPath);
  if (!stat) return;

  if (!stat.isSymbolicLink()) {
    throw new Error(
      `"${linkPath}" is a real directory, not a managed symlink. Refusing to delete \u2014 run "suit init" first.`
    );
  }
  fs.unlinkSync(linkPath);
}

export interface ActivateResult {
  linked: string[];
  /** Named by the set but absent from the library. */
  skipped: string[];
  /** Symlinks pointing outside the library — left in place rather than deleted. */
  foreign: string[];
}

/**
 * Clears every *managed* symlink from the active dir, then links exactly `names`.
 *
 * Symlinks pointing outside the library are deliberately left alone: this tool did not
 * create them and does not know how to restore them, so deleting them would destroy
 * information. They are reported back so the caller can suggest `suit init`.
 */
export function activateOnly(names: string[], scope: Scope, libraryDir: string): ActivateResult {
  const activeDir = ensureActiveDir(scope);
  const libReal = libraryReal(libraryDir);
  const foreign: string[] = [];

  for (const entry of fs.readdirSync(activeDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const entryPath = path.join(activeDir, entry.name);

    if (isManagedLink(entryPath, libReal)) {
      fs.unlinkSync(entryPath);
    } else {
      foreign.push(entry.name);
    }
  }

  const library = new Map(listLibrarySkills().map((s) => [s.name, s]));
  const linked: string[] = [];
  const skipped: string[] = [];

  for (const name of names) {
    const skill = library.get(name);
    if (!skill || skill.broken) {
      skipped.push(name);
      continue;
    }
    const linkPath = path.join(activeDir, name);
    if (lstatOrNull(linkPath)) continue; // foreign link or real dir already occupies the name
    linkDir(skill.path, linkPath);
    linked.push(name);
  }

  return { linked, skipped, foreign };
}

export interface InitResult {
  /** Real directories copied into the library and replaced with symlinks. */
  migrated: string[];
  /** Pre-existing symlinks to externally-owned skills, now registered in the library. */
  adopted: string[];
  /** Symlinks already pointing into the library. */
  alreadyManaged: string[];
  /** Symlinks whose target no longer exists. */
  broken: string[];
  /** Name already taken in the library by something else — left untouched. */
  conflicts: string[];
}

/**
 * Brings the active dir under management.
 *
 * - Real skill directories are copied into the library, then replaced with a symlink.
 * - Pre-existing symlinks pointing *outside* the library are adopted: the library gets a
 *   symlink to the same target, and the active link is re-pointed at the library entry.
 *   The external skill is never copied, so it keeps updating wherever it actually lives.
 * - Symlinks already pointing into the library are left alone.
 */
export function initMigrate(scope: Scope, libraryDir: string): InitResult {
  const activeDir = ensureActiveDir(scope);
  const libReal = libraryReal(libraryDir);

  const migrated: string[] = [];
  const adopted: string[] = [];
  const alreadyManaged: string[] = [];
  const broken: string[] = [];
  const conflicts: string[] = [];

  for (const entry of fs.readdirSync(activeDir, { withFileTypes: true })) {
    const activePath = path.join(activeDir, entry.name);

    if (entry.isSymbolicLink()) {
      const firstHop = immediateTarget(activePath);
      if (firstHop !== null && isInside(firstHop, libReal)) {
        alreadyManaged.push(entry.name);
        continue;
      }

      const target = resolveSafe(activePath);
      if (target === null) {
        broken.push(entry.name);
        continue;
      }
      if (!fs.existsSync(path.join(target, "SKILL.md"))) continue;

      const libPath = path.join(libraryDir, entry.name);
      const existing = resolveSafe(libPath);

      if (existing !== null && existing !== target) {
        conflicts.push(entry.name);
        continue;
      }
      if (existing === null) {
        linkDir(target, libPath);
      }

      // Re-point the active link at the library entry so every active link is uniform.
      fs.unlinkSync(activePath);
      linkDir(libPath, activePath);
      adopted.push(entry.name);
      continue;
    }

    if (!entry.isDirectory()) continue;
    if (!fs.existsSync(path.join(activePath, "SKILL.md"))) continue;

    const libPath = path.join(libraryDir, entry.name);
    if (fs.existsSync(libPath)) {
      conflicts.push(entry.name);
      continue;
    }

    fs.cpSync(activePath, libPath, { recursive: true });
    fs.rmSync(activePath, { recursive: true, force: true });
    linkDir(libPath, activePath);
    migrated.push(entry.name);
  }

  return { migrated, adopted, alreadyManaged, broken, conflicts };
}
