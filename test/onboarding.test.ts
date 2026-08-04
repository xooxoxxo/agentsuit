import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { detectState, onboardingAdvice } from "../src/onboarding.js";
import { runList } from "../src/commands/list.js";
import { runSets } from "../src/commands/sets.js";
import { runUp } from "../src/commands/up.js";
import { saveSuit } from "../src/suits.js";
import { STRONGSUIT_DIR, LIBRARY_DIR, CLAUDE_HOME } from "../src/paths.js";

const ACTIVE = path.join(CLAUDE_HOME, "skills");

function makeLibrarySkill(name: string): string {
  const dir = path.join(LIBRARY_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
  fs.rmSync(ACTIVE, { recursive: true, force: true });
});

describe("detectState (o1)", () => {
  it("counts unmanaged real dirs, managed links, and foreign links separately", () => {
    const libSkill = makeLibrarySkill("managed");
    fs.mkdirSync(path.join(ACTIVE, "real-unmigrated"), { recursive: true });
    fs.symlinkSync(libSkill, path.join(ACTIVE, "managed"), "dir");
    const outside = fs.mkdtempSync(path.join(CLAUDE_HOME, "outside-"));
    fs.symlinkSync(outside, path.join(ACTIVE, "foreign"), "dir");
    fs.symlinkSync(path.join(CLAUDE_HOME, "no-such"), path.join(ACTIVE, "broken"), "dir");

    const state = detectState("user");
    expect(state.unmigratedReal).toBe(1);
    expect(state.foreignLinks).toBe(2); // foreign + broken
    expect(state.libraryCount).toBe(1);
  });

  it("a machine with nothing at all is a clean zero state", () => {
    expect(detectState("user")).toEqual({
      libraryCount: 0,
      suitsCount: 0,
      unmigratedReal: 0,
      foreignLinks: 0,
    });
  });
});

describe("onboardingAdvice (o2)", () => {
  it("suggests init-to-adopt when real skills exist unmanaged", () => {
    fs.mkdirSync(path.join(ACTIVE, "one"), { recursive: true });
    fs.mkdirSync(path.join(ACTIVE, "two"), { recursive: true });
    const text = onboardingAdvice("user")!.join("\n");
    expect(text).toContain("2 skill(s) live unmanaged");
    expect(text).toContain("suit init");
    expect(text).toContain("suit up");
  });

  it("suggests init/import/install on a truly fresh machine", () => {
    const text = onboardingAdvice("user")!.join("\n");
    expect(text).toContain("library is empty");
    expect(text).toContain("suit install");
    expect(text).toContain("suit new");
  });

  it("is null once the library is populated — nothing to onboard", () => {
    makeLibrarySkill("alpha");
    expect(onboardingAdvice("user")).toBeNull();
  });
});

describe("zero-state command output (o3)", () => {
  function logged(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  it("list on an empty library prints the next-step path, not a bare one-liner", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runList("user");
    expect(logged(spy)).toContain("suit init");
    expect(logged(spy)).toContain("suit up");
  });

  it("sets with no suits prints onboarding when the library is empty too", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runSets("user");
    expect(logged(spy)).toContain("suit init");
  });

  it("sets nudges toward 'suit new' when the library is populated but no sets exist", () => {
    makeLibrarySkill("alpha");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runSets("user");
    expect(logged(spy)).toContain("suit new");
    expect(logged(spy)).not.toContain("suit init");
  });

  it("up on an unknown suit lists what exists", async () => {
    saveSuit({ name: "focus" });
    saveSuit({ name: "writing" });
    await expect(runUp("nope", "user")).rejects.toThrow(/Available: focus, writing/);
  });

  it("up with no suits at all points at the onboarding path", async () => {
    await expect(runUp("nope", "user")).rejects.toThrow(/No suits defined yet[\s\S]*suit init/);
  });
});
