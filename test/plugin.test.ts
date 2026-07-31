import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parsePluginRef,
  type PluginRef,
  enabledPluginsPath,
} from "../src/plugin.js";
import { makeTempHome, loadModules } from "./helpers.js";

describe("Plugin Reference Parsing", () => {
  describe("p1: valid plugin references", () => {
    it("accepts plugin@marketplace format", () => {
      const ref = parsePluginRef("vscode-integration@marketplace");
      expect(ref.plugin).toBe("vscode-integration");
      expect(ref.marketplace).toBe("marketplace");
      expect(ref.fullRef).toBe("vscode-integration@marketplace");
    });

    it("accepts simple plugin names with marketplace", () => {
      const ref = parsePluginRef("prettier@marketplace");
      expect(ref.plugin).toBe("prettier");
      expect(ref.marketplace).toBe("marketplace");
    });

    it("trims whitespace from input", () => {
      const ref = parsePluginRef("  vscode@marketplace  ");
      expect(ref.plugin).toBe("vscode");
      expect(ref.marketplace).toBe("marketplace");
    });

    it("accepts hyphenated plugin names", () => {
      const ref = parsePluginRef("my-cool-plugin@custom-marketplace");
      expect(ref.plugin).toBe("my-cool-plugin");
      expect(ref.marketplace).toBe("custom-marketplace");
    });
  });

  describe("p2: invalid plugin references", () => {
    it("rejects non-string input", () => {
      expect(() => parsePluginRef(123)).toThrow(/must be a string/);
      expect(() => parsePluginRef({ plugin: "test" })).toThrow(/must be a string/);
      expect(() => parsePluginRef(null)).toThrow(/must be a string/);
      expect(() => parsePluginRef(undefined)).toThrow(/must be a string/);
    });

    it("rejects empty string", () => {
      expect(() => parsePluginRef("")).toThrow(/non-empty/);
      expect(() => parsePluginRef("   ")).toThrow(/non-empty/);
    });

    it("rejects missing marketplace (no @)", () => {
      expect(() => parsePluginRef("plugin-only")).toThrow(
        /must be in the form 'plugin@marketplace'/
      );
    });

    it("rejects missing plugin name", () => {
      expect(() => parsePluginRef("@marketplace")).toThrow(
        /must be in the form 'plugin@marketplace'/
      );
    });

    it("rejects missing marketplace after @", () => {
      expect(() => parsePluginRef("plugin@")).toThrow(
        /must be in the form 'plugin@marketplace'/
      );
    });

    it("rejects multiple @ symbols", () => {
      expect(() => parsePluginRef("plugin@market@place")).toThrow(
        /must be in the form 'plugin@marketplace'/
      );
    });
  });
});

describe("Plugin Configuration Paths", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("p3: config path resolution", () => {
    it("returns CLAUDE_HOME/settings.json for user scope", async () => {
      vi.resetModules();
      const { paths } = await loadModules(tempHome);
      const { pluginConfigPath: pluginConfigPathLoaded } = await import("../src/plugin.js");
      const cfgPath = pluginConfigPathLoaded("user");
      // When STRONGSUIT_HOME=tempHome, CLAUDE_HOME=tempHome, so expect tempHome/settings.json
      const expected = path.join(tempHome, "settings.json");
      expect(cfgPath).toBe(expected);
    });

    it("returns .claude/settings.json for project scope", async () => {
      vi.resetModules();
      await loadModules(tempHome);
      const { pluginConfigPath: loaded } = await import("../src/plugin.js");
      // realpath both sides: on macOS cwd may be reported as /var/... while the
      // path resolves through /private/var.
      expect(fs.realpathSync(path.dirname(path.dirname(loaded("project"))))).toBe(
        fs.realpathSync(process.cwd())
      );
      expect(loaded("project").endsWith(path.join(".claude", "settings.json"))).toBe(true);
    });

    it("returns correct JSON path for enabledPlugins", () => {
      const path = enabledPluginsPath();
      expect(path).toEqual(["enabledPlugins"]);
    });
  });
});

/** Stub runner where `claude plugin list` reports everything as installed. */
function alreadyInstalled() {
  return (_bin: string, args: string[]) => ({
    status: 0,
    stdout: args[1] === "list" ? "ours@official good@official superpowers@official" : "",
  });
}

describe("Plugin Activation and Deactivation", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  /**
   * Loads the modules and returns the pieces every activation test needs.
   * The command runner is stubbed by default so nothing shells out to a real
   * `claude` binary; pass a runner to drive the orchestration paths.
   */
  async function setup(runner?: (bin: string, args: string[]) => { status: number; stdout: string }) {
    const { paths, suits } = await loadModules(tempHome);
    const up = await import("../src/commands/up.js");
    const plugin = await import("../src/plugin.js");
    plugin.setPluginCommandRunner(runner ?? alreadyInstalled());
    return { paths, suits, up, plugin, configPath: plugin.pluginConfigPath("user") };
  }

  function readEnabled(configPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")).enabledPlugins ?? {};
  }

  /** runUp reports failure through process.exitCode; keep the suite's own clean. */
  async function runQuietly(fn: () => Promise<void>): Promise<void> {
    const prior = process.exitCode;
    await fn();
    process.exitCode = prior;
  }

  describe("p4: plugin entry ledger storage", () => {
    it("stores plugin references in enabledPlugins with ledger tracking", async () => {
      const { suits, up, configPath, paths } = await setup();
      suits.saveSuit({ name: "coding", components: { plugins: ["superpowers@official"] } });

      await runQuietly(() => up.runUp("coding", "user"));

      expect(readEnabled(configPath)["superpowers@official"]).toBe(true);

      const ledger = JSON.parse(fs.readFileSync(paths.ledgerPath("user"), "utf-8"));
      const keys = ledger.map((e: { jsonPath: string[] }) => e.jsonPath.join("."));
      expect(keys).toContain("enabledPlugins.superpowers@official");
    });

    it("preserves foreign entries in enabledPlugins when toggling suits", async () => {
      const { suits, up, configPath } = await setup();

      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        JSON.stringify({ enabledPlugins: { "hand-installed@elsewhere": true } }, null, 2)
      );

      suits.saveSuit({ name: "coding", components: { plugins: ["ours@official"] } });
      await runQuietly(() => up.runUp("coding", "user"));

      expect(readEnabled(configPath)["hand-installed@elsewhere"]).toBe(true);
      expect(readEnabled(configPath)["ours@official"]).toBe(true);

      await runQuietly(() => up.runOff("user"));

      // Deactivation removes only what the ledger owns.
      expect(readEnabled(configPath)["hand-installed@elsewhere"]).toBe(true);
      expect(readEnabled(configPath)["ours@official"]).toBeUndefined();
    });

    it("round-trips cleanly: activate, deactivate, activate", async () => {
      const { suits, up, configPath } = await setup();
      suits.saveSuit({ name: "coding", components: { plugins: ["ours@official"] } });

      await runQuietly(() => up.runUp("coding", "user"));
      const afterFirst = readEnabled(configPath);

      await runQuietly(() => up.runOff("user"));
      expect(readEnabled(configPath)["ours@official"]).toBeUndefined();

      await runQuietly(() => up.runUp("coding", "user"));
      expect(readEnabled(configPath)).toEqual(afterFirst);
    });

    it("leaves an unrelated settings key untouched", async () => {
      const { suits, up, configPath } = await setup();
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify({ model: "opus" }));

      suits.saveSuit({ name: "coding", components: { plugins: ["ours@official"] } });
      await runQuietly(() => up.runUp("coding", "user"));

      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).model).toBe("opus");
    });
  });

  describe("p6: install orchestration", () => {
    /**
     * Builds a stub `claude`. `installed` is what `plugin list` reports,
     * `marketplaces` what `plugin marketplace list` reports, and `fail` names
     * the subcommand that should exit non-zero.
     */
    function stubClaude(opts: {
      installed?: string[];
      marketplaces?: string[];
      fail?: "marketplace-add" | "install";
      log?: string[][];
    }) {
      return (bin: string, args: string[]) => {
        opts.log?.push(args);
        const sub = args.slice(1).join(" ");
        if (sub === "list") return { status: 0, stdout: (opts.installed ?? []).join("\n") };
        if (sub === "marketplace list")
          return { status: 0, stdout: (opts.marketplaces ?? []).join("\n") };
        if (sub.startsWith("marketplace add"))
          return opts.fail === "marketplace-add"
            ? { status: 1, stdout: "could not reach github" }
            : { status: 0, stdout: "added" };
        if (sub.startsWith("install"))
          return opts.fail === "install"
            ? { status: 1, stdout: "plugin not found in marketplace" }
            : { status: 0, stdout: "installed" };
        return { status: 1, stdout: `unexpected: ${bin} ${args.join(" ")}` };
      };
    }

    it("skips installing a plugin that is already there", async () => {
      const log: string[][] = [];
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ installed: ["x@mkt"], log }));

      const outcome = plugin.ensurePluginInstalled(plugin.parsePluginEntry("x@mkt"));
      expect(outcome.state).toBe("already-installed");
      expect(log.map((a) => a.join(" "))).toEqual(["plugin list"]);
    });

    it("installs when the marketplace is already configured", async () => {
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ marketplaces: ["mkt"] }));

      const outcome = plugin.ensurePluginInstalled(plugin.parsePluginEntry("x@mkt"));
      expect(outcome.state).toBe("installed");
      expect(outcome.undo).toBeUndefined();
    });

    it("adds the marketplace first when the suit says where it lives", async () => {
      const log: string[][] = [];
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ log }));

      const outcome = plugin.ensurePluginInstalled(
        plugin.parsePluginEntry({ ref: "x@mkt", marketplace: "owner/repo" })
      );
      expect(outcome.state).toBe("marketplace-added-and-installed");
      expect(log.map((a) => a.join(" "))).toContain("plugin marketplace add owner/repo");
    });

    it("stops when the marketplace is unknown and the suit does not say where it lives", async () => {
      const log: string[][] = [];
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ log }));

      const outcome = plugin.ensurePluginInstalled(plugin.parsePluginEntry("x@mkt"));
      expect(outcome.state).toBe("marketplace-unknown");
      expect(outcome.undo).toBeUndefined();
      // Nothing was attempted beyond looking.
      expect(log.map((a) => a.join(" "))).toEqual(["plugin list", "plugin marketplace list"]);
    });

    it("reports a failed marketplace add and changes nothing", async () => {
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ fail: "marketplace-add" }));

      const outcome = plugin.ensurePluginInstalled(
        plugin.parsePluginEntry({ ref: "x@mkt", marketplace: "owner/repo" })
      );
      expect(outcome.state).toBe("marketplace-add-failed");
      expect(outcome.message).toContain("could not reach github");
      expect(outcome.undo).toBeUndefined();
    });

    it("reports a failed install with no marketplace change as leaving nothing behind", async () => {
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ marketplaces: ["mkt"], fail: "install" }));

      const outcome = plugin.ensurePluginInstalled(plugin.parsePluginEntry("x@mkt"));
      expect(outcome.state).toBe("install-failed");
      expect(outcome.undo).toBeUndefined();
    });

    it("names the undo command when the install fails after adding a marketplace", async () => {
      const { plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ fail: "install" }));

      const outcome = plugin.ensurePluginInstalled(
        plugin.parsePluginEntry({ ref: "x@mkt", marketplace: "owner/repo" })
      );
      expect(outcome.state).toBe("install-failed-after-marketplace-add");
      expect(outcome.message).toContain("is still configured");
      expect(outcome.undo).toBe("claude plugin marketplace remove mkt");
    });

    it("writes nothing to settings when a plugin cannot be installed", async () => {
      const { suits, up, configPath, plugin } = await setup();
      plugin.setPluginCommandRunner(stubClaude({ marketplaces: ["official"], fail: "install" }));
      suits.saveSuit({ name: "coding", components: { plugins: ["ours@official"] } });

      await runQuietly(() => up.runUp("coding", "user"));

      const enabled = fs.existsSync(configPath) ? readEnabled(configPath) : {};
      expect(enabled["ours@official"]).toBeUndefined();
    });
  });

  describe("p5: rollback on validation failure", () => {
    it("writes no plugin when any reference in the suit is invalid", async () => {
      const { suits, up, configPath } = await setup();
      suits.saveSuit({
        name: "broken",
        components: { plugins: ["good@official", "no-marketplace"] },
      });

      await runQuietly(() => up.runUp("broken", "user"));

      const enabled = fs.existsSync(configPath) ? readEnabled(configPath) : {};
      expect(enabled["good@official"]).toBeUndefined();
      expect(enabled["no-marketplace"]).toBeUndefined();
    });
  });
});
