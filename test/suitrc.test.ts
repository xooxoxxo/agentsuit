import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findSuitrc,
  readSuitrc,
  sessionsPath,
  readSessions,
  recordSession,
  sessionById,
  latestSessionFor,
} from "../src/suitrc.js";
import { STRONGSUIT_DIR } from "../src/paths.js";

let scratch: string;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "suitrc-test-"));
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
});

describe(".suitrc lookup (s1)", () => {
  it("finds the nearest ancestor's file", () => {
    const nested = path.join(scratch, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(scratch, ".suitrc"), "outer\n", "utf8");
    fs.writeFileSync(path.join(scratch, "a", "b", ".suitrc"), "inner\n", "utf8");

    expect(findSuitrc(nested)).toBe(path.join(scratch, "a", "b", ".suitrc"));
    expect(findSuitrc(path.join(scratch, "a"))).toBe(path.join(scratch, ".suitrc"));
  });

  it("returns null when no ancestor has one", () => {
    const nested = path.join(scratch, "empty");
    fs.mkdirSync(nested, { recursive: true });
    // scratch lives under the OS tmpdir; no .suitrc anywhere up that chain in CI
    expect(findSuitrc(nested)).toBeNull();
  });
});

describe(".suitrc parsing (s2)", () => {
  it("reads one name, ignoring comments and blank lines", () => {
    const file = path.join(scratch, ".suitrc");
    fs.writeFileSync(file, "# the deep-work suit\n\n  focus  \n# trailing comment\n", "utf8");
    expect(readSuitrc(file)).toBe("focus");
  });

  it("rejects a file that names no suit", () => {
    const file = path.join(scratch, ".suitrc");
    fs.writeFileSync(file, "# only comments\n\n", "utf8");
    expect(() => readSuitrc(file)).toThrow(/names no suit/);
  });

  it("rejects multiple names instead of silently picking one", () => {
    const file = path.join(scratch, ".suitrc");
    fs.writeFileSync(file, "focus\nwriting\n", "utf8");
    expect(() => readSuitrc(file)).toThrow(/expected exactly one suit name, found 2/);
  });
});

describe("session map (s3)", () => {
  it("records and reads back bindings across separate calls", () => {
    recordSession("aaa", { suit: "focus", cwd: "/w/one", launchedAt: "2026-08-04T10:00:00Z" });
    recordSession("bbb", { suit: "writing", cwd: "/w/two", launchedAt: "2026-08-04T11:00:00Z" });

    expect(sessionById("aaa")?.suit).toBe("focus");
    expect(sessionById("bbb")?.suit).toBe("writing");
    expect(sessionById("ccc")).toBeUndefined();
    expect(Object.keys(readSessions())).toHaveLength(2);
  });

  it("latestSessionFor picks the newest binding for that directory only", () => {
    recordSession("old", { suit: "focus", cwd: "/w/one", launchedAt: "2026-08-01T00:00:00Z" });
    recordSession("new", { suit: "writing", cwd: "/w/one", launchedAt: "2026-08-04T00:00:00Z" });
    recordSession("other", { suit: "ops", cwd: "/w/two", launchedAt: "2026-08-05T00:00:00Z" });

    expect(latestSessionFor("/w/one")?.id).toBe("new");
    expect(latestSessionFor("/w/three")).toBeNull();
  });

  it("a corrupt map throws instead of silently becoming empty", () => {
    fs.mkdirSync(path.dirname(sessionsPath()), { recursive: true });
    fs.writeFileSync(sessionsPath(), "{not json", "utf8");
    expect(() => readSessions()).toThrow(/corrupt/);
    // and recording refuses too — a write after silent reset would wipe every binding
    expect(() =>
      recordSession("x", { suit: "s", cwd: "/", launchedAt: "2026-08-04T00:00:00Z" })
    ).toThrow(/corrupt/);
    expect(fs.readFileSync(sessionsPath(), "utf8")).toBe("{not json");
  });

  it("missing map file reads as empty", () => {
    expect(readSessions()).toEqual({});
  });
});
