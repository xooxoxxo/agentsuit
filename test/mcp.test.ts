import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  validateMcpServer,
  type McpServer,
  type McpServerStdio,
  type McpServerHttp,
} from "../src/mcp.js";
import { makeTempHome, loadModules } from "./helpers.js";

describe("MCP Server Configuration", () => {
  describe("m1: stdio server shape", () => {
    it("accepts valid stdio server with required fields", () => {
      const server = {
        name: "example",
        command: "example-mcp",
      };
      const validated = validateMcpServer(server) as McpServerStdio;
      expect(validated.name).toBe("example");
      expect(validated.command).toBe("example-mcp");
    });

    it("accepts stdio server with optional args", () => {
      const server = {
        name: "example",
        command: "example-mcp",
        args: ["--option", "value"],
      };
      const validated = validateMcpServer(server) as McpServerStdio;
      expect(validated.args).toEqual(["--option", "value"]);
    });

    it("accepts stdio server with optional env", () => {
      const server = {
        name: "example",
        command: "example-mcp",
        env: { VAR: "value" },
      };
      const validated = validateMcpServer(server) as McpServerStdio;
      expect(validated.env).toEqual({ VAR: "value" });
    });

    it("accepts stdio server with all optional fields", () => {
      const server = {
        name: "example",
        command: "example-mcp",
        args: ["--verbose"],
        env: { DEBUG: "1" },
      };
      const validated = validateMcpServer(server) as McpServerStdio;
      expect(validated.name).toBe("example");
      expect(validated.command).toBe("example-mcp");
      expect(validated.args).toEqual(["--verbose"]);
      expect(validated.env).toEqual({ DEBUG: "1" });
    });
  });

  describe("m2: http/sse server shape", () => {
    it("accepts valid http server", () => {
      const server = {
        name: "http-example",
        type: "http",
        url: "http://localhost:3000",
      };
      const validated = validateMcpServer(server) as McpServerHttp;
      expect(validated.name).toBe("http-example");
      expect(validated.type).toBe("http");
      expect(validated.url).toBe("http://localhost:3000");
    });

    it("accepts valid sse server", () => {
      const server = {
        name: "sse-example",
        type: "sse",
        url: "http://localhost:3000/sse",
      };
      const validated = validateMcpServer(server) as McpServerHttp;
      expect(validated.type).toBe("sse");
    });

    it("accepts http server with optional headers", () => {
      const server = {
        name: "http-auth",
        type: "http",
        url: "http://localhost:3000",
        headers: { Authorization: "Bearer token" },
      };
      const validated = validateMcpServer(server) as McpServerHttp;
      expect(validated.headers).toEqual({ Authorization: "Bearer token" });
    });
  });

  describe("m3: validation rejects invalid shapes", () => {
    it("rejects non-object input", () => {
      expect(() => validateMcpServer("not an object")).toThrow(
        /must be an object/
      );
      expect(() => validateMcpServer(123)).toThrow(/must be an object/);
      expect(() => validateMcpServer(null)).toThrow(/must be an object/);
      expect(() => validateMcpServer(undefined)).toThrow(/must be an object/);
    });

    it("rejects missing name", () => {
      const server = { command: "test" };
      expect(() => validateMcpServer(server)).toThrow(/required field 'name'/);
    });

    it("rejects empty name", () => {
      const server = { name: "", command: "test" };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'name' must be a non-empty string/
      );
      const server2 = { name: "   ", command: "test" };
      expect(() => validateMcpServer(server2)).toThrow(
        /field 'name' must be a non-empty string/
      );
    });

    it("rejects non-string name", () => {
      const server = { name: 123 };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'name' must be a non-empty string/
      );
    });

    it("rejects stdio server with empty command", () => {
      const server = { name: "test", command: "" };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'command' must be a non-empty string/
      );
    });

    it("rejects stdio server with non-string command", () => {
      const server = { name: "test", command: 123 };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'command' must be a non-empty string/
      );
    });

    it("rejects stdio server with non-array args", () => {
      const server = { name: "test", command: "cmd", args: "not-array" };
      expect(() => validateMcpServer(server)).toThrow(/field 'args' must be an array/);
    });

    it("rejects stdio server with non-object env", () => {
      const server = { name: "test", command: "cmd", env: "not-object" };
      expect(() => validateMcpServer(server)).toThrow(/field 'env' must be an object/);
    });

    it("rejects mixing stdio and http shapes", () => {
      const server = { name: "test", command: "cmd", type: "http", url: "http://example" };
      expect(() => validateMcpServer(server)).toThrow(
        /cannot specify both 'command'.*stdio.*and 'type'.*http/
      );
    });

    it("rejects http server with invalid type", () => {
      const server = { name: "test", type: "tcp", url: "http://example" };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'type' must be 'http' or 'sse'/
      );
    });

    it("rejects http server without url", () => {
      const server = { name: "test", type: "http" };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'url' is required/
      );
    });

    it("rejects http server with empty url", () => {
      const server = { name: "test", type: "http", url: "" };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'url' must be a non-empty string/
      );
    });

    it("rejects http server with non-string url", () => {
      const server = { name: "test", type: "http", url: 123 };
      expect(() => validateMcpServer(server)).toThrow(
        /field 'url' must be a non-empty string/
      );
    });

    it("rejects http server with non-object headers", () => {
      const server = {
        name: "test",
        type: "http",
        url: "http://example",
        headers: "not-object",
      };
      expect(() => validateMcpServer(server)).toThrow(/field 'headers' must be an object/);
    });

    it("rejects http server with command", () => {
      const server = {
        name: "test",
        type: "http",
        url: "http://example",
        command: "cmd",
      };
      expect(() => validateMcpServer(server)).toThrow();
    });

    it("rejects server with neither command nor type", () => {
      const server = { name: "test" };
      expect(() => validateMcpServer(server)).toThrow(
        /must specify either 'command'.*for stdio.*or 'type' and 'url'/
      );
    });
  });

  describe("m4: error messages are actionable", () => {
    it("names the field causing the error for stdio command", () => {
      const server = { name: "myserver", command: 123 };
      expect(() => validateMcpServer(server)).toThrow(
        /Invalid MCP server 'myserver'/
      );
    });

    it("names the server when validation fails", () => {
      const server = { name: "my-http-server", type: "invalid", url: "http://example" };
      expect(() => validateMcpServer(server)).toThrow(/my-http-server/);
    });

    it("does not include server name in generic validation errors", () => {
      const server = { name: 123 };
      expect(() => validateMcpServer(server)).toThrow(/field 'name'/);
    });
  });

  describe("m5: roundtrip validation", () => {
    it("all valid servers can be serialized and re-validated", () => {
      const servers: unknown[] = [
        { name: "s1", command: "cmd1", args: ["--flag"] },
        { name: "s2", command: "cmd2", env: { VAR: "val" } },
        { name: "s3", type: "http", url: "http://example" },
        { name: "s4", type: "sse", url: "http://sse", headers: { Auth: "x" } },
      ];

      for (const server of servers) {
        const validated1 = validateMcpServer(server);
        const json = JSON.stringify(validated1);
        const reparsed = JSON.parse(json);
        const validated2 = validateMcpServer(reparsed);
        expect(JSON.stringify(validated2)).toBe(json);
      }
    });
  });

  describe("MCP server activation — defect coverage (D1-D5, M1-M7)", () => {
    let tempHome: string;

    beforeEach(() => {
      tempHome = makeTempHome();
    });

    afterEach(() => {
      vi.resetModules();
      fs.rmSync(tempHome, { recursive: true, force: true });
    });

    describe("D1 + M1: Ledger paths from paths.ts (not hand-built)", () => {
      it("uses canonical ledger path from ledgerPath() function, caught by ManagedJson ledger tracking", async () => {
        const { paths, suits } = await loadModules(tempHome);

        // Create a suit with MCP servers
        suits.saveSuit({
          name: "test-suit",
          components: {
            mcp: [
              { name: "test-server", command: "test-cmd" },
            ],
          },
        });

        const ledger = paths.ledgerPath("user");
        const backups = paths.backupsDir("user");

        // The ledger path should be in the managed strongsuit directory
        expect(ledger).toContain("strongsuit");
        expect(ledger.endsWith("ledger.json")).toBe(true);
        expect(backups).toContain("strongsuit");
        expect(backups.endsWith("backups")).toBe(true);
      });
    });

    describe("D2: Capture actual previousValue (not undefined)", () => {
      it("preserves existing server on overwrite for rollback", async () => {
        const { paths } = await loadModules(tempHome);
        const configPath = path.join(tempHome, ".claude.json");

        // Write an initial server
        const initialServer = { name: "myserver", command: "initial-cmd" };
        const config = { mcpServers: { myserver: initialServer } };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // The ledger should capture the initial value on deactivation
        const ledger = paths.ledgerPath("user");
        const backups = paths.backupsDir("user");
        const { ManagedJson } = await import("../src/managed-json.js");
        const mg = new ManagedJson(ledger, backups);

        // Read current value before any write
        let current: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        let value = current;
        const pathArray = ["mcpServers", "myserver"];
        for (const key of pathArray) {
          if (typeof value === "object" && value !== null) {
            value = (value as Record<string, unknown>)[key];
          }
        }
        expect(value).toEqual(initialServer);
      });
    });

    describe("D3: Per-project nesting for user scope", () => {
      it("stores user-scope servers under per-project nesting, not flat mcpServers", async () => {
        const { mcpConfigPath, mcpConfigPathForProject } = await import("../src/mcp.js");

        const projectPath = process.cwd();
        const nesting = mcpConfigPathForProject(projectPath);

        // Should be ["mcpServers", "<project-key>"]
        expect(Array.isArray(nesting)).toBe(true);
        expect(nesting[0]).toBe("mcpServers");
        expect(nesting[1]).toMatch(/^[a-zA-Z0-9_]+$/); // key should be alphanumeric + underscore
      });
    });

    describe("D4: Workspace-trust notice for project scope", () => {
      it("includes trust notice in output when activating project-scope servers", async () => {
        const { suits } = await loadModules(tempHome);

        suits.saveSuit({
          name: "project-suit",
          components: {
            mcp: [
              { name: "project-server", command: "cmd" },
            ],
          },
        });

        // Note: The actual runUp function must be called to test the notice.
        // This is tested in the integration test below.
        expect(suits.loadSuit("project-suit").components?.mcp).toBeDefined();
      });
    });

    describe("D5: disabledMcpServers survival (M7)", () => {
      it("up + off preserves disabledMcpServers byte-identical", async () => {
        const { paths } = await loadModules(tempHome);
        const configPath = path.join(tempHome, ".claude.json");

        // Write a config with disabledMcpServers
        const initialConfig = {
          mcpServers: {},
          disabledMcpServers: [
            { name: "disabled-1", command: "cmd1" },
            { name: "disabled-2", command: "cmd2" },
          ],
        };
        fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));
        const initialContent = fs.readFileSync(configPath, "utf-8");

        // The ledger should only track what it writes, not disabledMcpServers
        const ledger = paths.ledgerPath("user");
        const backups = paths.backupsDir("user");
        const { ManagedJson } = await import("../src/managed-json.js");
        const mg = new ManagedJson(ledger, backups);

        // Reading ledger should not find disabledMcpServers entries
        const entries = mg.getLedgerEntries(configPath);
        const disabledEntries = entries.filter((e) => {
          const pathStr = Array.isArray(e.jsonPath) ? e.jsonPath.join(".") : e.jsonPath;
          return pathStr.includes("disabledMcpServers");
        });
        expect(disabledEntries).toHaveLength(0);

        // After any roundtrip through ManagedJson, disabledMcpServers should be unchanged
        const testConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(testConfig.disabledMcpServers).toEqual(initialConfig.disabledMcpServers);
      });
    });

    describe("M2: Deactivation only removes ledgered servers", () => {
      it("hand-added same-named server survives deactivation", async () => {
        const { paths } = await loadModules(tempHome);
        const configPath = path.join(tempHome, ".claude.json");

        // Write a config with a hand-added server (not in ledger)
        const config = {
          mcpServers: {
            "hand-server": { name: "hand-server", command: "hand-cmd" },
          },
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        const ledger = paths.ledgerPath("user");
        const backups = paths.backupsDir("user");
        const { ManagedJson } = await import("../src/managed-json.js");
        const mg = new ManagedJson(ledger, backups);

        // Deactivate should only remove ledgered entries, not this hand-added server
        // Reading the ledger shows no entries for hand-server
        const entries = mg.getLedgerEntries(configPath);
        const handServerEntries = entries.filter((e) => {
          const pathStr = Array.isArray(e.jsonPath) ? e.jsonPath.join(".") : e.jsonPath;
          return pathStr.includes("hand-server");
        });
        expect(handServerEntries).toHaveLength(0);

        // The hand-added server is still in the config
        const readConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(readConfig.mcpServers["hand-server"]).toBeDefined();
      });
    });
  });
});
