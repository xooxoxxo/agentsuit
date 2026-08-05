import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { runStatus } from "../src/commands/status.js";
import { saveSuit } from "../src/suits.js";
import { recordSession } from "../src/suitrc.js";
import { STRONGSUIT_DIR, LIBRARY_DIR, CLAUDE_HOME } from "../src/paths.js";
import { settingsPath } from "../src/hooks.js";

const ACTIVE = path.join(CLAUDE_HOME, "skills");
let scratch: string;
let logSpy: ReturnType<typeof vi.spyOn>;

function makeSkill(name: string, body = "body"): string {
  const dir = path.join(LIBRARY_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${body}`, "utf8");
  return dir;
}

function activate(name: string): void {
  fs.mkdirSync(ACTIVE, { recursive: true });
  fs.symlinkSync(path.join(LIBRARY_DIR, name), path.join(ACTIVE, name), "dir");
}

function logged(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "status-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(scratch);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
  fs.rmSync(ACTIVE, { recursive: true, force: true });
});

describe("suit status (XO-148)", () => {
  it("--short prints the exact-match one-liner", () => {
    makeSkill("alpha");
    makeSkill("beta");
    saveSuit({ name: "coding", components: { skills: ["alpha"] } });
    activate("alpha");

    runStatus("user", { short: true });
    expect(logged()).toMatch(/^coding · 1\/2 · ~\d+tok$/);
  });

  it("--short says 'mixed' when active skills match no suit, 'none' when nothing active", () => {
    makeSkill("alpha");
    makeSkill("beta");
    saveSuit({ name: "coding", components: { skills: ["alpha", "beta"] } });
    activate("alpha");
    runStatus("user", { short: true });
    expect(logged()).toContain("mixed");

    logSpy.mockClear();
    fs.rmSync(ACTIVE, { recursive: true, force: true });
    runStatus("user", { short: true });
    expect(logged()).toContain("none");
  });

  it("dashboard shows .suitrc, session binding, and attention items", () => {
    makeSkill("alpha");
    saveSuit({ name: "coding", components: { skills: ["alpha", "gone-skill"] } });
    activate("alpha");
    fs.writeFileSync(path.join(scratch, ".suitrc"), "coding\n", "utf8");
    recordSession("abc12345-x", { suit: "coding", cwd: scratch, launchedAt: "2026-08-05T00:00:00Z" });
    fs.mkdirSync(path.dirname(settingsPath("user")), { recursive: true });
    fs.writeFileSync(settingsPath("user"), JSON.stringify({ skillOverrides: { alpha: "off" } }), "utf8");

    runStatus("user");
    const out = logged();
    expect(out).toContain(".suitrc wants 'coding'");
    expect(out).toContain("latest here wore 'coding'");
    expect(out).toContain("toggled off in Claude Code /skills");
    // Wearing shows 'mixed' because gone-skill can't be active — but the worn
    // suit's dangling check runs off the exact match; assert the override line
    // carried the attention section either way.
    expect(out).toContain("Needs attention");
  });

  it("warns when active description tokens exceed the threshold", () => {
    makeSkill("big", "x".repeat(12000));
    saveSuit({ name: "heavy", components: { skills: ["big"] } });
    activate("big");

    runStatus("user");
    expect(logged()).toContain("consider a leaner set");

    logSpy.mockClear();
    process.env.STRONGSUIT_TOKEN_WARN = "999999";
    runStatus("user");
    expect(logged()).not.toContain("consider a leaner set");
    delete process.env.STRONGSUIT_TOKEN_WARN;
  });

  it("flags the worn suit's dangling components", () => {
    makeSkill("alpha");
    saveSuit({ name: "coding", components: { skills: ["alpha"], commands: ["gone-cmd"] } });
    activate("alpha");

    runStatus("user");
    expect(logged()).toMatch(/commands missing from library.*gone-cmd/);
  });
});
