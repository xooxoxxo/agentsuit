import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  makeTempHome,
  loadModules,
  createRealSkillInActiveDir,
  createForeignSymlink,
} from "./helpers.js";

/** Creates a temp home for legacy-only testing (no new agentsuit structure). */
function makeLegacyOnlyHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "test-claude-"));
}

describe("migrate.ts — legacy layout relocation", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("basic migration flow", () => {
    it("m1: migrates real library dirs from legacy to new location", async () => {
      const cleanHome = makeLegacyOnlyHome();
      try {
      const { paths } = await loadModules(cleanHome);

        // Create legacy structure with real directories
        const legacyRoot = path.join(cleanHome, "skillsets");
        const legacyLib = path.join(legacyRoot, "library");
        fs.mkdirSync(legacyLib, { recursive: true });

        // Create real skill dirs in legacy library
        const skillAPath = path.join(legacyLib, "skill-a");
        fs.mkdirSync(skillAPath, { recursive: true });
        fs.writeFileSync(path.join(skillAPath, "SKILL.md"), "---\nname: skill-a\n---\n");
        fs.writeFileSync(path.join(skillAPath, "content.txt"), "skill A content");

        // Run migration
        const { migrate } = await loadModules(cleanHome);
        const result = migrate.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

        // Verify real dir moved
        expect(result.movedLibrary).toContain("skill-a");
        const newPath = path.join(paths.LIBRARY_DIR, "skill-a");
        expect(fs.existsSync(newPath)).toBe(true);
        expect(fs.readFileSync(path.join(newPath, "content.txt"), "utf8")).toBe("skill A content");

        // Legacy entry should be gone
        expect(fs.existsSync(skillAPath)).toBe(false);
      } finally {
        vi.resetModules();
        fs.rmSync(cleanHome, { recursive: true, force: true });
      }
    });

    it("m2: recreates external symlinks with their original targets", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy structure
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      // Create external target outside legacy
      const externalDir = path.join(tempHome, "external-skills", "external-a");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "SKILL.md"), "---\nname: external-a\n---\n");

      // Create symlink in legacy library pointing to external
      const legacyLinkPath = path.join(legacyLib, "external-a");
      fs.symlinkSync(externalDir, legacyLinkPath, "dir");

      // Run migration
      const { migrate: migrateModule, fsutil } = await loadModules(tempHome);
      const result = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify symlink recreated in new library with same target
      expect(result.recreatedExternalLinks).toContain("external-a");
      const newLinkPath = path.join(paths.LIBRARY_DIR, "external-a");
      expect(fs.lstatSync(newLinkPath).isSymbolicLink()).toBe(true);
      const target = fsutil.immediateTarget(newLinkPath);
      const expectedTarget = fsutil.resolveSafe(externalDir) ?? externalDir;
      expect(target).toBe(expectedTarget);

      // Legacy link should be gone
      expect(fs.existsSync(legacyLinkPath)).toBe(false);
    });

    it("m3: re-points active links from legacy library to new library", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy structure with a real skill
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      const skillAPath = path.join(legacyLib, "skill-a");
      fs.mkdirSync(skillAPath, { recursive: true });
      fs.writeFileSync(path.join(skillAPath, "SKILL.md"), "---\nname: skill-a\n---\n");

      // Create active dir with symlink pointing to legacy library
      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });
      const activeLinkPath = path.join(activeDir, "skill-a");
      fs.symlinkSync(skillAPath, activeLinkPath, "dir");

      // Run migration
      const { migrate: migrateModule, fsutil } = await loadModules(tempHome);
      const result = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify active link re-pointed to new library
      expect(result.repointedActive).toContain("skill-a");
      expect(fs.lstatSync(activeLinkPath).isSymbolicLink()).toBe(true);
      const newTarget = fsutil.immediateTarget(activeLinkPath);
      const expectedNewTarget = fsutil.resolveSafe(path.join(paths.LIBRARY_DIR, "skill-a")) ?? path.join(paths.LIBRARY_DIR, "skill-a");
      expect(newTarget).toBe(expectedNewTarget);
    });

    it("m4: moves sets.json verbatim", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy structure
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      // Create sets.json
      const legacySetsPath = path.join(legacyRoot, "sets.json");
      const setsContent = { coding: ["skill-a", "skill-b"], writing: ["skill-c"] };
      fs.writeFileSync(legacySetsPath, JSON.stringify(setsContent, null, 2) + "\n");

      // Run migration
      const { migrate: migrateModule } = await loadModules(tempHome);
      migrateModule.migrate(legacyRoot, legacyLib, legacySetsPath);

      // Verify sets.json moved
      const newSetsPath = paths.SETS_FILE;
      expect(fs.existsSync(newSetsPath)).toBe(true);
      const movedContent = JSON.parse(fs.readFileSync(newSetsPath, "utf8"));
      expect(movedContent).toEqual(setsContent);
    });

    it("m5: leaves foreign active links untouched", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy structure
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      // Create external target outside library
      const externalDir = path.join(tempHome, "external");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "SKILL.md"), "---\nname: external\n---\n");

      // Create active dir with foreign link
      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });
      const foreignLinkPath = path.join(activeDir, "foreign-skill");
      fs.symlinkSync(externalDir, foreignLinkPath, "dir");

      // Run migration
      const { migrate: migrateModule } = await loadModules(tempHome);
      const result = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify foreign link untouched
      expect(result.foreignSkipped).toContain("foreign-skill");
      expect(fs.lstatSync(foreignLinkPath).isSymbolicLink()).toBe(true);
    });

    it("m6: removes empty legacy root after migration", async () => {
      const { paths } = await loadModules(tempHome);

      // Create minimal legacy structure
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      // Run migration
      const { migrate: migrateModule } = await loadModules(tempHome);
      migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify legacy root removed
      expect(fs.existsSync(legacyRoot)).toBe(false);
    });

    it("m7: reports leftovers when legacy root cannot be fully emptied", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy structure with un-migratable entry
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });
      fs.writeFileSync(path.join(legacyRoot, "unmigrated-file.txt"), "cannot migrate");

      // Run migration
      const { migrate: migrateModule } = await loadModules(tempHome);
      const result = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify leftover reported
      expect(result.leftovers.length).toBeGreaterThan(0);
      expect(fs.existsSync(legacyRoot)).toBe(true);
    });
  });

  describe("safety and error handling", () => {
    it("m8: no-op when legacy root doesn't exist", async () => {
      const legacyOnlyHome = makeLegacyOnlyHome();
      try {
        await loadModules(legacyOnlyHome);

        // Verify legacy root doesn't exist
        const legacyRoot = path.join(legacyOnlyHome, "skillsets");
        expect(fs.existsSync(legacyRoot)).toBe(false);

        // Run migration should not throw
        const { migrate } = await loadModules(legacyOnlyHome);
        expect(() => migrate.runMigrate()).not.toThrow();
      } finally {
        vi.resetModules();
        fs.rmSync(legacyOnlyHome, { recursive: true, force: true });
      }
    });

    it("m9: refuses migration when new root is already populated", async () => {
      const legacyOnlyHome = makeLegacyOnlyHome();
      try {
        const { paths } = await loadModules(legacyOnlyHome);

        // Create and populate new root
        fs.mkdirSync(paths.AGENTSUIT_DIR, { recursive: true });
        fs.writeFileSync(path.join(paths.AGENTSUIT_DIR, "existing-file.txt"), "existing");

        // Create legacy structure
        const legacyRoot = path.join(legacyOnlyHome, "skillsets");
        const legacyLib = path.join(legacyRoot, "library");
        fs.mkdirSync(legacyLib, { recursive: true });

        // Run migration should throw
        const { migrate } = await loadModules(legacyOnlyHome);
        expect(() => migrate.runMigrate()).toThrow(/already populated/);
      } finally {
        vi.resetModules();
        fs.rmSync(legacyOnlyHome, { recursive: true, force: true });
      }
    });

    it("m10: re-run is idempotent (no-op)", async () => {
      const legacyOnlyHome = makeLegacyOnlyHome();
      try {
        const { paths } = await loadModules(legacyOnlyHome);

        // Create legacy structure
        const legacyRoot = path.join(legacyOnlyHome, "skillsets");
        const legacyLib = path.join(legacyRoot, "library");
        fs.mkdirSync(legacyLib, { recursive: true });

        const skillAPath = path.join(legacyLib, "skill-a");
        fs.mkdirSync(skillAPath, { recursive: true });
        fs.writeFileSync(path.join(skillAPath, "SKILL.md"), "---\nname: skill-a\n---\n");

        // First run
        let { migrate: migrateModule } = await loadModules(legacyOnlyHome);
        const result1 = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

        // Verify first run succeeded
        expect(result1.movedLibrary).toContain("skill-a");
        expect(fs.existsSync(legacyRoot)).toBe(false);

        // Second run (legacy root now gone)
        vi.resetModules();
        ({ migrate: migrateModule } = await loadModules(legacyOnlyHome));
        // Second run should be no-op since legacy root is gone
        expect(() => migrateModule.runMigrate()).not.toThrow();
      } finally {
        vi.resetModules();
        fs.rmSync(legacyOnlyHome, { recursive: true, force: true });
      }
    });
  });

  describe("complex scenarios", () => {
    it("m11: handles mixed real dirs and external symlinks", async () => {
      const cleanHome = makeLegacyOnlyHome();
      try {
      const { paths } = await loadModules(cleanHome);

      // Create legacy structure
      const legacyRoot = path.join(cleanHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      // Add real dir
      const realSkillPath = path.join(legacyLib, "real-skill");
      fs.mkdirSync(realSkillPath, { recursive: true });
      fs.writeFileSync(path.join(realSkillPath, "SKILL.md"), "---\nname: real\n---\n");

      // Add external symlink
      const externalDir = path.join(cleanHome, "external", "ext-skill");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "SKILL.md"), "---\nname: ext\n---\n");
      fs.symlinkSync(externalDir, path.join(legacyLib, "ext-skill"), "dir");

      // Add sets.json
      const setsContent = { all: ["real-skill", "ext-skill"] };
      fs.writeFileSync(path.join(legacyRoot, "sets.json"), JSON.stringify(setsContent) + "\n");

      // Run migration
      const { migrate: migrateModule } = await loadModules(cleanHome);
      const result = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify all components migrated
      expect(result.movedLibrary).toContain("real-skill");
      expect(result.recreatedExternalLinks).toContain("ext-skill");
      expect(fs.existsSync(path.join(paths.SETS_FILE))).toBe(true);
      expect(fs.existsSync(legacyRoot)).toBe(false);
      } finally {
        vi.resetModules();
        fs.rmSync(cleanHome, { recursive: true, force: true });
      }
    });

    it("m12: preserves user and foreign active links while re-pointing managed ones", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy structure
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLib = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLib, { recursive: true });

      // Create real skill in legacy
      const realSkillPath = path.join(legacyLib, "managed-skill");
      fs.mkdirSync(realSkillPath, { recursive: true });
      fs.writeFileSync(path.join(realSkillPath, "SKILL.md"), "---\nname: managed\n---\n");

      // Create active dir with managed and foreign links
      const activeDir = paths.activeSkillsDir("user");
      fs.mkdirSync(activeDir, { recursive: true });

      // Managed link
      const managedLinkPath = path.join(activeDir, "managed-skill");
      fs.symlinkSync(realSkillPath, managedLinkPath, "dir");

      // Foreign link
      const foreignDir = path.join(tempHome, "foreign-external");
      fs.mkdirSync(foreignDir, { recursive: true });
      fs.writeFileSync(path.join(foreignDir, "SKILL.md"), "---\nname: foreign\n---\n");
      const foreignLinkPath = path.join(activeDir, "foreign-link");
      fs.symlinkSync(foreignDir, foreignLinkPath, "dir");

      // Real directory (from init)
      const realDirPath = path.join(activeDir, "real-dir");
      fs.mkdirSync(realDirPath, { recursive: true });
      fs.writeFileSync(path.join(realDirPath, "SKILL.md"), "---\nname: real-dir\n---\n");

      // Run migration
      const { migrate: migrateModule, fsutil } = await loadModules(tempHome);
      const result = migrateModule.migrate(legacyRoot, legacyLib, path.join(legacyRoot, "sets.json"));

      // Verify managed link re-pointed
      expect(result.repointedActive).toContain("managed-skill");
      const managedTarget = fsutil.immediateTarget(managedLinkPath);
      const expectedTarget = fsutil.resolveSafe(path.join(paths.LIBRARY_DIR, "managed-skill")) ?? path.join(paths.LIBRARY_DIR, "managed-skill");
      expect(managedTarget).toBe(expectedTarget);

      // Verify foreign link untouched
      expect(result.foreignSkipped).toContain("foreign-link");
      expect(fs.lstatSync(foreignLinkPath).isSymbolicLink()).toBe(true);
      const foreignTarget = fsutil.immediateTarget(foreignLinkPath);
      const expectedForeignTarget = fsutil.resolveSafe(foreignDir) ?? foreignDir;
      expect(foreignTarget).toBe(expectedForeignTarget);

      // Verify real directory untouched
      expect(fs.lstatSync(realDirPath).isDirectory()).toBe(true);
      expect(fs.existsSync(path.join(realDirPath, "SKILL.md"))).toBe(true);
    });
  });
});
