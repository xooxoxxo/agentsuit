import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateHook, formatHook, type HookEntry } from "../src/hooks.js";
import { makeTempHome, loadModules } from "./helpers.js";

const echoHook: HookEntry = { event: "PreToolUse", matcher: "Bash", command: "echo hi" };

describe("Hook components", () => {
  describe("h1: manifest validation", () => {
    it("accepts a hook with event and command", () => {
      const hook = validateHook({ event: "Stop", command: "notify-send done" });
      expect(hook).toEqual({ event: "Stop", command: "notify-send done" });
    });

    it("keeps optional matcher and timeout", () => {
      const hook = validateHook({
        event: "PreToolUse",
        matcher: "Bash",
        command: "guard.sh",
        timeout: 30,
      });
      expect(hook.matcher).toBe("Bash");
      expect(hook.timeout).toBe(30);
    });

    it("rejects an unknown event so a typo cannot become a silent no-op", () => {
      expect(() => validateHook({ event: "PreToolUsee", command: "x" })).toThrow(
        /unknown event 'PreToolUsee'/
      );
    });

    it("rejects a missing command", () => {
      expect(() => validateHook({ event: "Stop" })).toThrow(/'command' must be a non-empty string/);
    });

    it("rejects an empty command", () => {
      expect(() => validateHook({ event: "Stop", command: "   " })).toThrow(
        /'command' must be a non-empty string/
      );
    });

    it("rejects a non-object hook", () => {
      expect(() => validateHook("echo hi")).toThrow(/must be an object/);
      expect(() => validateHook(["echo hi"])).toThrow(/must be an object/);
    });

    it("rejects a non-string matcher", () => {
      expect(() => validateHook({ event: "Stop", command: "x", matcher: 7 })).toThrow(
        /'matcher' must be a string/
      );
    });

    it("rejects a non-positive timeout", () => {
      expect(() => validateHook({ event: "Stop", command: "x", timeout: 0 })).toThrow(
        /'timeout' must be a positive number/
      );
    });
  });

  describe("h2: display", () => {
    it("formats a hook with its event, matcher and command", () => {
      expect(formatHook(echoHook)).toContain("PreToolUse [Bash]");
      expect(formatHook(echoHook)).toContain("echo hi");
    });

    it("never truncates a long command", () => {
      const long = "/opt/tooling/" + "deep-path/".repeat(40) + "run.sh --verbose";
      expect(formatHook({ event: "Stop", command: long })).toContain(long);
    });
  });

  describe("h3: settings writes", () => {
    let tempHome: string;

    beforeEach(() => {
      vi.resetModules();
      tempHome = makeTempHome();
    });

    afterEach(() => {
      vi.resetModules();
      fs.rmSync(tempHome, { recursive: true, force: true });
    });

    async function setup() {
      const { hooks, managedJson, paths } = await loadModules(tempHome);
      const managed = new managedJson.ManagedJson(paths.ledgerPath("user"), paths.backupsDir("user"));
      return { hooks, managed, file: hooks.settingsPath("user") };
    }

    function readSettings(file: string): Record<string, unknown> {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }

    it("writes approved hooks into the settings hooks key", async () => {
      const { hooks, managed, file } = await setup();
      hooks.activateHooks([echoHook], "user", "coding", managed);

      const settings = readSettings(file) as { hooks: Record<string, unknown[]> };
      expect(settings.hooks.PreToolUse).toEqual([
        { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
      ]);
    });

    it("groups several hooks of the same event into one array", async () => {
      const { hooks, managed, file } = await setup();
      hooks.activateHooks(
        [
          { event: "Stop", command: "one" },
          { event: "Stop", command: "two" },
        ],
        "user",
        "coding",
        managed
      );

      const settings = readSettings(file) as { hooks: Record<string, unknown[]> };
      expect(settings.hooks.Stop).toHaveLength(2);
    });

    it("replaces its own event on re-activation instead of accumulating", async () => {
      const { hooks, managed, file } = await setup();
      hooks.activateHooks([{ event: "Stop", command: "from-suit-a" }], "user", "a", managed);
      hooks.activateHooks([{ event: "Stop", command: "from-suit-b" }], "user", "b", managed);

      const settings = readSettings(file) as { hooks: Record<string, unknown[]> };
      expect(settings.hooks.Stop).toHaveLength(1);
      expect(JSON.stringify(settings.hooks.Stop)).toContain("from-suit-b");
      expect(JSON.stringify(settings.hooks.Stop)).not.toContain("from-suit-a");
    });

    it("refuses to write into an event holding foreign hooks, leaving them untouched", async () => {
      const { hooks, managed, file } = await setup();
      const foreign = { hooks: [{ type: "command", command: "user-owned.sh" }] };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: [foreign] } }, null, 2));

      expect(() =>
        hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "coding", managed)
      ).toThrow(/already holds hooks strongsuit did not create/);

      const settings = readSettings(file) as { hooks: Record<string, unknown[]> };
      expect(settings.hooks.Stop).toEqual([foreign]);
    });

    it("leaves foreign hooks in other events alone", async () => {
      const { hooks, managed, file } = await setup();
      const foreign = { hooks: [{ type: "command", command: "user-owned.sh" }] };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ hooks: { SessionEnd: [foreign] } }, null, 2));

      hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "coding", managed);

      const settings = readSettings(file) as { hooks: Record<string, unknown[]> };
      expect(settings.hooks.SessionEnd).toEqual([foreign]);
      expect(settings.hooks.Stop).toHaveLength(1);
    });

    it("preserves unrelated settings keys", async () => {
      const { hooks, managed, file } = await setup();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ model: "opus", permissions: { allow: ["Bash"] } }));

      hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "coding", managed);

      const settings = readSettings(file);
      expect(settings.model).toBe("opus");
      expect(settings.permissions).toEqual({ allow: ["Bash"] });
    });

    it("reports the previous value so activation can be rolled back", async () => {
      const { hooks, managed } = await setup();
      const writes = hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "a", managed);
      expect(writes).toEqual([{ jsonPath: ["hooks", "Stop"], previousValue: undefined }]);

      const second = hooks.activateHooks([{ event: "Stop", command: "next" }], "user", "b", managed);
      expect(second[0].previousValue).toEqual([
        { hooks: [{ type: "command", command: "ours" }] },
      ]);
    });
  });

  describe("h4: deactivation", () => {
    let tempHome: string;

    beforeEach(() => {
      vi.resetModules();
      tempHome = makeTempHome();
    });

    afterEach(() => {
      vi.resetModules();
      fs.rmSync(tempHome, { recursive: true, force: true });
    });

    async function setup() {
      const { hooks, managedJson, paths } = await loadModules(tempHome);
      const managed = new managedJson.ManagedJson(paths.ledgerPath("user"), paths.backupsDir("user"));
      return { hooks, managed, file: hooks.settingsPath("user") };
    }

    it("removes the events it owns", async () => {
      const { hooks, managed, file } = await setup();
      hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "coding", managed);
      hooks.deactivateHooks("user", managed);

      const settings = JSON.parse(fs.readFileSync(file, "utf-8"));
      expect(settings.hooks?.Stop).toBeUndefined();
    });

    it("never removes an event it does not own", async () => {
      const { hooks, managed, file } = await setup();
      hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "coding", managed);

      const settings = JSON.parse(fs.readFileSync(file, "utf-8"));
      settings.hooks.SessionEnd = [{ hooks: [{ type: "command", command: "user-owned.sh" }] }];
      fs.writeFileSync(file, JSON.stringify(settings, null, 2));

      hooks.deactivateHooks("user", managed);

      const after = JSON.parse(fs.readFileSync(file, "utf-8"));
      expect(after.hooks.SessionEnd).toEqual([
        { hooks: [{ type: "command", command: "user-owned.sh" }] },
      ]);
      expect(after.hooks.Stop).toBeUndefined();
    });

    it("does nothing when the settings file does not exist", async () => {
      const { hooks, managed, file } = await setup();
      expect(fs.existsSync(file)).toBe(false);
      expect(hooks.deactivateHooks("user", managed)).toEqual([]);
    });

    it("reports the removed value so deactivation can be rolled back", async () => {
      const { hooks, managed } = await setup();
      hooks.activateHooks([{ event: "Stop", command: "ours" }], "user", "coding", managed);
      const writes = hooks.deactivateHooks("user", managed);
      expect(writes).toEqual([
        {
          jsonPath: ["hooks", "Stop"],
          previousValue: [{ hooks: [{ type: "command", command: "ours" }] }],
        },
      ]);
    });
  });

  describe("h5: disableAllHooks", () => {
    let tempHome: string;

    beforeEach(() => {
      vi.resetModules();
      tempHome = makeTempHome();
    });

    afterEach(() => {
      vi.resetModules();
      fs.rmSync(tempHome, { recursive: true, force: true });
    });

    it("surfaces a notice when hooks are installed into settings that disable them", async () => {
      const { hooks } = await loadModules(tempHome);
      const file = hooks.settingsPath("user");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ disableAllHooks: true }));

      expect(hooks.hooksDisabled("user")).toBe(true);
      expect(hooks.disabledNotice("user")).toContain("disableAllHooks");
    });

    it("stays quiet when hooks are enabled", async () => {
      const { hooks } = await loadModules(tempHome);
      expect(hooks.hooksDisabled("user")).toBe(false);
      expect(hooks.disabledNotice("user")).toBeNull();
    });
  });
});
