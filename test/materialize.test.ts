import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  materializeSuit,
  materializedDirFor,
  materializeTmpRoot,
  cleanupMaterialized,
  registerExitCleanup,
  sweepStaleMaterialized,
} from "../src/materialize.js";
import { STRONGSUIT_DIR, CLAUDE_HOME } from "../src/paths.js";
import type { SuitManifest } from "../src/suits.js";

const LIB = path.join(STRONGSUIT_DIR, "library");

function makeSkill(name: string): string {
  const dir = path.join(LIB, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
  return dir;
}

function makeCommand(name: string): string {
  const dir = path.join(LIB, "commands");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, `# ${name}`, "utf8");
  return file;
}

/** Every path in a tree, relative to root. */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    out.push(path.relative(base, full));
    if (entry.isDirectory() && !entry.isSymbolicLink()) out.push(...walk(full, base));
  }
  return out.sort();
}

let savedTmp: string | undefined;

beforeEach(() => {
  savedTmp = process.env.STRONGSUIT_TMP;
  process.env.STRONGSUIT_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "strongsuit-mat-"));
});

afterEach(() => {
  fs.rmSync(process.env.STRONGSUIT_TMP!, { recursive: true, force: true });
  process.env.STRONGSUIT_TMP = savedTmp;
  fs.rmSync(LIB, { recursive: true, force: true });
});

describe("materializeSuit — structure (m1)", () => {
  it("produces a plugin dir with plugin.json and library symlinks", () => {
    const skillDir = makeSkill("alpha");
    const cmdFile = makeCommand("deploy");
    const suit: SuitManifest = {
      name: "Focus Suit",
      components: { skills: ["alpha"], commands: ["deploy"] },
    };

    const mat = materializeSuit(suit);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(mat.root, ".claude-plugin", "plugin.json"), "utf8")
    );
    expect(manifest.name).toBe("strongsuit-run-focus-suit");
    expect(manifest.description).toContain("Focus Suit");

    const skillLink = path.join(mat.root, "skills", "alpha");
    expect(fs.lstatSync(skillLink).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(skillLink)).toBe(fs.realpathSync(skillDir));
    expect(fs.existsSync(path.join(skillLink, "SKILL.md"))).toBe(true);

    const cmdLink = path.join(mat.root, "commands", "deploy.md");
    expect(fs.lstatSync(cmdLink).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(cmdLink)).toBe(fs.realpathSync(cmdFile));
  });

  it("is deterministic per process: same suit + pid → same path, replaced on re-run (m11)", () => {
    makeSkill("alpha");
    const suit: SuitManifest = { name: "focus", components: { skills: ["alpha"] } };

    const first = materializeSuit(suit);
    fs.writeFileSync(path.join(first.root, "leftover.txt"), "old", "utf8");
    const second = materializeSuit(suit);

    expect(second.root).toBe(first.root);
    expect(second.root).toBe(materializedDirFor("focus"));
    expect(fs.existsSync(path.join(second.root, "leftover.txt"))).toBe(false);
  });

  it("writes nothing outside its own root (m10)", () => {
    makeSkill("alpha");
    const tmpRoot = materializeTmpRoot();
    const before = fs.readdirSync(tmpRoot).sort();

    const mat = materializeSuit({ name: "tidy", components: { skills: ["alpha"] } });

    const after = fs.readdirSync(tmpRoot).sort();
    expect(after).toEqual([...before, path.basename(mat.root)].sort());
    for (const rel of walk(mat.root)) {
      expect(path.resolve(mat.root, rel).startsWith(path.resolve(mat.root))).toBe(true);
    }
  });
});

describe("materializeSuit — verification (m2, m3)", () => {
  it("throws when a referenced component is not in the library, leaving no dir behind", () => {
    const suit: SuitManifest = { name: "ghost", components: { skills: ["missing"] } };
    expect(() => materializeSuit(suit)).toThrow(/skills\/missing.*not found in library/);
    expect(fs.existsSync(materializedDirFor("ghost"))).toBe(false);
  });

  it("throws on a broken library symlink instead of materializing a dead link", () => {
    fs.mkdirSync(LIB, { recursive: true });
    fs.symlinkSync(path.join(LIB, "no-such-target"), path.join(LIB, "broken"));
    const suit: SuitManifest = { name: "broke", components: { skills: ["broken"] } };
    expect(() => materializeSuit(suit)).toThrow(/skills\/broken/);
    expect(fs.existsSync(materializedDirFor("broke"))).toBe(false);
  });

  it("refuses a temp root inside the Claude home (m10)", () => {
    process.env.STRONGSUIT_TMP = path.join(CLAUDE_HOME, "evil-tmp");
    expect(() => materializeSuit({ name: "trapped" })).toThrow(/Claude home/);
    expect(fs.existsSync(path.join(CLAUDE_HOME, "evil-tmp"))).toBe(false);
  });
});

describe("materializeSuit — MCP config (m4)", () => {
  it("emits the suit's servers keyed by name, name field stripped", () => {
    const suit: SuitManifest = {
      name: "wired",
      components: {
        mcp: [
          { name: "files", command: "npx", args: ["mcp-files"] },
          { name: "api", type: "http", url: "https://mcp.example.com" },
        ],
      },
    };

    const mat = materializeSuit(suit);
    const config = JSON.parse(fs.readFileSync(mat.mcpConfigFile, "utf8"));
    expect(config).toEqual({
      mcpServers: {
        files: { command: "npx", args: ["mcp-files"] },
        api: { type: "http", url: "https://mcp.example.com" },
      },
    });
  });

  it("emits an empty mcpServers file when the suit has none — strict replacement still applies", () => {
    const mat = materializeSuit({ name: "bare" });
    const config = JSON.parse(fs.readFileSync(mat.mcpConfigFile, "utf8"));
    expect(config).toEqual({ mcpServers: {} });
  });

  it("rejects an invalid MCP entry before anything launches", () => {
    const suit: SuitManifest = { name: "badmcp", components: { mcp: [{ name: "x" }] } };
    expect(() => materializeSuit(suit)).toThrow(/Invalid MCP server/);
    expect(fs.existsSync(materializedDirFor("badmcp"))).toBe(false);
  });
});

describe("materializeSuit — hooks settings (m5)", () => {
  it("emits a settings file in Claude's hooks shape only when the suit carries hooks", () => {
    const withHooks = materializeSuit({
      name: "hooked",
      components: {
        hooks: [{ event: "PreToolUse", matcher: "Bash", command: "echo hi", timeout: 5 }],
      },
    });
    expect(withHooks.settingsFile).toBeDefined();
    const settings = JSON.parse(fs.readFileSync(withHooks.settingsFile!, "utf8"));
    expect(settings).toEqual({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo hi", timeout: 5 }] },
        ],
      },
    });

    const without = materializeSuit({ name: "plain" });
    expect(without.settingsFile).toBeUndefined();
    expect(fs.existsSync(path.join(without.root, "settings.json"))).toBe(false);
  });
});

describe("materializeSuit — flags and skipped (m6, m7)", () => {
  it("returns ready-to-splice flags, --settings only when present", () => {
    const mat = materializeSuit({ name: "flags" });
    expect(mat.flags).toEqual([
      "--plugin-dir",
      mat.root,
      "--strict-mcp-config",
      "--mcp-config",
      mat.mcpConfigFile,
    ]);

    const hooked = materializeSuit({
      name: "flags2",
      components: { hooks: [{ event: "Stop", command: "true" }] },
    });
    expect(hooked.flags.slice(-2)).toEqual(["--settings", hooked.settingsFile]);
  });

  it("reports component types the plugin layout cannot deliver", () => {
    const mat = materializeSuit({
      name: "mixed",
      components: { rules: ["r1"], claudemd: ["c1"], plugins: ["p@m"] },
    });
    expect(mat.skipped.sort()).toEqual(["claudemd", "plugins", "rules"]);
    expect(materializeSuit({ name: "clean" }).skipped).toEqual([]);
  });
});

describe("cleanupMaterialized (m8)", () => {
  it("removes a materialized dir", () => {
    const mat = materializeSuit({ name: "gone" });
    cleanupMaterialized(mat.root);
    expect(fs.existsSync(mat.root)).toBe(false);
  });

  it("refuses paths outside the temp root or without the run prefix", () => {
    fs.mkdirSync(LIB, { recursive: true });
    expect(() => cleanupMaterialized(LIB)).toThrow(/Refusing/);
    expect(fs.existsSync(LIB)).toBe(true);

    const impostor = path.join(materializeTmpRoot(), "not-ours-123");
    fs.mkdirSync(impostor, { recursive: true });
    expect(() => cleanupMaterialized(impostor)).toThrow(/Refusing/);
    expect(fs.existsSync(impostor)).toBe(true);

    const nested = path.join(materializeTmpRoot(), "sub", "strongsuit-run-x-1");
    fs.mkdirSync(nested, { recursive: true });
    expect(() => cleanupMaterialized(nested)).toThrow(/Refusing/);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it("registerExitCleanup removes the dir when the exit handler fires (m12)", () => {
    const spy = vi.spyOn(process, "on");
    const mat = materializeSuit({ name: "exiting" });
    registerExitCleanup(mat.root);

    const call = spy.mock.calls.find(([event]) => event === "exit");
    expect(call).toBeDefined();
    (call![1] as () => void)();
    expect(fs.existsSync(mat.root)).toBe(false);
    spy.mockRestore();
  });
});

describe("sweepStaleMaterialized (m9)", () => {
  it("removes dirs whose pid is dead, keeps live pids, own pid, and foreign names", () => {
    const tmp = materializeTmpRoot();
    const dead = path.join(tmp, "strongsuit-run-crashed-99999");
    const live = path.join(tmp, "strongsuit-run-other-4242");
    const own = materializeSuit({ name: "mine" }).root;
    const foreign = path.join(tmp, "strongsuit-test-abc123");
    const junk = path.join(tmp, "unrelated");
    for (const dir of [dead, live, foreign, junk]) fs.mkdirSync(dir, { recursive: true });

    const removed = sweepStaleMaterialized((pid) => pid === 4242);

    expect(removed).toEqual([dead]);
    expect(fs.existsSync(dead)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(own)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
    expect(fs.existsSync(junk)).toBe(true);
  });

  it("never consults liveness for the current process's own dirs", () => {
    const own = materializeSuit({ name: "self" }).root;
    const removed = sweepStaleMaterialized(() => false); // everything "dead"
    expect(removed).toEqual([]);
    expect(fs.existsSync(own)).toBe(true);
  });
});
