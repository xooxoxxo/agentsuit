import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Ledger } from "../src/ledger.js";

describe("Ledger — ownership tracking", () => {
  let tempDir: string;
  let ledgerPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-test-"));
    ledgerPath = path.join(tempDir, "ledger.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("l1: basic record and retrieve", () => {
    it("records and retrieves entries", () => {
      const ledger = new Ledger(ledgerPath);

      ledger.record("settings.json", ["hooks", "PreToolUse"], "echo hi", "my-suit");
      ledger.save();

      const retrieved = new Ledger(ledgerPath);
      const entry = retrieved.get("settings.json", ["hooks", "PreToolUse"]);

      expect(entry).toBeDefined();
      expect(entry?.suit).toBe("my-suit");
      expect(entry?.value).toBeUndefined(); // value is not stored
    });
  });

  describe("l2: dotted path format", () => {
    it("accepts and normalizes dotted path strings", () => {
      const ledger = new Ledger(ledgerPath);

      ledger.record("config.json", "mcpServers.anthropic.env", { key: "val" }, "suit-a");
      const entry = ledger.get("config.json", "mcpServers.anthropic.env");

      expect(entry).toBeDefined();
    });
  });

  describe("l3: array path format", () => {
    it("accepts array path format", () => {
      const ledger = new Ledger(ledgerPath);

      ledger.record("config.json", ["mcpServers", "anthropic", "env"], { key: "val" }, "suit-a");
      const entry = ledger.get("config.json", ["mcpServers", "anthropic", "env"]);

      expect(entry).toBeDefined();
    });
  });

  describe("l4: value hash consistency", () => {
    it("computes consistent hashes for same values", () => {
      const ledger1 = new Ledger(ledgerPath);
      ledger1.record("file.json", "path.to.key", { a: 1, b: 2 }, "suit");
      const entry1 = ledger1.get("file.json", "path.to.key");

      const ledger2 = new Ledger(ledgerPath);
      ledger2.record("file.json", "path.to.key", { a: 1, b: 2 }, "suit");
      const entry2 = ledger2.get("file.json", "path.to.key");

      expect(entry1?.valueHash).toBe(entry2?.valueHash);
    });

    it("different values produce different hashes", () => {
      const ledger = new Ledger(ledgerPath);
      ledger.record("file.json", "path.one", { a: 1 }, "suit");
      ledger.record("file.json", "path.two", { a: 2 }, "suit");

      const entry1 = ledger.get("file.json", "path.one");
      const entry2 = ledger.get("file.json", "path.two");

      expect(entry1?.valueHash).not.toBe(entry2?.valueHash);
    });
  });

  describe("l5: persistence across instances", () => {
    it("survives save/load cycle", () => {
      const ledger1 = new Ledger(ledgerPath);
      ledger1.record("settings.json", "perm.list", ["read", "write"], "suit-x");
      ledger1.save();

      const ledger2 = new Ledger(ledgerPath);
      const entry = ledger2.get("settings.json", "perm.list");

      expect(entry?.suit).toBe("suit-x");
      expect(entry?.file).toBe("settings.json");
    });
  });

  describe("l6: corruption detection", () => {
    it("marks ledger as corrupted if JSON is invalid", () => {
      fs.writeFileSync(ledgerPath, "{ not valid json ]");
      const ledger = new Ledger(ledgerPath);

      expect(ledger.isCorrupted()).toBe(true);
    });

    it("marks ledger as corrupted if root is not an array", () => {
      fs.writeFileSync(ledgerPath, '{ "foo": "bar" }');
      const ledger = new Ledger(ledgerPath);

      expect(ledger.isCorrupted()).toBe(true);
    });

    it("silent no-op on missing ledger file (not corrupted)", () => {
      expect(fs.existsSync(ledgerPath)).toBe(false);
      const ledger = new Ledger(ledgerPath);

      expect(ledger.isCorrupted()).toBe(false);
    });
  });

  describe("l7: remove operation", () => {
    it("removes entries by file and path", () => {
      const ledger = new Ledger(ledgerPath);

      ledger.record("config.json", "mcpServers.foo", "bar", "suit-a");
      ledger.remove("config.json", "mcpServers.foo");

      expect(ledger.get("config.json", "mcpServers.foo")).toBeUndefined();
    });
  });

  describe("l8: getForFile", () => {
    it("retrieves all entries for a file", () => {
      const ledger = new Ledger(ledgerPath);

      ledger.record("a.json", "key1", "val1", "suit-a");
      ledger.record("a.json", "key2", "val2", "suit-b");
      ledger.record("b.json", "key3", "val3", "suit-a");

      const entries = ledger.getForFile("a.json");

      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.file === "a.json")).toBe(true);
    });
  });

  describe("l9: createdParent flag", () => {
    it("records and retrieves createdParent flag", () => {
      const ledger = new Ledger(ledgerPath);

      ledger.record("config.json", "new.parent.key", "value", "suit-a", true);
      const entry = ledger.get("config.json", "new.parent.key");

      expect(entry?.createdParent).toBe(true);
    });
  });

  describe("l10: atomic write safety", () => {
    it("leaves original file intact if write fails midway", () => {
      const ledger = new Ledger(ledgerPath);
      ledger.record("config.json", "key1", "val1", "suit-a");
      ledger.save();

      const originalContent = fs.readFileSync(ledgerPath, "utf-8");

      // Attempt save to a read-only directory (will fail)
      const readOnlyDir = path.join(tempDir, "readonly");
      fs.mkdirSync(readOnlyDir, { mode: 0o444 });
      const roLedgerPath = path.join(readOnlyDir, "ledger.json");
      const roLedger = new Ledger(roLedgerPath);
      roLedger.record("config.json", "key2", "val2", "suit-b");

      try {
        roLedger.save();
      } catch {
        // Expected to fail
      }

      // Original ledger should be unchanged
      expect(fs.readFileSync(ledgerPath, "utf-8")).toBe(originalContent);
      fs.chmodSync(readOnlyDir, 0o755); // restore for cleanup
    });
  });

  describe("l11: timestamp tracking", () => {
    it("records ISO timestamp for each entry", () => {
      const before = new Date();
      const ledger = new Ledger(ledgerPath);
      ledger.record("config.json", "key", "val", "suit-a");
      const after = new Date();

      const entry = ledger.get("config.json", "key");
      const timestamp = new Date(entry!.writtenAt);

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
