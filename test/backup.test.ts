import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome, loadModules } from "./helpers.js";

/**
 * Init backup and restore. The property under test is the round trip:
 * init → restore leaves the active skills dir exactly as it was, and restore
 * never overwrites anything the user changed since — same ownership rule as
 * everywhere else.
 */
describe("suit init backup / suit restore", () => {
  let tempHome: string;
  let external: string;

  beforeEach(() => {
    vi.resetModules();
    tempHome = makeTempHome();
    external = fs.mkdtempSync(path.join(os.tmpdir(), "external-skill-"));
    fs.writeFileSync(path.join(external, "SKILL.md"), "---\nname: ext\n---\nExternal.\n");
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  });

  async function load() {
    const modules = await loadModules(tempHome);
    const backup = await import("../src/backup.js");
    const init = await import("../src/commands/init.js");
    const restore = await import("../src/commands/restore.js");
    return { ...modules, backup, init, restore };
  }

  /** A realistic pre-init active dir: a real skill and a foreign symlink. */
  function seedActiveDir(activeDir: string): void {
    fs.mkdirSync(path.join(activeDir, "real-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(activeDir, "real-skill", "SKILL.md"),
      "---\nname: real-skill\n---\nOriginal content.\n"
    );
    fs.symlinkSync(external, path.join(activeDir, "ext"), "dir");
  }

  /** lstat-level fingerprint of a directory: name -> kind + link target or file bytes. */
  function fingerprint(dir: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        // Normalize the target: Windows junctions report \\?\-prefixed,
        // trailing-separator paths that differ textually between a live link
        // and its snapshot round trip while pointing at the same place.
        const raw = fs.readlinkSync(full).replace(/^\\\\\?\\/, "");
        result[name] = `link:${path.resolve(raw)}`;
      } else if (stat.isDirectory()) {
        result[name] = `dir:${fs
          .readdirSync(full)
          .sort()
          .map((f) => `${f}=${fs.readFileSync(path.join(full, f), "utf-8")}`)
          .join("|")}`;
      } else {
        result[name] = `file:${fs.readFileSync(full, "utf-8")}`;
      }
    }
    return result;
  }

  it("b1: init takes a snapshot before anything moves", async () => {
    const { paths, backup, init } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);
    const before = fingerprint(activeDir);

    init.runInit("user");

    const backups = backup.listInitBackups("user");
    expect(backups).toHaveLength(1);
    expect(backups[0].entries).toEqual(["ext", "real-skill"]);
    // The snapshot holds the pre-init state even though init has since
    // replaced the real dir with a symlink.
    expect(fingerprint(path.join(backups[0].dir, "skills"))).toEqual(before);
    expect(fs.lstatSync(path.join(activeDir, "real-skill")).isSymbolicLink()).toBe(true);
  });

  it("b2: init → restore is a byte-identical round trip", async () => {
    const { paths, init, backup } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);
    const before = fingerprint(activeDir);

    init.runInit("user");
    expect(fingerprint(activeDir)).not.toEqual(before);

    const result = backup.restoreInitBackup("user", paths.LIBRARY_DIR);
    expect(result.restored.sort()).toEqual(["ext", "real-skill"]);
    expect(result.refused).toEqual([]);
    expect(fingerprint(activeDir)).toEqual(before);
  });

  it("b3: restore refuses an entry the user replaced with a real directory", async () => {
    const { paths, init, backup } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);

    init.runInit("user");

    // The user deletes the managed link and writes a new real skill there.
    fs.unlinkSync(path.join(activeDir, "real-skill"));
    fs.mkdirSync(path.join(activeDir, "real-skill"));
    fs.writeFileSync(
      path.join(activeDir, "real-skill", "SKILL.md"),
      "---\nname: real-skill\n---\nRewritten after init. Must survive restore.\n"
    );

    const result = backup.restoreInitBackup("user", paths.LIBRARY_DIR);

    expect(result.refused).toEqual(["real-skill"]);
    expect(result.restored).toEqual(["ext"]);
    expect(fs.readFileSync(path.join(activeDir, "real-skill", "SKILL.md"), "utf-8")).toContain(
      "Must survive restore"
    );
  });

  it("b4: restore refuses a foreign symlink at a backed-up name", async () => {
    const { paths, init, backup } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);

    init.runInit("user");

    // The user re-points the entry somewhere of their own.
    fs.unlinkSync(path.join(activeDir, "ext"));
    fs.symlinkSync(external, path.join(activeDir, "ext"), "dir");

    const result = backup.restoreInitBackup("user", paths.LIBRARY_DIR);

    expect(result.refused).toContain("ext");
    expect(fs.readlinkSync(path.join(activeDir, "ext"))).toBe(external);
  });

  it("b5: restore leaves entries the snapshot does not know about", async () => {
    const { paths, init, backup } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);

    init.runInit("user");

    fs.mkdirSync(path.join(activeDir, "added-later"));
    fs.writeFileSync(path.join(activeDir, "added-later", "SKILL.md"), "---\nname: later\n---\n");

    const result = backup.restoreInitBackup("user", paths.LIBRARY_DIR);

    expect(result.untouched).toEqual(["added-later"]);
    expect(fs.existsSync(path.join(activeDir, "added-later", "SKILL.md"))).toBe(true);
  });

  it("b6: restore restores a missing entry", async () => {
    const { paths, init, backup } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);

    init.runInit("user");
    fs.unlinkSync(path.join(activeDir, "real-skill"));

    const result = backup.restoreInitBackup("user", paths.LIBRARY_DIR);

    expect(result.restored).toContain("real-skill");
    expect(
      fs.readFileSync(path.join(activeDir, "real-skill", "SKILL.md"), "utf-8")
    ).toContain("Original content");
  });

  it("b7: restore without a backup fails with a pointer, not a crash", async () => {
    const { paths, backup } = await load();
    expect(() => backup.restoreInitBackup("user", paths.LIBRARY_DIR)).toThrow(/No init backup/);
  });

  it("b8: an empty active dir produces no backup", async () => {
    const { paths, backup } = await load();
    fs.mkdirSync(paths.activeSkillsDir("user"), { recursive: true });
    expect(backup.createInitBackup("user")).toBeNull();
    expect(backup.listInitBackups("user")).toEqual([]);
  });

  it("b9: a second init takes a second snapshot and restore uses the newest", async () => {
    const { paths, init, backup } = await load();
    const activeDir = paths.activeSkillsDir("user");
    fs.mkdirSync(activeDir, { recursive: true });
    seedActiveDir(activeDir);

    init.runInit("user");

    // New real skill appears; user runs init again.
    fs.mkdirSync(path.join(activeDir, "second-wave"));
    fs.writeFileSync(
      path.join(activeDir, "second-wave", "SKILL.md"),
      "---\nname: second-wave\n---\n"
    );
    const secondState = fingerprint(activeDir);
    init.runInit("user");

    const backups = backup.listInitBackups("user");
    expect(backups.length).toBe(2);

    backup.restoreInitBackup("user", paths.LIBRARY_DIR);
    expect(fingerprint(activeDir)).toEqual(secondState);
  });

  it("b10: backups live inside the managed root and are enumerated by the guard", async () => {
    const { backup } = await load();
    const { allManagedPaths } = await import("../src/managed-paths.js");
    const dir = backup.initBackupsDir("user");
    expect(dir.startsWith(tempHome)).toBe(true);
    expect(allManagedPaths("user").map((p) => path.resolve(p))).toContain(path.resolve(dir));
  });
});
