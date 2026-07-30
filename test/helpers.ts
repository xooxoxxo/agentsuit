import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

/**
 * Creates a temporary fake CLAUDE_SKILLSETS_HOME with library and skills fixtures.
 * Returns the path; caller is responsible for cleanup (rmSync with recursive: true).
 */
export function makeTempHome(): string {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "test-claude-"));

  // Create the skillsets structure
  const skillsetsDir = path.join(tempHome, "skillsets");
  const libraryDir = path.join(skillsetsDir, "library");
  fs.mkdirSync(libraryDir, { recursive: true });

  // Create 5 dummy skills in the library
  const skillNames = ["skill-a", "skill-b", "skill-c", "skill-d", "skill-e"];
  for (const name of skillNames) {
    const skillDir = path.join(libraryDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillMd = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(
      skillMd,
      `---
name: ${name}
description: Dummy skill ${name} for testing
---

This is a test skill.
`
    );
  }

  return tempHome;
}

/**
 * Dynamically imports modules after setting CLAUDE_SKILLSETS_HOME.
 * Must be called after vi.resetModules() to ensure paths.ts reads the new env.
 */
export async function loadModules(tempHome: string) {
  process.env.CLAUDE_SKILLSETS_HOME = tempHome;

  // Import all modules fresh with the new env
  const activate = await import("../src/activate.js");
  const fsutil = await import("../src/fsutil.js");
  const library = await import("../src/library.js");
  const sets = await import("../src/sets.js");
  const paths = await import("../src/paths.js");

  return { activate, fsutil, library, sets, paths };
}

/**
 * Helper to create a real directory with SKILL.md in the active dir.
 * Used to test that real directories are never touched by activateOnly/disableSkill.
 */
export function createRealSkillInActiveDir(
  activeDir: string,
  name: string
): void {
  const skillDir = path.join(activeDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---
name: ${name}
description: Real directory skill ${name}
---

This is a real skill directory.
`
  );
}

/**
 * Helper to create a foreign symlink (pointing outside the library) in the active dir.
 * Used to test that foreign links are never deleted.
 */
export function createForeignSymlink(
  activeDir: string,
  linkName: string,
  externalTargetDir: string
): void {
  fs.mkdirSync(activeDir, { recursive: true });
  const linkPath = path.join(activeDir, linkName);
  fs.symlinkSync(externalTargetDir, linkPath, "dir");
}

/**
 * Helper to create a broken symlink in the active dir.
 */
export function createBrokenSymlink(
  activeDir: string,
  linkName: string,
  missingTargetPath: string
): void {
  fs.mkdirSync(activeDir, { recursive: true });
  const linkPath = path.join(activeDir, linkName);
  fs.symlinkSync(missingTargetPath, linkPath, "dir");
}
