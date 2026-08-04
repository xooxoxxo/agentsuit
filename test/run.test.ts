import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRun, setClaudeRunner } from "../src/commands/run.js";
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
    expect(seen!.args.slice(0, 5)).toEqual([
      "--plugin-dir",
      root,
      "--strict-mcp-config",
      "--mcp-config",
      path.join(root, "mcp.json"),
    ]);
    expect(seen!.args.slice(-4)).toEqual(["--model", "opus", "-p", "hi"]);
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
  it("leaves the Claude home byte-identical", async () => {
    makeSkill("alpha");
    saveSuit({
      name: "iso",
      components: { skills: ["alpha"], mcp: [{ name: "m", command: "npx" }] },
    });
    const before = fingerprint(CLAUDE_HOME);

    setClaudeRunner(() => ({ status: 0 }));
    await runRun("iso");

    expect(fingerprint(CLAUDE_HOME)).toEqual(before);
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
