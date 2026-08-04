import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRun, runResume, setClaudeRunner } from "../src/commands/run.js";
import { sessionById, recordSession } from "../src/suitrc.js";
import { materializeTmpRoot, materializedDirFor } from "../src/materialize.js";
import { saveSuit } from "../src/suits.js";
import { STRONGSUIT_DIR, CLAUDE_HOME } from "../src/paths.js";

const LIB = path.join(STRONGSUIT_DIR, "library");

function makeSkill(name: string): void {
  const dir = path.join(LIB, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
}

/** Stable fingerprint of a tree: sorted relative paths + kind + content/link target. */
function fingerprint(dir: string): string[] {
  if (!fs.existsSync(dir)) return ["<absent>"];
  const out: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (entry.isSymbolicLink()) {
        out.push(`${rel} -> ${path.resolve(fs.readlinkSync(full).replace(/^\\\\\?\\/, ""))}`);
      } else if (entry.isDirectory()) {
        out.push(`${rel}/`);
        visit(full);
      } else {
        out.push(`${rel} ${fs.readFileSync(full, "utf8").length}`);
      }
    }
  };
  visit(dir);
  return out;
}

let savedTmp: string | undefined;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  savedTmp = process.env.STRONGSUIT_TMP;
  process.env.STRONGSUIT_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "strongsuit-run-test-"));
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  setClaudeRunner(null);
  logSpy.mockRestore();
  fs.rmSync(process.env.STRONGSUIT_TMP!, { recursive: true, force: true });
  process.env.STRONGSUIT_TMP = savedTmp;
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
});

function logged(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

describe("suit run (r1–r3): flags, passthrough, exit code, cleanup", () => {
  it("launches claude with the materialized flags plus verbatim passthrough", async () => {
    makeSkill("alpha");
    saveSuit({ name: "focus", components: { skills: ["alpha"] } });

    let seen: { command: string; args: string[] } | undefined;
    setClaudeRunner((command, args) => {
      seen = { command, args };
      return { status: 0 };
    });

    const code = await runRun("focus", ["--model", "opus", "-p", "hi"]);

    expect(code).toBe(0);
    expect(seen!.command).toBe("claude");
    const root = materializedDirFor("focus");
    // Passthrough leads: a positional prompt after the variadic --mcp-config
    // would be swallowed as another config path (XO-188). Then the minted
    // session id, then the suit flags.
    expect(seen!.args.slice(0, 4)).toEqual(["--model", "opus", "-p", "hi"]);
    expect(seen!.args[4]).toBe("--session-id");
    expect(seen!.args[5]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen!.args.slice(6)).toEqual([
      "--plugin-dir",
      root,
      "--strict-mcp-config",
      "--mcp-config",
      path.join(root, "mcp.json"),
    ]);
  });

  it("forwards the child's exit code", async () => {
    saveSuit({ name: "failing" });
    setClaudeRunner(() => ({ status: 7 }));
    expect(await runRun("failing")).toBe(7);
  });

  it("maps a signal-killed child to 128+signal", async () => {
    saveSuit({ name: "killed" });
    setClaudeRunner(() => ({ status: null, signal: "SIGINT" }));
    expect(await runRun("killed")).toBe(128 + os.constants.signals.SIGINT);
  });

  it("cleans the temp dir after the session ends — success and throw alike", async () => {
    makeSkill("alpha");
    saveSuit({ name: "tidy", components: { skills: ["alpha"] } });

    let rootDuring = "";
    setClaudeRunner(() => {
      rootDuring = materializedDirFor("tidy");
      expect(fs.existsSync(rootDuring)).toBe(true); // exists while the session runs
      return { status: 0 };
    });
    await runRun("tidy");
    expect(fs.existsSync(rootDuring)).toBe(false);

    setClaudeRunner(() => {
      throw new Error("spawn failed");
    });
    await expect(runRun("tidy")).rejects.toThrow("spawn failed");
    expect(fs.existsSync(materializedDirFor("tidy"))).toBe(false);
  });
});

describe("suit run (r4): zero global mutation", () => {
  it("leaves the Claude home byte-identical except the session map", async () => {
    makeSkill("alpha");
    saveSuit({
      name: "iso",
      components: { skills: ["alpha"], mcp: [{ name: "m", command: "npx" }] },
    });
    const before = fingerprint(CLAUDE_HOME);

    setClaudeRunner(() => ({ status: 0 }));
    await runRun("iso");

    // The one legitimate write is the session binding (XO-193) — strongsuit's
    // own state, not a Claude config surface. Everything else: untouched.
    const after = fingerprint(CLAUDE_HOME);
    const changed = after.filter((line) => !before.includes(line));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatch(/^strongsuit\/sessions\.json /);
    expect(before.filter((line) => !after.includes(line))).toEqual([]);
  });
});

describe("suit run (r5–r7): errors, honest UX, sweep", () => {
  it("throws on an unknown suit without launching anything", async () => {
    const runner = vi.fn(() => ({ status: 0 }));
    setClaudeRunner(runner);
    await expect(runRun("nope")).rejects.toThrow(/not found/);
    expect(runner).not.toHaveBeenCalled();
  });

  it("prints the additive-baseline warning with ambient counts", async () => {
    saveSuit({ name: "warned" });
    const globalSkills = path.join(CLAUDE_HOME, "skills");
    fs.mkdirSync(path.join(globalSkills, "ambient-one"), { recursive: true });
    fs.mkdirSync(path.join(globalSkills, "ambient-two"), { recursive: true });

    setClaudeRunner(() => ({ status: 0 }));
    await runRun("warned");

    expect(logged()).toContain("2 global skill(s)");
    expect(logged()).toContain("additive");
  });

  it("prints the exclusivity line and what the suit wears", async () => {
    makeSkill("alpha");
    saveSuit({
      name: "shown",
      components: { skills: ["alpha"], mcp: [{ name: "m", command: "npx" }] },
    });
    setClaudeRunner(() => ({ status: 0 }));
    await runRun("shown");

    expect(logged()).toContain("wears suit 'shown'");
    expect(logged()).toContain("1 skill");
    expect(logged()).toContain("1 MCP server");
    expect(logged()).toContain("untouched");
  });

  it("reports non-deliverable component types instead of dropping them silently", async () => {
    saveSuit({ name: "partial", components: { rules: ["r"], claudemd: ["c"] } });
    setClaudeRunner(() => ({ status: 0 }));
    await runRun("partial");
    expect(logged()).toMatch(/Not deliverable per session.*rules/);
  });

  it("sweeps stale dirs from crashed runs on launch", async () => {
    saveSuit({ name: "sweeper" });
    // A guaranteed-dead pid: a child that has already exited. A hardcoded big
    // number can be a live pid on Linux (pid_max defaults to 4194304).
    const { spawnSync } = await import("node:child_process");
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
    const stale = path.join(materializeTmpRoot(), `strongsuit-run-crashed-${deadPid}`);
    fs.mkdirSync(stale, { recursive: true });

    setClaudeRunner(() => ({ status: 0 }));
    await runRun("sweeper");

    expect(fs.existsSync(stale)).toBe(false);
  });
});

describe("suit run + .suitrc + session map (XO-193)", () => {
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;
  let scratch: string;

  function chdirTo(dir: string): void {
    cwdSpy?.mockRestore();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);
  }

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "run-rc-test-"));
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cwdSpy = undefined;
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("run with no name wears the nearest .suitrc suit and records the binding", async () => {
    saveSuit({ name: "rcsuit" });
    const nested = path.join(scratch, "deep", "er");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(scratch, ".suitrc"), "# team suit\nrcsuit\n", "utf8");
    chdirTo(nested);

    let seen: string[] = [];
    setClaudeRunner((_c, args) => {
      seen = args;
      return { status: 0 };
    });
    expect(await runRun(undefined)).toBe(0);

    const id = seen[seen.indexOf("--session-id") + 1];
    expect(sessionById(id)).toMatchObject({ suit: "rcsuit", cwd: nested });
  });

  it("run with no name and no .suitrc anywhere refuses with guidance", async () => {
    chdirTo(scratch);
    const runner = vi.fn(() => ({ status: 0 }));
    setClaudeRunner(runner);
    await expect(runRun(undefined)).rejects.toThrow(/no \.suitrc found/);
    expect(runner).not.toHaveBeenCalled();
  });

  it("resume re-applies the LAUNCH suit's flags even after .suitrc changed", async () => {
    makeSkill("alpha");
    saveSuit({ name: "born-with", components: { skills: ["alpha"] } });
    saveSuit({ name: "directory-now-says" });
    fs.writeFileSync(path.join(scratch, ".suitrc"), "born-with\n", "utf8");
    chdirTo(scratch);

    let launchArgs: string[] = [];
    setClaudeRunner((_c, args) => {
      launchArgs = args;
      return { status: 0 };
    });
    await runRun(undefined);
    const id = launchArgs[launchArgs.indexOf("--session-id") + 1];

    // The directory moves on; the conversation must not.
    fs.writeFileSync(path.join(scratch, ".suitrc"), "directory-now-says\n", "utf8");

    let resumeArgs: string[] = [];
    setClaudeRunner((_c, args) => {
      resumeArgs = args;
      return { status: 0 };
    });
    expect(await runResume(id)).toBe(0);

    expect(resumeArgs.slice(0, 2)).toEqual(["--resume", id]);
    const root = materializedDirFor("born-with");
    expect(resumeArgs.slice(2)).toEqual([
      "--plugin-dir",
      root,
      "--strict-mcp-config",
      "--mcp-config",
      path.join(root, "mcp.json"),
    ]);
  });

  it("resume with no id picks the latest suit-launched session in this directory", async () => {
    saveSuit({ name: "first" });
    saveSuit({ name: "second" });
    chdirTo(scratch);
    recordSession("id-old", { suit: "first", cwd: scratch, launchedAt: "2026-08-01T00:00:00Z" });
    recordSession("id-new", { suit: "second", cwd: scratch, launchedAt: "2026-08-04T00:00:00Z" });

    let seen: string[] = [];
    setClaudeRunner((_c, args) => {
      seen = args;
      return { status: 0 };
    });
    await runResume(undefined);
    expect(seen.slice(0, 2)).toEqual(["--resume", "id-new"]);
  });

  it("resume refuses an id the wrapper never launched, and an empty directory history", async () => {
    chdirTo(scratch);
    const runner = vi.fn(() => ({ status: 0 }));
    setClaudeRunner(runner);
    await expect(runResume("deadbeef")).rejects.toThrow(/not launched through 'suit run'/);
    await expect(runResume(undefined)).rejects.toThrow(/No suit-launched session/);
    expect(runner).not.toHaveBeenCalled();
  });

  it("run --continue resumes the latest session in the directory", async () => {
    saveSuit({ name: "cont" });
    chdirTo(scratch);
    recordSession("id-cont", { suit: "cont", cwd: scratch, launchedAt: "2026-08-04T00:00:00Z" });

    let seen: string[] = [];
    setClaudeRunner((_c, args) => {
      seen = args;
      return { status: 0 };
    });
    await runRun(undefined, [], { continue: true });
    expect(seen.slice(0, 2)).toEqual(["--resume", "id-cont"]);
  });

  it("rejects session-lifecycle flags in passthrough — they would bypass the binding", async () => {
    saveSuit({ name: "guard" });
    const runner = vi.fn(() => ({ status: 0 }));
    setClaudeRunner(runner);
    await expect(runRun("guard", ["--resume", "x"])).rejects.toThrow(/bypass the session map/);
    await expect(runRun("guard", ["-c"])).rejects.toThrow(/bypass the session map/);
    await expect(runResume("any", ["--session-id", "y"])).rejects.toThrow(/bypass the session map/);
    expect(runner).not.toHaveBeenCalled();
  });
});
