import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { runTailor } from "../src/commands/tailor.js";
import { loadSets } from "../src/sets.js";
import { STRONGSUIT_DIR, LIBRARY_DIR } from "../src/paths.js";

function makeSkill(name: string): void {
  const dir = path.join(LIBRARY_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
});

describe("suit tailor (XO-207)", () => {
  it("--add merges into an existing suit, --remove takes out", async () => {
    makeSkill("alpha");
    makeSkill("beta");
    makeSkill("gamma");
    vi.spyOn(console, "log").mockImplementation(() => {});

    await runTailor("coding", { skills: ["alpha", "beta"] });
    await runTailor("coding", { add: ["gamma"], remove: ["alpha"] });

    expect(loadSets()["coding"].sort()).toEqual(["beta", "gamma"]);
  });

  it("refuses to add unknown skills, listing the library", async () => {
    makeSkill("alpha");
    await expect(runTailor("coding", { add: ["ghost"] })).rejects.toThrow(
      /unknown skill\(s\): ghost.*library has: alpha/
    );
    expect(loadSets()["coding"]).toBeUndefined();
  });

  it("removing a skill that is not a member is a no-op, noted not failed", async () => {
    makeSkill("alpha");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runTailor("coding", { skills: ["alpha"] });
    await runTailor("coding", { remove: ["never-there"] });
    expect(loadSets()["coding"]).toEqual(["alpha"]);
    expect(spy.mock.calls.join("\n")).toContain("not in the suit anyway");
  });

  it("rejects --skills combined with --add/--remove as ambiguous", async () => {
    await expect(runTailor("coding", { skills: ["a"], add: ["b"] })).rejects.toThrow(/ambiguous/);
  });

  it("--skills replaces the whole list (delegates to the validated path)", async () => {
    makeSkill("alpha");
    makeSkill("beta");
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runTailor("coding", { skills: ["alpha", "beta"] });
    await runTailor("coding", { skills: ["beta"] });
    expect(loadSets()["coding"]).toEqual(["beta"]);
  });

  it("no flags on a non-TTY fails with the scripting hint instead of hanging", async () => {
    makeSkill("alpha");
    await expect(runTailor("coding", { interactive: false })).rejects.toThrow(/--skills a,b,c/);
  });
});
