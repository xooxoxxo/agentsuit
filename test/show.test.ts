import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { runShow } from "../src/commands/show.js";
import { saveSuit } from "../src/suits.js";
import { STRONGSUIT_DIR, LIBRARY_DIR, CLAUDE_HOME } from "../src/paths.js";

function makeSkill(name: string): string {
  const dir = path.join(LIBRARY_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
  return dir;
}

let logSpy: ReturnType<typeof vi.spyOn>;
function logged(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(CLAUDE_HOME, "skills"), { recursive: true, force: true });
});

describe("suit show (XO-208)", () => {
  it("shows every component type with active state, hooks with full commands", () => {
    const lib = makeSkill("alpha");
    makeSkill("beta");
    const activeDir = path.join(CLAUDE_HOME, "skills");
    fs.mkdirSync(activeDir, { recursive: true });
    fs.symlinkSync(lib, path.join(activeDir, "alpha"), "dir");
    saveSuit({
      name: "full",
      description: "everything",
      components: {
        skills: ["alpha", "beta"],
        mcp: [{ name: "ctx", command: "npx" }],
        plugins: ["superpowers@official"],
        hooks: [{ event: "Stop", command: "notify-send done" }],
      },
    });

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runShow("full", "user");
    const out = logged();
    expect(out).toContain("● on  alpha");
    expect(out).toContain("○ off beta");
    expect(out).toContain("ctx");
    expect(out).toContain("superpowers@official");
    expect(out).toContain("Stop: notify-send done");
    expect(out).toContain("suit tailor full");
  });

  it("flags components that no longer resolve in the library", () => {
    makeSkill("alpha");
    saveSuit({ name: "stale", components: { skills: ["alpha", "gone-skill"] } });

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runShow("stale", "user");
    const out = logged();
    expect(out).toContain("gone-skill");
    expect(out).toMatch(/gone-skill.*missing from library/);
    expect(out).toContain("1 component(s) no longer resolve");
  });

  it("accepts .md-file components as resolving", () => {
    fs.mkdirSync(path.join(STRONGSUIT_DIR, "library", "commands"), { recursive: true });
    fs.writeFileSync(path.join(STRONGSUIT_DIR, "library", "commands", "deploy.md"), "# d", "utf8");
    saveSuit({ name: "cmds", components: { commands: ["deploy"] } });

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runShow("cmds", "user");
    expect(logged()).toContain("✓ deploy");
    expect(logged()).not.toContain("missing from library");
  });

  it("unknown suit lists what exists", () => {
    saveSuit({ name: "real" });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => runShow("nope", "user")).toThrow(/Available: real/);
  });
});
