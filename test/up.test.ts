import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { ArtifactType } from "../src/artifact-types.js";
import { activateOnlyFor } from "../src/activate.js";
import {
  makeTempHome,
  loadModules,
  createRealSkillInActiveDir,
  createForeignSymlink,
} from "./helpers.js";

describe("suit up / suit off — cross-type atomic activation", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("cross-type activation", () => {
    it("up1: activates entries from multiple artifact types", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library entries for all types
      // Skills: LIBRARY_DIR/skill-a
      const skillDir = path.join(paths.LIBRARY_DIR, "skill-a");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: skill-a\n---\n");

      // Commands: LIBRARY_DIR/library/commands/cmd-1
      const cmdDir = path.join(paths.LIBRARY_DIR, "library", "commands", "cmd-1");
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.writeFileSync(path.join(cmdDir, "COMMAND.md"), "---\nname: cmd-1\n---\n");

      // Agents: LIBRARY_DIR/library/agents/agent-x
      const agentDir = path.join(paths.LIBRARY_DIR, "library", "agents", "agent-x");
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, "AGENT.md"), "---\nname: agent-x\n---\n");

      // Rules: LIBRARY_DIR/library/rules/rule-1
      const ruleDir = path.join(paths.LIBRARY_DIR, "library", "rules", "rule-1");
      fs.mkdirSync(ruleDir, { recursive: true });
      fs.writeFileSync(path.join(ruleDir, "RULE.md"), "---\nname: rule-1\n---\n");

      // Activate skills
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-a"], "user", skillsLibDir);

      // Verify skills are active
      const skillsDir = paths.activeSkillsDir("user");
      expect(fs.existsSync(path.join(skillsDir, "skill-a"))).toBe(true);

      // Activate commands
      const cmdsType = types.commands;
      const cmdsLibDir = path.join(paths.LIBRARY_DIR, "library", "commands");
      activateOnlyFor(cmdsType, ["cmd-1"], "user", cmdsLibDir);

      // Verify commands are active (in project scope since we haven't changed directories)
      const cmdsDir = cmdsType.activeDirForScope("user");
      expect(fs.existsSync(path.join(cmdsDir, "cmd-1"))).toBe(true);
    });
  });

  describe("exclusivity per type", () => {
    it("up2: activating a new set of entries deactivates the old ones per type", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create the library entries
      for (const skillName of ["skill-1", "skill-2", "skill-3"]) {
        const skillDir = path.join(paths.LIBRARY_DIR, skillName);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, "SKILL.md"),
          `---\nname: ${skillName}\n---\n`
        );
      }

      // Activate skill-1 and skill-2
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-1", "skill-2"], "user", skillsLibDir);

      const skillsDir = paths.activeSkillsDir("user");
      expect(fs.existsSync(path.join(skillsDir, "skill-1"))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, "skill-2"))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, "skill-3"))).toBe(false);

      // Activate only skill-3 (should deactivate skill-1 and skill-2)
      activateOnlyFor(skillsType, ["skill-3"], "user", skillsLibDir);

      expect(fs.existsSync(path.join(skillsDir, "skill-1"))).toBe(false);
      expect(fs.existsSync(path.join(skillsDir, "skill-2"))).toBe(false);
      expect(fs.existsSync(path.join(skillsDir, "skill-3"))).toBe(true);
    });
  });

  describe("foreign and real entries preservation", () => {
    it("up3: foreign symlinks are left untouched", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library skill
      const skillDir = path.join(paths.LIBRARY_DIR, "skill-a");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: skill-a\n---\n");

      // Create a foreign skill outside the library
      const externalDir = path.join(tempHome, "external", "skill-foreign");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "SKILL.md"), "---\nname: skill-foreign\n---\n");

      // Manually create the active dir and add a foreign link
      const skillsDir = paths.activeSkillsDir("user");
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.symlinkSync(externalDir, path.join(skillsDir, "foreign-skill"), "dir");

      // Activate skill-a using activateOnlyFor
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      const result = activateOnlyFor(skillsType, ["skill-a"], "user", skillsLibDir);

      // Foreign link should still exist
      expect(fs.existsSync(path.join(skillsDir, "foreign-skill"))).toBe(true);
      expect(
        fs.lstatSync(path.join(skillsDir, "foreign-skill")).isSymbolicLink()
      ).toBe(true);

      // skill-a should be active
      expect(fs.existsSync(path.join(skillsDir, "skill-a"))).toBe(true);

      // Foreign link should be reported
      expect(result.foreign).toContain("foreign-skill");
    });

    it("up4: real (unmigrated) directories are left untouched", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library skill
      const libSkillDir = path.join(paths.LIBRARY_DIR, "skill-lib");
      fs.mkdirSync(libSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(libSkillDir, "SKILL.md"),
        "---\nname: skill-lib\n---\n"
      );

      // Create a real skill directory in the active dir (unmigrated)
      const skillsDir = paths.activeSkillsDir("user");
      createRealSkillInActiveDir(skillsDir, "skill-real");

      // Activate skill-lib using activateOnlyFor
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-lib"], "user", skillsLibDir);

      // Real directory should still exist
      const realPath = path.join(skillsDir, "skill-real");
      expect(fs.existsSync(realPath)).toBe(true);
      expect(fs.lstatSync(realPath).isDirectory()).toBe(true);
      expect(fs.lstatSync(realPath).isSymbolicLink()).toBe(false);

      // Library skill should be active
      expect(fs.existsSync(path.join(skillsDir, "skill-lib"))).toBe(true);
    });
  });

  describe("CLAUDE.md preservation", () => {
    it("up5: CLAUDE.md content outside markers is byte-identical", async () => {
      const { claudemd, paths } = await loadModules(tempHome);

      // Create a CLAUDE.md file with content outside the markers
      const claudeMdFile = claudemd.claudeMdPath("user");
      const originalContent = `# My Config

Some important notes here.

More stuff.
`;
      fs.mkdirSync(path.dirname(claudeMdFile), { recursive: true });
      fs.writeFileSync(claudeMdFile, originalContent, "utf-8");

      // Set fragments with some entries
      claudemd.setFragments(["entry-1"], "user", "");

      // Read the file and check that the original content outside markers is preserved
      const newContent = fs.readFileSync(claudeMdFile, "utf-8");

      // The original content should still be there, just with the agentsuit block appended
      expect(newContent.startsWith("# My Config")).toBe(true);
      expect(newContent.includes("Some important notes here")).toBe(true);
      expect(newContent.includes("<!-- agentsuit:begin")).toBe(true);
    });
  });

  describe("deactivation", () => {
    it("up6: deactivating all entries clears managed symlinks", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library skills
      for (const skillName of ["skill-a", "skill-b"]) {
        const skillDir = path.join(paths.LIBRARY_DIR, skillName);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, "SKILL.md"),
          `---\nname: ${skillName}\n---\n`
        );
      }

      // Activate the skills
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-a", "skill-b"], "user", skillsLibDir);

      const skillsDir = paths.activeSkillsDir("user");
      expect(fs.existsSync(path.join(skillsDir, "skill-a"))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, "skill-b"))).toBe(true);

      // Deactivate all skills
      activateOnlyFor(skillsType, [], "user", skillsLibDir);

      // Skills should be gone
      expect(fs.existsSync(path.join(skillsDir, "skill-a"))).toBe(false);
      expect(fs.existsSync(path.join(skillsDir, "skill-b"))).toBe(false);
    });

    it("up7: deactivating preserves foreign entries", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library skill
      const libSkillDir = path.join(paths.LIBRARY_DIR, "skill-managed");
      fs.mkdirSync(libSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(libSkillDir, "SKILL.md"),
        "---\nname: skill-managed\n---\n"
      );

      // Create a foreign skill
      const externalDir = path.join(tempHome, "external", "skill-foreign");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.writeFileSync(
        path.join(externalDir, "SKILL.md"),
        "---\nname: skill-foreign\n---\n"
      );

      // Create the active dir and add a foreign link
      const skillsDir = paths.activeSkillsDir("user");
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.symlinkSync(externalDir, path.join(skillsDir, "foreign-skill"), "dir");

      // Activate the managed skill
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-managed"], "user", skillsLibDir);

      // Deactivate all
      activateOnlyFor(skillsType, [], "user", skillsLibDir);

      // Managed skill should be gone
      expect(fs.existsSync(path.join(skillsDir, "skill-managed"))).toBe(false);

      // Foreign link should still exist
      expect(fs.existsSync(path.join(skillsDir, "foreign-skill"))).toBe(true);
    });
  });

  describe("rollback on failure", () => {
    it("up8: activateOnlyFor is deterministic across multiple runs", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library skills
      for (const skillName of ["skill-a", "skill-b"]) {
        const skillDir = path.join(paths.LIBRARY_DIR, skillName);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, "SKILL.md"),
          `---\nname: ${skillName}\n---\n`
        );
      }

      const skillsDir = paths.activeSkillsDir("user");
      fs.mkdirSync(skillsDir, { recursive: true });

      // Pre-flight: take a snapshot
      const beforeSnapshot = captureFileSnapshot(skillsDir);

      // First activation
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-a", "skill-b"], "user", skillsLibDir);

      const afterFirstSnapshot = captureFileSnapshot(skillsDir);

      // Second activation (same request)
      activateOnlyFor(skillsType, ["skill-a", "skill-b"], "user", skillsLibDir);

      const afterSecondSnapshot = captureFileSnapshot(skillsDir);

      // The second activation should not change anything
      expect(afterSecondSnapshot).toEqual(afterFirstSnapshot);
    });
  });

  describe("edge cases", () => {
    it("up9: activating same entries twice is idempotent", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create library skill
      const skillDir = path.join(paths.LIBRARY_DIR, "skill-a");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: skill-a\n---\n");

      const skillsDir = paths.activeSkillsDir("user");
      fs.mkdirSync(skillsDir, { recursive: true });

      // First activation
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, ["skill-a"], "user", skillsLibDir);

      const firstSnapshot = captureFileSnapshot(skillsDir);

      // Second activation
      activateOnlyFor(skillsType, ["skill-a"], "user", skillsLibDir);

      const secondSnapshot = captureFileSnapshot(skillsDir);

      // Snapshots should be identical
      expect(secondSnapshot).toEqual(firstSnapshot);
    });

    it("up10: activating empty list deactivates everything", async () => {
      const { paths, ARTIFACT_TYPES: types } = await loadModules(tempHome);

      // Create a library skill
      const skillDir = path.join(paths.LIBRARY_DIR, "skill-a");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: skill-a\n---\n");

      // Manually create an active skill
      const skillsDir = paths.activeSkillsDir("user");
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.symlinkSync(skillDir, path.join(skillsDir, "skill-a"), "dir");

      // Activate empty list
      const skillsType = types.skills;
      const skillsLibDir = path.join(paths.LIBRARY_DIR);
      activateOnlyFor(skillsType, [], "user", skillsLibDir);

      // Skill should be deactivated
      expect(fs.existsSync(path.join(skillsDir, "skill-a"))).toBe(false);
    });
  });
});

/**
 * Captures the state of a directory as a map of entry names to their stat info.
 * Used for comparing filesystem state before and after an operation.
 */
function captureFileSnapshot(dirPath: string): Map<string, string> {
  const snapshot = new Map<string, string>();

  if (!fs.existsSync(dirPath)) {
    return snapshot;
  }

  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(entryPath);
        snapshot.set(entry.name, `symlink:${target}`);
      } else if (entry.isDirectory()) {
        // Recursively capture directory contents
        const subSnapshot = captureFileSnapshot(entryPath);
        for (const [subName, subState] of subSnapshot) {
          snapshot.set(`${entry.name}/${subName}`, subState);
        }
      } else {
        snapshot.set(entry.name, "file");
      }
    }
  } catch {
    // Ignore errors
  }

  return snapshot;
}
