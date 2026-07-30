import type { Scope } from "./activate.js";
import path from "node:path";
import { CLAUDE_HOME } from "./paths.js";

/**
 * MCP server configuration shapes:
 * - stdio: {name, command, args?, env?}
 * - http/sse: {name, type, url, headers?}
 */
export interface McpServerStdio {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerHttp {
  name: string;
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

export type McpServer = McpServerStdio | McpServerHttp;

/**
 * Validates an MCP server configuration object.
 * @throws Error with an actionable message if validation fails
 */
export function validateMcpServer(server: unknown): McpServer {
  if (!server || typeof server !== "object") {
    throw new Error(
      "Invalid MCP server configuration: must be an object (got " +
        typeof server +
        ")"
    );
  }

  const obj = server as Record<string, unknown>;

  // Check required fields
  if (!("name" in obj)) {
    throw new Error(
      "Invalid MCP server configuration: required field 'name' is missing"
    );
  }
  if (typeof obj.name !== "string" || obj.name.trim() === "") {
    throw new Error(
      "Invalid MCP server configuration: field 'name' must be a non-empty string"
    );
  }

  // Check for stdio vs http/sse shape
  if ("command" in obj) {
    // stdio shape
    if (typeof obj.command !== "string" || obj.command.trim() === "") {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'command' must be a non-empty string for stdio servers`
      );
    }
    if ("args" in obj && !Array.isArray(obj.args)) {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'args' must be an array or omitted`
      );
    }
    if ("env" in obj && (typeof obj.env !== "object" || obj.env === null || Array.isArray(obj.env))) {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'env' must be an object or omitted`
      );
    }
    if ("type" in obj) {
      throw new Error(
        `Invalid MCP server '${obj.name}': cannot specify both 'command' (stdio) and 'type' (http/sse)`
      );
    }
    if ("url" in obj) {
      throw new Error(
        `Invalid MCP server '${obj.name}': cannot specify both 'command' (stdio) and 'url' (http/sse)`
      );
    }
    return obj as unknown as McpServerStdio;
  } else if ("type" in obj) {
    // http/sse shape
    if (obj.type !== "http" && obj.type !== "sse") {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'type' must be 'http' or 'sse' (got '${obj.type}')`
      );
    }
    if (!("url" in obj)) {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'url' is required for type '${obj.type}'`
      );
    }
    if (typeof obj.url !== "string" || obj.url.trim() === "") {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'url' must be a non-empty string`
      );
    }
    if ("headers" in obj && (typeof obj.headers !== "object" || obj.headers === null || Array.isArray(obj.headers))) {
      throw new Error(
        `Invalid MCP server '${obj.name}': field 'headers' must be an object or omitted`
      );
    }
    if ("command" in obj) {
      throw new Error(
        `Invalid MCP server '${obj.name}': cannot specify both 'type' (http/sse) and 'command' (stdio)`
      );
    }
    return obj as unknown as McpServerHttp;
  } else {
    throw new Error(
      `Invalid MCP server '${obj.name}': must specify either 'command' (for stdio) or 'type' and 'url' (for http/sse)`
    );
  }
}

/**
 * Returns the config file path for MCP servers at the given scope.
 * - user: ~/.claude.json (in home directory)
 * - project: .mcp.json at project root
 */
export function mcpConfigPath(scope: Scope): string {
  if (scope === "project") {
    return path.join(process.cwd(), ".mcp.json");
  }
  // user scope: ~/.claude.json (home directory, same parent as ~/.claude)
  return path.join(path.dirname(CLAUDE_HOME), ".claude.json");
}

/**
 * Returns the nesting path for a specific project within the user-scope config.
 * Used to store per-project server definitions in ~/.claude.json
 */
export function mcpConfigPathForProject(projectPath: string): string[] {
  const key = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
  return ["mcpServers", key];
}
