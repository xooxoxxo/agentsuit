import { describe, it, expect } from "vitest";
import {
  validateMcpServer,
  type McpServer,
  type McpServerStdio,
  type McpServerHttp,
} from "../src/mcp.js";

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
});
