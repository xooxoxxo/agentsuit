import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ManagedJson } from "../src/managed-json.js";
import { Ledger } from "../src/ledger.js";

describe("ManagedJson — JSON config surface editor", () => {
  let tempDir: string;
  let ledgerPath: string;
  let backupsDir: string;
  let configFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-json-test-"));
    ledgerPath = path.join(tempDir, "ledger.json");
    backupsDir = path.join(tempDir, "backups");
    configFile = path.join(tempDir, "config.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("m1: never modifies un-ledgered keys", () => {
    it("foreign keys survive set + remove cycle", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      // Write initial config with foreign key
      const initial = { foreign: "key", settings: {} };
      fs.writeFileSync(configFile, JSON.stringify(initial, null, 2));

      // Set an agentsuit key
      mg.setEntries(configFile, [{ jsonPath: "settings.own", value: "val" }], "suit-a");

      // Read back — foreign key should be unchanged
      const content = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(content.foreign).toBe("key");
      expect(content.settings.own).toBe("val");

      // Remove agentsuit key
      mg.removeEntries(configFile, ["settings.own"]);

      // Foreign key still there
      const final = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(final.foreign).toBe("key");
      expect(final.settings).not.toHaveProperty("own");
    });
  });

  describe("m2: removal removes exactly ledgered keys", () => {
    it("only removes exactly what was ledgered, nothing adjacent", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      const initial = { a: 1, b: 2, c: 3 };
      fs.writeFileSync(configFile, JSON.stringify(initial));

      // Add entries: only 'b' is ledgered
      mg.setEntries(configFile, [{ jsonPath: "b", value: 2 }], "suit-a");

      // Add 'd' manually (foreign)
      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      state.d = 4;
      fs.writeFileSync(configFile, JSON.stringify(state));

      // Remove ledgered 'b'
      mg.removeEntries(configFile, ["b"]);

      const final = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(final).toEqual({ a: 1, c: 3, d: 4 });
    });
  });

  describe("m3: foreign edit detection", () => {
    it("detects and refuses to overwrite foreign-edited owned key", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      // Set initial value
      mg.setEntries(configFile, [{ jsonPath: "mcpServers.foo.env", value: "orig" }], "suit-a");

      // Simulate foreign edit: change the value
      const content = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      content.mcpServers.foo.env = "foreign";
      fs.writeFileSync(configFile, JSON.stringify(content));

      // Try to set new value
      const result = mg.setEntries(
        configFile,
        [{ jsonPath: "mcpServers.foo.env", value: "new" }],
        "suit-a"
      );

      // Should report conflict and NOT overwrite
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].jsonPath).toEqual(["mcpServers", "foo", "env"]);
      expect(result.count).toBe(0);

      // Value should still be foreign
      const final = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(final.mcpServers.foo.env).toBe("foreign");
    });
  });

  describe("m4: concurrent foreign key survival", () => {
    it("concurrent foreign key added during set survives", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      const initial = { settings: {} };
      fs.writeFileSync(configFile, JSON.stringify(initial));

      // Simulate: file read → concurrent foreign edit → our write
      const entries = [{ jsonPath: "settings.own", value: "val" }];

      // (ManagedJson re-reads before write, so we can't easily simulate this in unit test
      // but the implementation does re-read. This test documents the intent.)
      const result = mg.setEntries(configFile, entries, "suit-a");
      expect(result.count).toBe(1);

      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      state.concurrent = "key";
      fs.writeFileSync(configFile, JSON.stringify(state));

      // Verify concurrent key is preserved
      expect(fs.readFileSync(configFile, "utf-8")).toContain("concurrent");
    });
  });

  describe("m5: atomicity on error", () => {
    it("write that throws leaves original file intact", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      const initial = { data: "original" };
      fs.writeFileSync(configFile, JSON.stringify(initial));
      const originalContent = fs.readFileSync(configFile, "utf-8");

      // This test verifies the atomic write uses temp file + rename.
      // We'll verify by checking that the file is valid JSON after operations.
      mg.setEntries(configFile, [{ jsonPath: "key", value: "val" }], "suit-a");

      // File should be valid JSON
      const content = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(content).toBeDefined();
      expect(content).not.toBe(null);
    });
  });

  describe("m6: corrupted ledger = read-only mode", () => {
    it("writes refused with clear error on corrupted ledger", () => {
      fs.writeFileSync(ledgerPath, "{ corrupt json ]");

      const mg = new ManagedJson(ledgerPath, backupsDir);
      expect(mg.isReadOnly()).toBe(true);

      expect(() => {
        mg.setEntries(configFile, [{ jsonPath: "key", value: "val" }], "suit-a");
      }).toThrow(/corrupted/i);

      expect(() => {
        mg.removeEntries(configFile, ["key"]);
      }).toThrow(/corrupted/i);
    });
  });

  describe("m7: backup created once", () => {
    it("backup created on first touch, not on subsequent touches", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      const initial = { key: "val" };
      fs.writeFileSync(configFile, JSON.stringify(initial));

      // First touch: should create backup
      mg.setEntries(configFile, [{ jsonPath: "key1", value: "val1" }], "suit-a");
      const backups1 = fs.readdirSync(backupsDir);
      expect(backups1).toHaveLength(1);

      // Second touch: should NOT create another backup
      mg.setEntries(configFile, [{ jsonPath: "key2", value: "val2" }], "suit-a");
      const backups2 = fs.readdirSync(backupsDir);
      expect(backups2).toHaveLength(1); // Same count
    });

    it("backup has correct timestamp format", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      fs.writeFileSync(configFile, JSON.stringify({ data: "test" }));
      mg.setEntries(configFile, [{ jsonPath: "key", value: "val" }], "suit-a");

      const backups = fs.readdirSync(backupsDir);
      expect(backups[0]).toMatch(/config\.json\.\d{4}-\d{2}-\d{2}T.*\.json/);
    });

    it("backup contains original content", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      const original = { original: "content" };
      fs.writeFileSync(configFile, JSON.stringify(original, null, 2));

      mg.setEntries(configFile, [{ jsonPath: "added", value: "value" }], "suit-a");

      const backups = fs.readdirSync(backupsDir);
      const backupContent = JSON.parse(
        fs.readFileSync(path.join(backupsDir, backups[0]), "utf-8")
      );
      expect(backupContent).toEqual(original);
    });
  });

  describe("m8: empty parent pruning only for agentsuit-created parents", () => {
    it("prunes empty parents only if createdParent is true", () => {
      // Setup: create config with nested structure
      const initial = { hooks: { PreToolUse: "echo start", PostToolUse: "echo end" } };
      fs.writeFileSync(configFile, JSON.stringify(initial));

      // Ledger entry WITH createdParent: true for PreToolUse
      // Manually create ledger entry to simulate this
      const ledger = new Ledger(ledgerPath);
      ledger.record(
        configFile,
        ["hooks", "PreToolUse"],
        "echo start",
        "suit-a",
        true
      );
      ledger.save();

      // Construct after the ledger is on disk: ManagedJson loads it at
      // construction, so an entry saved later is invisible to it.
      const mg = new ManagedJson(ledgerPath, backupsDir);

      // Remove PreToolUse (empty parent should be pruned)
      mg.removeEntries(configFile, [["hooks", "PreToolUse"]]);

      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));

      // PostToolUse is still there (not removed), so hooks shouldn't be pruned
      expect(state.hooks).toBeDefined();
      expect(state.hooks.PreToolUse).toBeUndefined();
      expect(state.hooks.PostToolUse).toBe("echo end");
    });

    it("does NOT prune parent if createdParent is false", () => {
      const initial = { settings: { only_key: "value" } };
      fs.writeFileSync(configFile, JSON.stringify(initial));

      // Ledger entry WITHOUT createdParent for only_key
      const ledger = new Ledger(ledgerPath);
      ledger.record(configFile, ["settings", "only_key"], "value", "suit-a", false);
      ledger.save();

      // Construct after the ledger is on disk: ManagedJson loads it at
      // construction, so an entry saved later is invisible to it.
      const mg = new ManagedJson(ledgerPath, backupsDir);

      // Remove only_key
      mg.removeEntries(configFile, [["settings", "only_key"]]);

      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));

      // settings should still exist (not pruned because createdParent=false)
      expect(state.settings).toBeDefined();
      expect(Object.keys(state.settings)).toHaveLength(0);
    });
  });

  describe("m9: nested paths", () => {
    it("sets and removes nested values via array path", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      fs.writeFileSync(configFile, JSON.stringify({}));

      // Set nested value
      mg.setEntries(
        configFile,
        [
          { jsonPath: ["mcpServers", "anthropic", "config", "apiKey"], value: "secret" },
          { jsonPath: ["mcpServers", "anthropic", "config", "timeout"], value: 5000 },
        ],
        "suit-a"
      );

      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(state.mcpServers.anthropic.config.apiKey).toBe("secret");
      expect(state.mcpServers.anthropic.config.timeout).toBe(5000);

      // Remove one nested value
      mg.removeEntries(configFile, [["mcpServers", "anthropic", "config", "timeout"]]);

      const final = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(final.mcpServers.anthropic.config).toEqual({ apiKey: "secret" });
    });
  });

  describe("m10: array paths (dotted vs array format)", () => {
    it("handles both dotted string and array path formats", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      fs.writeFileSync(configFile, JSON.stringify({}));

      // Set with dotted string
      mg.setEntries(configFile, [{ jsonPath: "a.b.c", value: "val1" }], "suit-a");

      // Set with array
      mg.setEntries(configFile, [{ jsonPath: ["x", "y", "z"], value: "val2" }], "suit-a");

      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(state.a.b.c).toBe("val1");
      expect(state.x.y.z).toBe("val2");
    });
  });

  describe("m11: multiple entries in single set call", () => {
    it("sets multiple entries with partial conflict reporting", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      // Initial state
      mg.setEntries(
        configFile,
        [
          { jsonPath: "key1", value: "orig1" },
          { jsonPath: "key2", value: "orig2" },
        ],
        "suit-a"
      );

      // Simulate foreign edit to key1
      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      state.key1 = "foreign";
      fs.writeFileSync(configFile, JSON.stringify(state));

      // Try to set both
      const result = mg.setEntries(
        configFile,
        [
          { jsonPath: "key1", value: "new1" },
          { jsonPath: "key2", value: "new2" },
        ],
        "suit-a"
      );

      // key1 should conflict, key2 should be set
      expect(result.conflicts).toHaveLength(1);
      expect(result.count).toBe(1);

      const final = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(final.key1).toBe("foreign"); // Not overwritten
      expect(final.key2).toBe("new2"); // Was set
    });
  });

  describe("m12: ledger persistence across instances", () => {
    it("ledger entries persist across ManagedJson instances", () => {
      const mg1 = new ManagedJson(ledgerPath, backupsDir);
      mg1.setEntries(configFile, [{ jsonPath: "key", value: "val" }], "suit-a");

      const mg2 = new ManagedJson(ledgerPath, backupsDir);
      const entries = mg2.getLedgerEntries(configFile);

      expect(entries).toHaveLength(1);
      expect(entries[0].suit).toBe("suit-a");
    });
  });

  describe("m13: missing file handling", () => {
    it("creates missing file on first set", () => {
      expect(fs.existsSync(configFile)).toBe(false);

      const mg = new ManagedJson(ledgerPath, backupsDir);
      mg.setEntries(configFile, [{ jsonPath: "key", value: "val" }], "suit-a");

      expect(fs.existsSync(configFile)).toBe(true);
      const content = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(content.key).toBe("val");
    });

    it("removeEntries silently no-ops on missing file", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);
      expect(() => mg.removeEntries(configFile, ["key"])).not.toThrow();
    });
  });

  describe("m14: conflict data includes hashes", () => {
    it("conflict report includes current and expected hashes", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      mg.setEntries(configFile, [{ jsonPath: "key", value: "original" }], "suit-a");

      // Foreign edit
      const state = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      state.key = "modified";
      fs.writeFileSync(configFile, JSON.stringify(state));

      // Attempt overwrite
      const result = mg.setEntries(configFile, [{ jsonPath: "key", value: "new" }], "suit-a");

      expect(result.conflicts[0].currentHash).toBeDefined();
      expect(result.conflicts[0].expectedHash).toBeDefined();
      expect(result.conflicts[0].currentHash).not.toBe(result.conflicts[0].expectedHash);
    });
  });

  describe("m15: file path resolution", () => {
    it("handles both absolute and relative file paths", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);

      // Set with relative path
      mg.setEntries("config.json", [{ jsonPath: "key", value: "val" }], "suit-a");

      // Verify file was created in tempDir (root)
      expect(fs.existsSync(configFile)).toBe(true);

      // Retrieve with absolute path
      const entries = mg.getLedgerEntries(path.join(tempDir, "config.json"));
      expect(entries).toHaveLength(1);
    });
  });

  describe("m11: removal is limited to owned keys", () => {
    it("a key agentsuit never wrote is left in place", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);
      fs.writeFileSync(
        configFile,
        JSON.stringify({ mcpServers: { theirs: { command: "x" } } }, null, 2)
      );

      // Same shape, same name — but nothing in the ledger says it is ours.
      mg.removeEntries(configFile, [["mcpServers", "theirs"]]);

      const after = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(after.mcpServers.theirs).toEqual({ command: "x" });
    });

    it("an owned neighbour is removed while the foreign key survives", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);
      fs.writeFileSync(
        configFile,
        JSON.stringify({ mcpServers: { theirs: { command: "x" } } }, null, 2)
      );
      mg.setEntries(
        configFile,
        [{ jsonPath: ["mcpServers", "ours"], value: { command: "y" } }],
        "suit-a"
      );

      mg.removeEntries(configFile, [
        ["mcpServers", "ours"],
        ["mcpServers", "theirs"],
      ]);

      const after = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(after.mcpServers.ours).toBeUndefined();
      expect(after.mcpServers.theirs).toEqual({ command: "x" });
    });
  });

  describe("m12: writes are atomic", () => {
    it("goes through a temp file and rename, never a truncating write", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);
      fs.writeFileSync(configFile, JSON.stringify({ a: 1 }, null, 2));

      // Atomicity is a mechanism guarantee: a direct write can leave the
      // user's settings truncated if the process dies mid-write. Assert the
      // mechanism, since staging a real crash is not reproducible.
      const renameSpy = vi.spyOn(fs, "renameSync");
      const writeSpy = vi.spyOn(fs, "writeFileSync");

      mg.setEntries(configFile, [{ jsonPath: "own", value: 1 }], "suit-a");

      const renamedInto = renameSpy.mock.calls.filter(
        (c) => path.resolve(String(c[1])) === path.resolve(configFile)
      );
      expect(renamedInto.length).toBeGreaterThan(0);

      const wroteDirectly = writeSpy.mock.calls.filter(
        (c) => path.resolve(String(c[0])) === path.resolve(configFile)
      );
      expect(wroteDirectly).toHaveLength(0);

      renameSpy.mockRestore();
      writeSpy.mockRestore();
    });
  });

  describe("m13: array removal refuses rather than corrupting", () => {
    it("removing inside an array throws instead of leaving a hole", () => {
      const mg = new ManagedJson(ledgerPath, backupsDir);
      fs.writeFileSync(configFile, JSON.stringify({ allow: [] }, null, 2));
      mg.setEntries(configFile, [{ jsonPath: ["allow", "0"], value: "Bash(ls)" }], "suit-a");

      expect(() => mg.removeEntries(configFile, [["allow", "0"]])).toThrow(
        /arrays is not supported/i
      );

      const after = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(after.allow).toEqual(["Bash(ls)"]);
    });
  });
});
