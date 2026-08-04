import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { offOverrides, clearOffOverrides } from "../src/skill-overrides.js";
import { settingsPath } from "../src/hooks.js";
import { runList } from "../src/commands/list.js";
import { STRONGSUIT_DIR, CLAUDE_HOME, LIBRARY_DIR } from "../src/paths.js";

const SETTINGS = settingsPath("user");

function writeSettings(obj: unknown): void {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(obj, null, 2), "utf8");
}

function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(SETTINGS, { force: true });
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(CLAUDE_HOME, "skills"), { recursive: true, force: true });
});

describe("skillOverrides reconciliation (XO-203)", () => {
  it("clears 'off' overrides for exactly the named skills, nothing else", () => {
    writeSettings({
      model: "opus",
      skillOverrides: { alpha: "off", beta: "off", gamma: "off", delta: "on" },
      hooks: { Stop: [{ hooks: [{ type: "command", command: "true" }] }] },
    });

    const cleared = clearOffOverrides(["alpha", "beta", "unknown"], "user");

    expect(cleared.sort()).toEqual(["alpha", "beta"]);
    const after = readSettings();
    // Named + off → gone. NOT named (gamma) and not-off (delta) → untouched.
    expect(after.skillOverrides).toEqual({ gamma: "off", delta: "on" });
    // Every other key in the file survives byte-equal.
    expect(after.model).toBe("opus");
    expect(after.hooks).toEqual({ Stop: [{ hooks: [{ type: "command", command: "true" }] }] });
  });

  it("no-ops when nothing matches: missing file, no key, no 'off' values", () => {
    expect(clearOffOverrides(["alpha"], "user")).toEqual([]);

    writeSettings({ model: "opus" });
    expect(clearOffOverrides(["alpha"], "user")).toEqual([]);
    expect(readSettings()).toEqual({ model: "opus" });

    writeSettings({ skillOverrides: { alpha: "on" } });
    expect(clearOffOverrides(["alpha"], "user")).toEqual([]);
    expect(readSettings()).toEqual({ skillOverrides: { alpha: "on" } });
  });

  it("never writes an unparseable settings file", () => {
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
    fs.writeFileSync(SETTINGS, "{broken", "utf8");
    expect(clearOffOverrides(["alpha"], "user")).toEqual([]);
    expect(fs.readFileSync(SETTINGS, "utf8")).toBe("{broken");
  });

  it("backs the file up before clearing, preserving its file mode", () => {
    writeSettings({ skillOverrides: { alpha: "off" } });
    fs.chmodSync(SETTINGS, 0o600);
    clearOffOverrides(["alpha"], "user");
    const dir = path.join(STRONGSUIT_DIR, "backups");
    const backup = fs.readdirSync(dir).find((f) => f.startsWith("settings.json"));
    expect(backup).toBeDefined();
    if (process.platform !== "win32") {
      // A 600 settings file must not become world-readable in the backup.
      expect(fs.statSync(path.join(dir, backup!)).mode & 0o777).toBe(0o600);
    }
  });

  it("offOverrides reports without writing", () => {
    writeSettings({ skillOverrides: { alpha: "off", beta: "on" } });
    expect(offOverrides(["alpha", "beta", "gamma"], "user")).toEqual(["alpha"]);
    expect(readSettings().skillOverrides).toEqual({ alpha: "off", beta: "on" });
  });

  it("suit list flags a linked-but-overridden skill instead of showing it on", () => {
    const lib = path.join(LIBRARY_DIR, "alpha");
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(path.join(lib, "SKILL.md"), "---\nname: alpha\n---\nbody", "utf8");
    const activeDir = path.join(CLAUDE_HOME, "skills");
    fs.mkdirSync(activeDir, { recursive: true });
    fs.symlinkSync(lib, path.join(activeDir, "alpha"), "dir");
    writeSettings({ skillOverrides: { alpha: "off" } });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runList("user");
    const out = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("ovr");
    expect(out).toContain("toggled off in Claude Code /skills");
  });
});
