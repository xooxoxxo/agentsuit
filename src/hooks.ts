import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Scope } from "./activate.js";
import { CLAUDE_HOME } from "./paths.js";
import type { ManagedJson } from "./managed-json.js";

/**
 * Hooks are the one component type that executes arbitrary code the moment
 * Claude Code fires the matching event. Every rule in this file exists because
 * of that: hooks are never bulk-approved, never merged into an event someone
 * else already owns, and never activated without their full command being
 * printed first.
 */

/** A hook as written in a suit manifest. */
export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

/**
 * Events Claude Code recognises. Validating against this list turns a typo
 * into an error instead of a hook that silently never fires.
 */
export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "UserPromptSubmit",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
] as const;

/** Settings file holding the `hooks` key for a scope. */
export function settingsPath(scope: Scope): string {
  return scope === "project"
    ? path.join(process.cwd(), ".claude", "settings.json")
    : path.join(CLAUDE_HOME, "settings.json");
}

/**
 * Validates a hook entry from a manifest.
 * @throws Error with an actionable message if validation fails
 */
export function validateHook(hook: unknown): HookEntry {
  if (!hook || typeof hook !== "object" || Array.isArray(hook)) {
    throw new Error(
      `Invalid hook: must be an object (got ${Array.isArray(hook) ? "array" : typeof hook})`
    );
  }

  const obj = hook as Record<string, unknown>;

  if (typeof obj.event !== "string" || obj.event.trim() === "") {
    throw new Error("Invalid hook: field 'event' must be a non-empty string");
  }
  if (!(HOOK_EVENTS as readonly string[]).includes(obj.event)) {
    throw new Error(
      `Invalid hook: unknown event '${obj.event}'. Known events: ${HOOK_EVENTS.join(", ")}`
    );
  }
  if (typeof obj.command !== "string" || obj.command.trim() === "") {
    throw new Error(
      `Invalid hook for event '${obj.event}': field 'command' must be a non-empty string`
    );
  }
  if ("matcher" in obj && typeof obj.matcher !== "string") {
    throw new Error(
      `Invalid hook for event '${obj.event}': field 'matcher' must be a string or omitted`
    );
  }
  if (
    "timeout" in obj &&
    (typeof obj.timeout !== "number" || !Number.isFinite(obj.timeout) || obj.timeout <= 0)
  ) {
    throw new Error(
      `Invalid hook for event '${obj.event}': field 'timeout' must be a positive number or omitted`
    );
  }

  return {
    event: obj.event,
    command: obj.command,
    ...(obj.matcher !== undefined ? { matcher: obj.matcher as string } : {}),
    ...(obj.timeout !== undefined ? { timeout: obj.timeout as number } : {}),
  };
}

/** The settings-shaped group for one hook. */
export function toSettingsGroup(hook: HookEntry): Record<string, unknown> {
  return {
    ...(hook.matcher !== undefined ? { matcher: hook.matcher } : {}),
    hooks: [
      {
        type: "command",
        command: hook.command,
        ...(hook.timeout !== undefined ? { timeout: hook.timeout } : {}),
      },
    ],
  };
}

/**
 * Human-readable description of a hook, including the command in full.
 * Never truncate the command: it is the thing being approved.
 */
export function formatHook(hook: HookEntry): string {
  const target = hook.matcher !== undefined ? `${hook.event} [${hook.matcher}]` : hook.event;
  const timeout = hook.timeout !== undefined ? ` (timeout ${hook.timeout}s)` : "";
  return `${target}${timeout}\n    ${hook.command}`;
}

/*
 * Approval used to live here. It now belongs to the review engine
 * (src/review.ts), which gates every component type by risk class rather than
 * hooks alone — two approval paths meant two sets of rules to keep in step,
 * and their `--yes` semantics had already diverged.
 */

/** Reads a settings file, returning an empty object when absent or unparseable. */
function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** True when the scope's settings disable every hook. */
export function hooksDisabled(scope: Scope): boolean {
  return readSettings(settingsPath(scope)).disableAllHooks === true;
}

/** A JSON write made on behalf of hooks, for the caller's rollback journal. */
export interface HookWrite {
  jsonPath: string[];
  previousValue: unknown;
}

/** True when the ledger records this exact key, i.e. strongsuit wrote it. */
function isLedgered(managed: ManagedJson, file: string, jsonPath: string[]): boolean {
  const wanted = jsonPath.join(".");
  return managed
    .getLedgerEntries(file)
    .some((entry) =>
      (Array.isArray(entry.jsonPath) ? entry.jsonPath.join(".") : entry.jsonPath) === wanted
    );
}

function groupByEvent(hooks: HookEntry[]): Map<string, HookEntry[]> {
  const byEvent = new Map<string, HookEntry[]>();
  for (const hook of hooks) {
    const existing = byEvent.get(hook.event);
    if (existing) existing.push(hook);
    else byEvent.set(hook.event, [hook]);
  }
  return byEvent;
}

/**
 * Writes approved hooks into the scope's settings file.
 *
 * Ownership is per event, not per hook: `hooks.<Event>` is an array, and the
 * ledger records a hash of the whole value. An event we already own is
 * replaced wholesale, so re-activating never accumulates duplicates. An event
 * holding hooks we did not write is refused outright — merging into it would
 * mean rewriting an array whose foreign elements we cannot later distinguish
 * from our own, and a wrong guess there deletes someone's hook.
 *
 * @returns One record per write, so the caller can journal it for rollback.
 */
export function activateHooks(
  hooks: HookEntry[],
  scope: Scope,
  suitName: string,
  managed: ManagedJson
): HookWrite[] {
  if (hooks.length === 0) return [];

  const file = settingsPath(scope);
  const settings = readSettings(file);
  const currentHooks =
    settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
      ? (settings.hooks as Record<string, unknown>)
      : {};

  const writes: HookWrite[] = [];

  for (const [event, eventHooks] of groupByEvent(hooks)) {
    const jsonPath = ["hooks", event];
    const previousValue = currentHooks[event];

    if (previousValue !== undefined && !isLedgered(managed, file, jsonPath)) {
      throw new Error(
        `Refusing to write hooks for event '${event}' in ${file}: it already holds hooks strongsuit did not create. ` +
          `Remove them, or move them to a scope this suit does not manage.`
      );
    }

    const value = eventHooks.map(toSettingsGroup);
    const result = managed.setEntries(file, [{ jsonPath, value }], suitName);
    if (result.conflicts.length > 0) {
      throw new Error(
        `Refusing to write hooks for event '${event}' in ${file}: the value changed since strongsuit last wrote it.`
      );
    }

    writes.push({ jsonPath, previousValue });
  }

  return writes;
}

/**
 * Removes every hook event strongsuit owns in this scope.
 * Events it does not own are left exactly as they are.
 *
 * @returns One record per removal, so the caller can journal it for rollback.
 */
export function deactivateHooks(scope: Scope, managed: ManagedJson): HookWrite[] {
  const file = settingsPath(scope);
  if (!fs.existsSync(file)) return [];

  const settings = readSettings(file);
  const currentHooks =
    settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
      ? (settings.hooks as Record<string, unknown>)
      : {};

  const writes: HookWrite[] = [];

  for (const entry of managed.getLedgerEntries(file)) {
    const jsonPath = Array.isArray(entry.jsonPath) ? entry.jsonPath : entry.jsonPath.split(".");
    if (jsonPath.length !== 2 || jsonPath[0] !== "hooks") continue;

    writes.push({ jsonPath, previousValue: currentHooks[jsonPath[1]] });
    managed.removeEntries(file, [jsonPath]);
  }

  return writes;
}

/** Notice printed when hooks were activated into settings that disable them all. */
export function disabledNotice(scope: Scope): string | null {
  if (!hooksDisabled(scope)) return null;
  return chalk.yellow(
    `⚠️  disableAllHooks is true in ${settingsPath(scope)} — the hooks above are installed but will not run until you unset it.`
  );
}
