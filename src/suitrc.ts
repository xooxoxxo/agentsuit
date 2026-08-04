import fs from "node:fs";
import path from "node:path";
import { STRONGSUIT_DIR } from "./paths.js";

/**
 * The two layers binding a conversation to its suit (XO-193):
 *
 * 1. `.suitrc` in a directory — names the suit NEW sessions started there
 *    should wear. Nearest ancestor wins. One name, `#` comments.
 * 2. The session map — records session id → suit at launch, so a RESUMED
 *    conversation is re-dressed in the suit it was born with rather than
 *    whatever the directory currently says. Required because MCP flags do not
 *    survive `--resume` (docs/session-isolation.md, claim 12): without the
 *    map, isolation silently decays on the second turn of every conversation.
 */

export const SUITRC_NAME = ".suitrc";

/** Nearest `.suitrc` walking up from startDir, or null. */
export function findSuitrc(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, SUITRC_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Parse a `.suitrc`: exactly one suit name; blank lines and `#` comments
 * ignored. Anything else is malformed and throws — a file that names no suit
 * or several must never silently pick one.
 */
export function readSuitrc(filePath: string): string {
  const names = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (names.length === 0) {
    throw new Error(`${filePath} names no suit (only blank lines and comments)`);
  }
  if (names.length > 1) {
    throw new Error(
      `${filePath} is malformed: expected exactly one suit name, found ${names.length} (${names.join(", ")})`
    );
  }
  return names[0];
}

export function sessionsPath(): string {
  return path.join(STRONGSUIT_DIR, "sessions.json");
}

export interface SessionRecord {
  suit: string;
  cwd: string;
  launchedAt: string;
}

/**
 * Missing file → empty map. A CORRUPT file throws instead: silently returning
 * {} would wipe every binding on the next write.
 */
export function readSessions(): Record<string, SessionRecord> {
  const file = sessionsPath();
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, SessionRecord>;
  } catch (err) {
    throw new Error(
      `Session map ${file} is corrupt (${(err as Error).message}); fix or remove it before launching`
    );
  }
}

export function recordSession(id: string, record: SessionRecord): void {
  const sessions = readSessions();
  sessions[id] = record;
  const file = sessionsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export function sessionById(id: string): SessionRecord | undefined {
  return readSessions()[id];
}

/** Latest wrapper-launched session for a directory; bare sessions are invisible. */
export function latestSessionFor(cwd: string): { id: string; record: SessionRecord } | null {
  const resolved = path.resolve(cwd);
  let latest: { id: string; record: SessionRecord } | null = null;
  for (const [id, record] of Object.entries(readSessions())) {
    if (path.resolve(record.cwd) !== resolved) continue;
    if (!latest || record.launchedAt > latest.record.launchedAt) latest = { id, record };
  }
  return latest;
}
