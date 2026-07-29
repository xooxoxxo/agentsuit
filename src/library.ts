import fs from "node:fs";
import path from "node:path";
import { LIBRARY_DIR } from "./paths.js";
import { readFrontmatter } from "./frontmatter.js";
import { resolveSafe } from "./fsutil.js";
import type { SkillMeta } from "./types.js";

/** Rough chars-per-token estimate for a quick "what is this costing me" signal. */
const CHARS_PER_TOKEN = 4;

export function ensureLibraryExists(): void {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
}

/**
 * Enumerates the library. An entry counts as a skill when it is either a real
 * directory containing SKILL.md, or a symlink resolving to one — the latter is how
 * externally-owned skills (plugin dirs, dotfiles repos) are adopted without copying,
 * so they keep updating at their source.
 */
export function listLibrarySkills(): SkillMeta[] {
  ensureLibraryExists();

  const entries = fs.readdirSync(LIBRARY_DIR, { withFileTypes: true });
  const skills: SkillMeta[] = [];

  for (const entry of entries) {
    const isLink = entry.isSymbolicLink();
    if (!entry.isDirectory() && !isLink) continue;

    const entryPath = path.join(LIBRARY_DIR, entry.name);
    const realPath = resolveSafe(entryPath);

    // Broken symlink: surface it rather than silently hiding it, so `list` can flag it.
    if (realPath === null) {
      if (!isLink) continue;
      skills.push({
        name: entry.name,
        description: "(broken link \u2014 target no longer exists)",
        path: entryPath,
        realPath: null,
        bytes: 0,
        estTokens: 0,
        disableModelInvocation: false,
        external: true,
        broken: true,
      });
      continue;
    }

    let realStat: fs.Stats;
    try {
      realStat = fs.statSync(realPath);
    } catch {
      continue;
    }
    if (!realStat.isDirectory()) continue;

    const skillMd = path.join(realPath, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;

    const fm = readFrontmatter(skillMd);
    const bytes = fs.statSync(skillMd).size;

    skills.push({
      name: typeof fm.name === "string" ? fm.name : entry.name,
      description: typeof fm.description === "string" ? fm.description : "(no description found)",
      path: entryPath,
      realPath,
      bytes,
      estTokens: Math.ceil(bytes / CHARS_PER_TOKEN),
      disableModelInvocation: fm["disable-model-invocation"] === true,
      external: isLink,
      broken: false,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function findSkill(name: string): SkillMeta | undefined {
  return listLibrarySkills().find((s) => s.name === name);
}
