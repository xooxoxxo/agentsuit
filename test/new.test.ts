import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { runNew } from "../src/commands/new.js";
import { loadSets } from "../src/sets.js";
import { STRONGSUIT_DIR } from "../src/paths.js";

const LIB = path.join(STRONGSUIT_DIR, "library");

function makeSkill(name: string): void {
  const dir = path.join(LIB, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
});

describe("suit new --skills (XO-156 non-interactive)", () => {
  it("defines a set from the flag without any prompt", async () => {
    makeSkill("alpha");
    makeSkill("beta");
    vi.spyOn(console, "log").mockImplementation(() => {});

    await runNew("coding", { skills: ["alpha", "beta"] });

    expect(loadSets()["coding"]).toEqual(["alpha", "beta"]);
  });

  it("overwrites an existing set without prompting — the flag is the consent", async () => {
    makeSkill("alpha");
    makeSkill("beta");
    vi.spyOn(console, "log").mockImplementation(() => {});

    await runNew("coding", { skills: ["alpha"] });
    await runNew("coding", { skills: ["beta"] });

    expect(loadSets()["coding"]).toEqual(["beta"]);
  });

  it("rejects unknown skills, listing what the library actually has", async () => {
    makeSkill("alpha");
    await expect(runNew("coding", { skills: ["alpha", "ghost"] })).rejects.toThrow(
      /Unknown skill\(s\): ghost.*library has: alpha/
    );
    expect(loadSets()["coding"]).toBeUndefined();
  });

  it("points at 'suit init' when the library is empty", async () => {
    await expect(runNew("coding", { skills: ["anything"] })).rejects.toThrow(
      /library is empty — run 'suit init'/
    );
  });

  it("without --skills on a non-TTY, fails with the scripting hint instead of hanging", async () => {
    makeSkill("alpha");
    await expect(runNew("coding", { interactive: false })).rejects.toThrow(
      /suit new coding --skills a,b,c/
    );
  });
});
