import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, loadModules } from "./helpers.js";

describe("suits.ts manifest schema + storage", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("listSuits / suitExists", () => {
    it("lists suit names from SUITS_DIR", async () => {
      const { suits, paths } = await loadModules(tempHome);

      expect(suits.listSuits()).toEqual([]);

      // Create two suits
      suits.saveSuit({ name: "suit-1", components: { skills: ["a", "b"] } });
      suits.saveSuit({ name: "suit-2", components: { skills: ["c"] } });

      const list = suits.listSuits();
      expect(list.sort()).toEqual(["suit-1", "suit-2"]);
    });

    it("suitExists returns true only for actual suit directories", async () => {
      const { suits } = await loadModules(tempHome);

      suits.saveSuit({ name: "real-suit", components: { skills: [] } });

      expect(suits.suitExists("real-suit")).toBe(true);
      expect(suits.suitExists("nonexistent")).toBe(false);
    });
  });

  describe("manifest round-trip", () => {
    it("saves and loads a suit with all component types", async () => {
      const { suits } = await loadModules(tempHome);

      const manifest = {
        name: "full-suit",
        description: "A suit with all component types",
        components: {
          skills: ["skill-a", "skill-b"],
          commands: ["cmd-1"],
          agents: ["agent-1"],
          rules: ["rule-1"],
          claudemd: ["md-1"],
          mcp: [{ server: "test" }],
          plugins: ["plugin-1"],
          hooks: [{ event: "load" }],
        },
      };

      suits.saveSuit(manifest);
      const loaded = suits.loadSuit("full-suit");

      expect(loaded.name).toBe("full-suit");
      expect(loaded.description).toBe("A suit with all component types");
      expect(loaded.components?.skills).toEqual(["skill-a", "skill-b"]);
      expect(loaded.components?.mcp).toEqual([{ server: "test" }]);
    });

    it("preserves empty optional fields", async () => {
      const { suits } = await loadModules(tempHome);

      const manifest = { name: "minimal" };
      suits.saveSuit(manifest);
      const loaded = suits.loadSuit("minimal");

      expect(loaded.name).toBe("minimal");
      expect(loaded.description).toBeUndefined();
      expect(loaded.components).toBeUndefined();
    });
  });

  describe("validation", () => {
    it("rejects missing name field", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({ components: { skills: [] } } as any);
      }).toThrow(/required field 'name'/);
    });

    it("rejects non-string name", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({ name: 123 } as any);
      }).toThrow(/field 'name' must be a non-empty string/);
    });

    it("rejects empty string name", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({ name: "" });
      }).toThrow(/field 'name' must be a non-empty string/);
    });

    it("rejects non-string description", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({ name: "test", description: 123 } as any);
      }).toThrow(/field 'description' must be a string or null/);
    });

    it("rejects unknown field at root level", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({ name: "test", unknownField: "x" } as any);
      }).toThrow(/unknown field 'unknownField'/);
    });

    it("rejects unknown field in components", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({
          name: "test",
          components: { unknownComponent: [] } as any,
        });
      }).toThrow(/unknown field 'components.unknownComponent'/);
    });

    it("rejects non-array/non-object component field", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.saveSuit({
          name: "test",
          components: { skills: "not-an-array" } as any,
        });
      }).toThrow(/field 'components.skills' must be an array or object/);
    });
  });

  describe("malformed YAML error handling", () => {
    it("reports file path when YAML is unparseable", async () => {
      const { suits, paths } = await loadModules(tempHome);

      // Create a suit directory with bad YAML
      const suitDir = path.join(paths.SUITS_DIR, "bad-suit");
      fs.mkdirSync(suitDir, { recursive: true });
      const manifestPath = path.join(suitDir, "suit.yaml");
      fs.writeFileSync(manifestPath, "{ invalid yaml: unclosed bracket", "utf8");

      expect(() => {
        suits.loadSuit("bad-suit");
      }).toThrow(/Failed to parse YAML in.*bad-suit.*suit.yaml/);
    });

    it("throws when suit directory doesn't exist", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.loadSuit("nonexistent");
      }).toThrow(/Suit directory not found/);
    });

    it("throws when suit.yaml is missing", async () => {
      const { suits, paths } = await loadModules(tempHome);

      // Create suit dir without manifest
      const suitDir = path.join(paths.SUITS_DIR, "no-manifest");
      fs.mkdirSync(suitDir, { recursive: true });

      expect(() => {
        suits.loadSuit("no-manifest");
      }).toThrow(/Suit manifest not found/);
    });
  });

  describe("deleteSuit", () => {
    it("removes suit directory", async () => {
      const { suits } = await loadModules(tempHome);

      suits.saveSuit({ name: "to-delete" });
      expect(suits.suitExists("to-delete")).toBe(true);

      suits.deleteSuit("to-delete");
      expect(suits.suitExists("to-delete")).toBe(false);
    });

    it("silently succeeds when suit doesn't exist", async () => {
      const { suits } = await loadModules(tempHome);

      expect(() => {
        suits.deleteSuit("nonexistent");
      }).not.toThrow();
    });
  });

  describe("sets.ts adapter over suits", () => {
    it("loadSets derives from suit manifests' components.skills", async () => {
      const { suits, sets } = await loadModules(tempHome);

      suits.saveSuit({ name: "set-1", components: { skills: ["a", "b"] } });
      suits.saveSuit({ name: "set-2", components: { skills: ["c"] } });
      suits.saveSuit({ name: "empty-set" });

      const setsRecord = sets.loadSets();

      expect(setsRecord["set-1"]).toEqual(["a", "b"]);
      expect(setsRecord["set-2"]).toEqual(["c"]);
      expect(setsRecord["empty-set"]).toEqual([]);
    });

    it("saveSets creates/updates/deletes manifests", async () => {
      const { suits, sets } = await loadModules(tempHome);

      // Start with one suit
      suits.saveSuit({ name: "keep-me", components: { skills: ["old"] } });
      suits.saveSuit({ name: "delete-me" });

      // Save new sets
      sets.saveSets({
        "keep-me": ["updated"],
        "new-suit": ["fresh"],
      });

      // Verify manifests
      expect(suits.listSuits().sort()).toEqual(["keep-me", "new-suit"]);
      expect(suits.loadSuit("keep-me").components?.skills).toEqual(["updated"]);
      expect(suits.loadSuit("new-suit").components?.skills).toEqual(["fresh"]);
    });

    it("saveSets with empty record deletes all suits", async () => {
      const { suits, sets } = await loadModules(tempHome);

      suits.saveSuit({ name: "a" });
      suits.saveSuit({ name: "b" });

      sets.saveSets({});

      expect(suits.listSuits()).toEqual([]);
    });
  });

  describe("legacy sets.json auto-conversion", () => {
    it("converts sets.json to suit manifests on first loadSets call", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy sets.json
      const agentsuitDir = path.join(tempHome, "agentsuit");
      fs.mkdirSync(agentsuitDir, { recursive: true });
      const setsFile = path.join(agentsuitDir, "sets.json");
      fs.writeFileSync(
        setsFile,
        JSON.stringify({
          "legacy-set": ["skill-1", "skill-2"],
          "another-set": ["skill-3"],
        }),
        "utf8"
      );

      // Verify suits dir doesn't exist yet
      expect(fs.existsSync(paths.SUITS_DIR)).toBe(false);

      // Reset modules and load
      vi.resetModules();
      const { sets, suits } = await loadModules(tempHome);

      // loadSets should trigger conversion
      const setsRecord = sets.loadSets();

      // Verify manifests were created
      expect(suits.listSuits().sort()).toEqual(["another-set", "legacy-set"]);
      expect(suits.loadSuit("legacy-set").components?.skills).toEqual(["skill-1", "skill-2"]);
      expect(suits.loadSuit("another-set").components?.skills).toEqual(["skill-3"]);

      // Verify sets.json was backed up
      const backupPath = setsFile + ".migrated";
      expect(fs.existsSync(backupPath)).toBe(true);

      // Verify original sets.json is gone
      expect(fs.existsSync(setsFile)).toBe(false);

      // Verify setsRecord is correct
      expect(setsRecord).toEqual({
        "legacy-set": ["skill-1", "skill-2"],
        "another-set": ["skill-3"],
      });
    });

    it("is idempotent — calling loadSets twice doesn't recreate", async () => {
      const { paths } = await loadModules(tempHome);

      // Create legacy sets.json
      const agentsuitDir = path.join(tempHome, "agentsuit");
      fs.mkdirSync(agentsuitDir, { recursive: true });
      const setsFile = path.join(agentsuitDir, "sets.json");
      fs.writeFileSync(setsFile, JSON.stringify({ "test-set": ["skill"] }), "utf8");

      vi.resetModules();
      const { sets, suits } = await loadModules(tempHome);

      // First call converts
      sets.loadSets();
      const firstManifest = suits.loadSuit("test-set");

      // Modify the manifest to check it doesn't get reset
      suits.saveSuit({ ...firstManifest, description: "modified" });

      // Second call should not re-convert
      sets.loadSets();
      const secondManifest = suits.loadSuit("test-set");

      expect(secondManifest.description).toBe("modified");
    });
  });

  describe("relocation + conversion chain", () => {
    it("migrate moves sets.json, which converts on next loadSets", async () => {
      const { paths, migrate } = await loadModules(tempHome);

      // Simulate legacy installation with sets.json
      const legacyRoot = path.join(tempHome, "skillsets");
      const legacyLibrary = path.join(legacyRoot, "library");
      fs.mkdirSync(legacyLibrary, { recursive: true });

      const legacySets = path.join(legacyRoot, "sets.json");
      fs.writeFileSync(legacySets, JSON.stringify({ "migrated-set": ["skill-a"] }), "utf8");

      // Run migration
      const result = migrate.migrate(legacyRoot, legacyLibrary, legacySets);

      // Verify sets.json was moved to new location
      const newSetsPath = path.join(paths.AGENTSUIT_DIR, "sets.json");
      expect(fs.existsSync(newSetsPath)).toBe(true);

      // Reset modules to trigger conversion on next loadSets
      vi.resetModules();
      const { sets, suits } = await loadModules(tempHome);

      // Load sets — should convert the migrated sets.json
      sets.loadSets();

      // Verify manifests were created
      expect(suits.suitExists("migrated-set")).toBe(true);
      expect(suits.loadSuit("migrated-set").components?.skills).toEqual(["skill-a"]);
    });
  });
});
