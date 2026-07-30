import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, loadModules } from "./helpers.js";

describe("completion.ts", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe("runCompletion --list-sets", () => {
    it("lists all defined sets in plain newline format", async () => {
      const { sets: setsModule, paths } = await loadModules(tempHome);

      // Create some sets
      setsModule.saveSets({
        coding: ["skill-a", "skill-b"],
        marketing: ["skill-c"],
        "data-science": ["skill-d", "skill-e"],
      });

      // Import completion after setting env
      const { runCompletion } = await import("../src/commands/completion.js");

      // Capture console.log output
      const outputs: string[] = [];
      const originalLog = console.log;
      console.log = (msg?: unknown) => {
        if (typeof msg === "string") {
          outputs.push(msg);
        }
      };

      try {
        runCompletion("bash", "--list-sets");
      } finally {
        console.log = originalLog;
      }

      // Should output set names in sorted order
      expect(outputs).toEqual(["coding", "data-science", "marketing"]);
    });

    it("returns empty list when no sets are defined", async () => {
      await loadModules(tempHome);
      const { runCompletion } = await import("../src/commands/completion.js");

      const outputs: string[] = [];
      const originalLog = console.log;
      console.log = (msg?: unknown) => {
        if (typeof msg === "string") {
          outputs.push(msg);
        }
      };

      try {
        runCompletion("bash", "--list-sets");
      } finally {
        console.log = originalLog;
      }

      expect(outputs).toEqual([]);
    });
  });

  describe("runCompletion --list-skills", () => {
    it("lists all library skills in plain newline format", async () => {
      await loadModules(tempHome);
      const { runCompletion } = await import("../src/commands/completion.js");

      const outputs: string[] = [];
      const originalLog = console.log;
      console.log = (msg?: unknown) => {
        if (typeof msg === "string") {
          outputs.push(msg);
        }
      };

      try {
        runCompletion("bash", "--list-skills");
      } finally {
        console.log = originalLog;
      }

      // Should output skill names from the fixture in sorted order
      expect(outputs).toEqual(["skill-a", "skill-b", "skill-c", "skill-d", "skill-e"]);
    });
  });

  describe("runCompletion bash", () => {
    it("generates bash completion script", async () => {
      await loadModules(tempHome);
      const { runCompletion } = await import("../src/commands/completion.js");

      const outputs: string[] = [];
      const originalLog = console.log;
      console.log = (msg?: unknown) => {
        if (typeof msg === "string") {
          outputs.push(msg);
        }
      };

      try {
        runCompletion("bash");
      } finally {
        console.log = originalLog;
      }

      const script = outputs.join("\n");

      // Verify script contains bash completion function
      expect(script).toContain("_skillset_completion");
      expect(script).toContain("complete -o bashdefault");
      expect(script).toContain("_skillset_completion skillset");

      // Verify commands are mentioned
      expect(script).toContain("init");
      expect(script).toContain("list");
      expect(script).toContain("sets");
      expect(script).toContain("new");
      expect(script).toContain("use");
      expect(script).toContain("enable");
      expect(script).toContain("disable");
      expect(script).toContain("add");
      expect(script).toContain("remove");
      expect(script).toContain("import");
      expect(script).toContain("completion");

      // Verify completion modes
      expect(script).toContain("--list-sets");
      expect(script).toContain("--list-skills");
    });
  });

  describe("runCompletion zsh", () => {
    it("generates zsh completion script", async () => {
      await loadModules(tempHome);
      const { runCompletion } = await import("../src/commands/completion.js");

      const outputs: string[] = [];
      const originalLog = console.log;
      console.log = (msg?: unknown) => {
        if (typeof msg === "string") {
          outputs.push(msg);
        }
      };

      try {
        runCompletion("zsh");
      } finally {
        console.log = originalLog;
      }

      const script = outputs.join("\n");

      // Verify script contains zsh completion function
      expect(script).toContain("_skillset_completion");
      expect(script).toContain("_arguments");
      expect(script).toContain("_describe");

      // Verify commands are mentioned
      expect(script).toContain("init");
      expect(script).toContain("list");
      expect(script).toContain("sets");
      expect(script).toContain("new");
      expect(script).toContain("use");
      expect(script).toContain("enable");
      expect(script).toContain("disable");
      expect(script).toContain("add");
      expect(script).toContain("remove");
      expect(script).toContain("import");
      expect(script).toContain("completion");

      // Verify completion modes
      expect(script).toContain("--list-sets");
      expect(script).toContain("--list-skills");
    });
  });

  describe("runCompletion with invalid shell", () => {
    it("exits with error for unknown shell", async () => {
      await loadModules(tempHome);
      const { runCompletion } = await import("../src/commands/completion.js");

      const errors: string[] = [];
      const originalError = console.error;
      console.error = (msg?: unknown) => {
        if (typeof msg === "string") {
          errors.push(msg);
        }
      };

      let exitCode: number | null = null;
      const originalExit = process.exit;
      process.exit = ((code?: number) => {
        exitCode = code ?? 1;
        throw new Error(`Process exit with code ${exitCode}`);
      }) as never;

      try {
        expect(() => runCompletion("fish")).toThrow();
      } finally {
        console.error = originalError;
        process.exit = originalExit;
      }

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("Unknown shell");
    });
  });
});
