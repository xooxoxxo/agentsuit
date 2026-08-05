import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { externalArrivals, printArrivalNotice, runAdopt } from "../src/commands/adopt.js";
import { loadSets } from "../src/sets.js";
import { STRONGSUIT_DIR, LIBRARY_DIR, CLAUDE_HOME } from "../src/paths.js";

const ACTIVE = path.join(CLAUDE_HOME, "skills");

function makeManaged(name: string): void {
  const lib = path.join(LIBRARY_DIR, name);
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, "SKILL.md"), `---\nname: ${name}\n---\nbody`, "utf8");
  fs.mkdirSync(ACTIVE, { recursive: true });
  fs.symlinkSync(lib, path.join(ACTIVE, name), "dir");
}

function makeArrival(name: string): void {
  const dir = path.join(ACTIVE, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nnew`, "utf8");
}

let logSpy: ReturnType<typeof vi.spyOn>;
function logged(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
  fs.rmSync(ACTIVE, { recursive: true, force: true });
});

describe("suit adopt (XO-209)", () => {
  it("detects only unmanaged real dirs as arrivals", () => {
    makeManaged("old-timer");
    makeArrival("newcomer");
    expect(externalArrivals("user")).toEqual(["newcomer"]);
  });

  it("notice appears only post-init with arrivals present, and never before init", () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    makeArrival("newcomer"); // library still empty = pre-init
    printArrivalNotice("user");
    expect(logged()).toBe("");

    makeManaged("old-timer"); // library populated now
    printArrivalNotice("user");
    expect(logged()).toContain("newcomer");
    expect(logged()).toContain("suit adopt");
  });

  it("adopts arrivals into the library, replaces them with links, leaves managed entries alone", async () => {
    makeManaged("old-timer");
    makeArrival("newcomer");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runAdopt("user");

    expect(fs.existsSync(path.join(LIBRARY_DIR, "newcomer", "SKILL.md"))).toBe(true);
    expect(fs.lstatSync(path.join(ACTIVE, "newcomer")).isSymbolicLink()).toBe(true);
    // managed entry untouched
    expect(fs.lstatSync(path.join(ACTIVE, "old-timer")).isSymbolicLink()).toBe(true);
    expect(externalArrivals("user")).toEqual([]);
    // snapshot taken before the move
    expect(fs.existsSync(path.join(STRONGSUIT_DIR, "init-backups"))).toBe(true);
  });

  it("--to tailors the adopted skills into a suit", async () => {
    makeManaged("old-timer");
    makeArrival("newcomer");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runAdopt("user", { to: "coding" });

    expect(loadSets()["coding"]).toContain("newcomer");
    expect(loadSets()["coding"]).not.toContain("old-timer");
  });

  it("nothing to adopt is a calm no-op", async () => {
    makeManaged("old-timer");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAdopt("user");
    expect(logged()).toContain("Nothing new to adopt");
  });
});
