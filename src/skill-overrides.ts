import fs from "node:fs";
import path from "node:path";
import type { Scope } from "./activate.js";
import { settingsPath } from "./hooks.js";
import { backupsDir } from "./paths.js";

/**
 * Claude Code's /skills panel stores per-skill toggles in settings.json under
 * `skillOverrides` ({"name": "off" | "on"}). An "off" override beats presence:
 * a skill strongsuit links is still not loaded. Users coming from the panel-
 * toggling era have dozens of these, so activation must reconcile them —
 * an explicit `suit up`/`suit enable` naming the skill IS the consent to flip
 * the user's own toggle. Only "off" values for the named skills are removed;
 * every other key in the file, including other overrides, is untouched.
 */

/** The subset of `names` currently overridden "off" for the scope. */
export function offOverrides(names: string[], scope: Scope): string[] {
  const overrides = readOverrides(scope);
  return names.filter((name) => overrides[name] === "off");
}

/**
 * Remove "off" overrides for exactly the named skills. Returns the names
 * actually cleared. Backs the settings file up before the first write and
 * writes atomically.
 */
export function clearOffOverrides(names: string[], scope: Scope): string[] {
  const file = settingsPath(scope);
  const settings = readSettings(file);
  const overrides = settings?.skillOverrides;
  if (!settings || !isRecord(overrides)) return [];

  const cleared = names.filter((name) => overrides[name] === "off");
  if (cleared.length === 0) return [];

  const backupDir = backupsDir(scope);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(file, path.join(backupDir, `settings.json.pre-override-clear`));

  for (const name of cleared) delete overrides[name];
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return cleared;
}

function readOverrides(scope: Scope): Record<string, unknown> {
  const settings = readSettings(settingsPath(scope));
  const overrides = settings?.skillOverrides;
  return isRecord(overrides) ? overrides : {};
}

function readSettings(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRecord(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null; // missing or unparseable: nothing to reconcile, never write
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
