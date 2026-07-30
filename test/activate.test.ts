import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { ActivateResult, InitResult } from "../src/activate.js";
import {
  makeTempHome,
  loadModules,
  createRealSkillInActiveDir,
  createForeignSymlink,
  createBrokenSymlink,
} from "./helpers.js";

describe("activate.ts safety invariants", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("activateOnly — foreign symlink preservation", () => {
    it("a1: never deletes a symlink pointing outside the library", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Create an external target outside the library
      const externalDir = path.join(tempHome, "external-skills", "my-external-skill");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "SKILL.md"), "---\nname: external\n---\n");

      // Create a foreign symlink in active dir pointing to the external skill
      const foreignLinkPath = path.join(activeDir, "foreign-skill");
      fs.symlinkSync(externalDir, foreignLinkPath, "dir");

      // Run activateOnly with an empty set
      const result = activate.activateOnly([], "user", paths.LIBRARY_DIR);

      // The foreign symlink should NOT be deleted
      expect(fs.existsSync(foreignLinkPath)).toBe(true);
      expect(fs.lstatSync(foreignLinkPath).isSymbolicLink()).toBe(true);

      // It should be reported in foreign[]
      expect(result.foreign).toContain("foreign-skill");
    });
  });

  describe("activateOnly — real directory preservation", () => {
    it("a2: never touches a real directory in the active dir", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Create a real skill directory (unmigrated) in the active dir
      createRealSkillInActiveDir(activeDir, "unmigrated-real");

      // Run activateOnly
      const result = activate.activateOnly([], "user", paths.LIBRARY_DIR);

      // The real directory should still exist
      const realDirPath = path.join(activeDir, "unmigrated-real");
      expect(fs.existsSync(realDirPath)).toBe(true);
      expect(fs.lstatSync(realDirPath).isDirectory()).toBe(true);
      expect(fs.lstatSync(realDirPath).isSymbolicLink()).toBe(false);
    });
  });

  describe("enableSkill — real directory guard", () => {
    it("a3: throws when path exists as a real directory", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      createRealSkillInActiveDir(activeDir, "skill-a");

      // enableSkill should throw because skill-a exists as a real dir
      expect(() => activate.enableSkill("skill-a", "user")).toThrow(
        /real directory/i
      );
    });
  });

  describe("disableSkill — real directory guard and idempotency", () => {
    it("a4a: throws when entry is a real directory", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      createRealSkillInActiveDir(activeDir, "skill-a");

      // disableSkill should throw
      expect(() => activate.disableSkill("skill-a", "user")).toThrow(
        /real directory/i
      );

      // The real directory should still exist
      expect(
        fs.lstatSync(path.join(activeDir, "skill-a")).isDirectory()
      ).toBe(true);
    });

    it("a4b: silent no-op when skill is absent", async () => {
      const { activate, paths } = await loadModules(tempHome);

      // disableSkill on a nonexistent skill should not throw
      expect(() => activate.disableSkill("nonexistent", "user")).not.toThrow();
    });
  });

  describe("initMigrate — adoption of external symlinks", () => {
    it("a5: adopts external symlinks, re-points active link to library entry", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Create an external skill directory
      const externalDir = path.join(tempHome, "external", "adopted-skill");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(
        path.join(externalDir, "SKILL.md"),
        "---\nname: adopted-skill\ndescription: External skill\n---\n"
      );

      // Create a symlink in active dir pointing to the external skill
      const activeLinkPath = path.join(activeDir, "adopted-skill");
      fs.symlinkSync(externalDir, activeLinkPath, "dir");

      // Run initMigrate
      const result = activate.initMigrate("user", paths.LIBRARY_DIR);

      // Should report adopted
      expect(result.adopted).toContain("adopted-skill");

      // Library should have a symlink to the external skill
      const libLinkPath = path.join(paths.LIBRARY_DIR, "adopted-skill");
      expect(fs.existsSync(libLinkPath)).toBe(true);
      expect(fs.lstatSync(libLinkPath).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(libLinkPath)).toBe(fs.realpathSync(externalDir));

      // Active link should now point to the library entry (not the external dir directly)
      expect(fs.existsSync(activeLinkPath)).toBe(true);
      expect(fs.lstatSync(activeLinkPath).isSymbolicLink()).toBe(true);

      // The external skill should still exist and be unchanged
      expect(fs.existsSync(externalDir)).toBe(true);
    });

    it("a5b: adopted chain is managed by first hop — use can remove and relink it", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Adopted state: active/x -> library/x -> externalDir. Fully resolving the
      // chain lands OUTSIDE the library; only the first hop proves ownership.
      const externalDir = path.join(tempHome, "external", "chain-skill");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(
        path.join(externalDir, "SKILL.md"),
        "---\nname: chain-skill\ndescription: External adopted skill\n---\n"
      );
      const libLinkPath = path.join(paths.LIBRARY_DIR, "chain-skill");
      fs.symlinkSync(externalDir, libLinkPath, "dir");
      const activeLinkPath = path.join(activeDir, "chain-skill");
      fs.symlinkSync(libLinkPath, activeLinkPath, "dir");

      // Switching to a set WITHOUT the adopted skill must remove its active
      // link (it is managed) and must not report it as foreign.
      const cleared = activate.activateOnly(["skill-a"], "user", paths.LIBRARY_DIR);
      expect(fs.existsSync(activeLinkPath)).toBe(false);
      expect(cleared.foreign).not.toContain("chain-skill");

      // Switching to a set WITH it relinks through the library and the chain
      // still resolves to the external content.
      const relinked = activate.activateOnly(["chain-skill"], "user", paths.LIBRARY_DIR);
      expect(relinked.linked).toContain("chain-skill");
      expect(fs.lstatSync(activeLinkPath).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(activeLinkPath)).toBe(fs.realpathSync(externalDir));
    });
  });

  describe("initMigrate — idempotency", () => {
    it("a6: second run reports alreadyManaged, no filesystem changes", async () => {
      vi.resetModules();
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");

      // First run: should migrate the library skills into active (really: they start in library)
      // So we manually create a symlink first
      fs.mkdirSync(activeDir, { recursive: true });
      const libLinkPath = path.join(paths.LIBRARY_DIR, "skill-a");
      const activeLinkPath = path.join(activeDir, "skill-a");
      fs.symlinkSync(libLinkPath, activeLinkPath, "dir");

      // First initMigrate
      const result1 = activate.initMigrate("user", paths.LIBRARY_DIR);
      expect(result1.alreadyManaged).toContain("skill-a");

      // Get the state after first run
      const stat1 = fs.lstatSync(activeLinkPath);

      // Second initMigrate
      vi.resetModules();
      const modules2 = await loadModules(tempHome);
      const result2 = modules2.activate.initMigrate("user", modules2.paths.LIBRARY_DIR);
      expect(result2.alreadyManaged).toContain("skill-a");

      // The symlink should still exist and be identical
      const stat2 = fs.lstatSync(activeLinkPath);
      expect(stat2.ino).toBe(stat1.ino); // same inode
    });
  });

  describe("initMigrate — name conflict detection", () => {
    it("a7: never overwrites existing library entry on conflict", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Create a real skill in the active dir
      createRealSkillInActiveDir(activeDir, "skill-a");

      // The library already has skill-a (from fixture)
      const libPath = path.join(paths.LIBRARY_DIR, "skill-a");
      const originalContent = fs.readFileSync(
        path.join(libPath, "SKILL.md"),
        "utf8"
      );

      // Run initMigrate
      const result = activate.initMigrate("user", paths.LIBRARY_DIR);

      // Should report conflict
      expect(result.conflicts).toContain("skill-a");

      // Real dir should still exist (not copied/moved)
      const realDirPath = path.join(activeDir, "skill-a");
      expect(fs.lstatSync(realDirPath).isDirectory()).toBe(true);
      expect(fs.lstatSync(realDirPath).isSymbolicLink()).toBe(false);

      // Library entry should be unchanged
      const currentContent = fs.readFileSync(
        path.join(libPath, "SKILL.md"),
        "utf8"
      );
      expect(currentContent).toBe(originalContent);
    });
  });

  describe("initMigrate — broken symlink handling", () => {
    it("a8: broken symlinks reported, not adopted", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Create a broken symlink
      createBrokenSymlink(
        activeDir,
        "broken-link",
        path.join(tempHome, "nonexistent-target")
      );

      // Run initMigrate
      const result = activate.initMigrate("user", paths.LIBRARY_DIR);

      // Should report broken
      expect(result.broken).toContain("broken-link");

      // Symlink should still exist (not deleted)
      const brokenPath = path.join(activeDir, "broken-link");
      expect(fs.existsSync(brokenPath) || fs.lstatSync(brokenPath)).toBeTruthy();
      expect(fs.lstatSync(brokenPath).isSymbolicLink()).toBe(true);

      // Should NOT be adopted into library
      const libPath = path.join(paths.LIBRARY_DIR, "broken-link");
      expect(fs.existsSync(libPath)).toBe(false);
    });
  });

  describe("activateOnly — set exclusivity", () => {
    it("a9: active dir ends as exactly the set members", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");

      // Activate only skill-a and skill-b
      const result = activate.activateOnly(
        ["skill-a", "skill-b"],
        "user",
        paths.LIBRARY_DIR
      );

      // Should have linked exactly those two
      expect(result.linked).toHaveLength(2);
      expect(result.linked).toContain("skill-a");
      expect(result.linked).toContain("skill-b");

      // Active dir should contain only symlinks to those two
      const entries = fs.readdirSync(activeDir, { withFileTypes: true });
      const names = entries.map((e) => e.name).sort();
      expect(names).toEqual(["skill-a", "skill-b"]);

      // All should be symlinks
      for (const entry of entries) {
        expect(entry.isSymbolicLink()).toBe(true);
      }
    });
  });

  describe("loadSets — corruption tolerance", () => {
    it("a10: garbage file returns {} instead of throwing", async () => {
      const { sets, paths } = await loadModules(tempHome);

      // Write garbage to sets.json
      fs.mkdirSync(paths.SKILLSETS_DIR, { recursive: true });
      fs.writeFileSync(
        paths.SETS_FILE,
        "{ this is not valid json!!! }{{{}"
      );

      // loadSets should return {} without throwing
      const result = sets.loadSets();
      expect(result).toEqual({});
    });
  });

  describe("activateOnly — missing skill handling", () => {
    it("a11: set naming missing library skill → skipped reported, others linked", async () => {
      const { activate, paths } = await loadModules(tempHome);

      // Request skill-a, skill-b, and a nonexistent skill
      const result = activate.activateOnly(
        ["skill-a", "skill-b", "nonexistent-skill"],
        "user",
        paths.LIBRARY_DIR
      );

      // skill-a and skill-b should be linked
      expect(result.linked).toContain("skill-a");
      expect(result.linked).toContain("skill-b");
      expect(result.linked).toHaveLength(2);

      // nonexistent-skill should be skipped
      expect(result.skipped).toContain("nonexistent-skill");

      // Active dir should have only skill-a and skill-b
      const activeDir = paths.activeSkillsDir("user");
      const entries = fs.readdirSync(activeDir);
      expect(entries.sort()).toEqual(["skill-a", "skill-b"]);
    });
  });

  describe("enableSkill — idempotency", () => {
    it("enables a skill and is a no-op if already enabled", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Enable skill-a
      activate.enableSkill("skill-a", "user");

      const linkPath = path.join(activeDir, "skill-a");
      const stat1 = fs.lstatSync(linkPath);

      // Enable it again (should be no-op)
      activate.enableSkill("skill-a", "user");
      const stat2 = fs.lstatSync(linkPath);

      // Should be the same symlink
      expect(stat2.ino).toBe(stat1.ino);
    });
  });

  describe("activateOnly with foreign and real mixed", () => {
    it("clears managed links, preserves foreign + real, links new set members", async () => {
      const { activate, paths } = await loadModules(tempHome);

      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Create initial state: skill-a (managed), foreign-skill (foreign), unmigrated (real)
      const libPath = path.join(paths.LIBRARY_DIR, "skill-a");
      const activeLinkA = path.join(activeDir, "skill-a");
      fs.symlinkSync(libPath, activeLinkA, "dir");

      const externalDir = path.join(tempHome, "external");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "SKILL.md"), "---\n---\n");
      createForeignSymlink(activeDir, "foreign-skill", externalDir);

      createRealSkillInActiveDir(activeDir, "unmigrated");

      // Now activate only skill-b and skill-c
      const result = activate.activateOnly(
        ["skill-b", "skill-c"],
        "user",
        paths.LIBRARY_DIR
      );

      // Should link skill-b and skill-c
      expect(result.linked).toContain("skill-b");
      expect(result.linked).toContain("skill-c");

      // Should report foreign
      expect(result.foreign).toContain("foreign-skill");

      // Verify final state
      const entries = fs.readdirSync(activeDir, { withFileTypes: true });
      const names = entries.map((e) => e.name).sort();

      // Should have: foreign-skill (foreign), skill-b, skill-c, unmigrated (real)
      expect(names).toContain("foreign-skill");
      expect(names).toContain("skill-b");
      expect(names).toContain("skill-c");
      expect(names).toContain("unmigrated");

      // Verify foreign and real are untouched
      expect(
        fs.lstatSync(path.join(activeDir, "foreign-skill")).isSymbolicLink()
      ).toBe(true);
      expect(
        fs.lstatSync(path.join(activeDir, "unmigrated")).isDirectory()
      ).toBe(true);
    });
  });
});
