import fs from "node:fs";
import path from "node:path";
import { STRONGSUIT_DIR } from "./paths.js";
import { contentHash, type Decision, type ReviewItem } from "./review.js";

/**
 * The lockfile pins what was actually approved: for every component that
 * passed review, the sha256 of exactly what the reviewer saw, plus the text
 * itself so drift can be shown as a diff rather than a pair of hashes.
 *
 * `suit up` trusts a pin only when the current content still matches it —
 * unchanged components activate silently, changed ones are blocked until
 * re-reviewed. That is the whole supply-chain story: approval attaches to
 * content, never to a name.
 */

export interface LockedComponent {
  type: string;
  id: string;
  contentHash: string;
  /** What was approved, verbatim — the basis for drift diffs. */
  detail: string;
  pinnedAt: string;
}

export interface LockedSuit {
  /** Where the suit came from, when it was installed from a remote. */
  source?: string;
  ref?: string;
  components: LockedComponent[];
}

interface LockFile {
  version: 1;
  suits: Record<string, LockedSuit>;
}

export function lockPath(): string {
  return path.join(STRONGSUIT_DIR, "suit.lock");
}

export function readLock(): LockFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath(), "utf-8")) as LockFile;
    if (parsed && typeof parsed === "object" && parsed.suits) return parsed;
  } catch {
    // Missing or unreadable: an empty lock, not an error.
  }
  return { version: 1, suits: {} };
}

function writeLock(lock: LockFile): void {
  const file = lockPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(lock, null, 2), "utf-8");
  fs.renameSync(temp, file);
}

/**
 * Pins every approved decision for a suit. Rejected components are not
 * pinned — a pin is an approval, and recording anything else would let a
 * later `suit up` mistake "seen once" for "agreed to".
 */
export function pinSuit(
  suitName: string,
  decisions: Decision[],
  source?: { location: string; ref?: string }
): void {
  const lock = readLock();
  const pinnedAt = new Date().toISOString();

  const previous = lock.suits[suitName]?.components ?? [];
  const kept = new Map(previous.map((c) => [`${c.type}#${c.id}`, c]));

  for (const { item, approved } of decisions) {
    const key = `${item.type}#${item.id}`;
    if (approved) {
      kept.set(key, {
        type: item.type,
        id: item.id,
        contentHash: contentHash(item.detail),
        detail: item.detail,
        pinnedAt,
      });
    } else {
      // An explicit rejection withdraws any older pin for the same name.
      kept.delete(key);
    }
  }

  // A new source wins; otherwise whatever the lock already knew survives.
  const origin = source
    ? { source: source.location, ...(source.ref ? { ref: source.ref } : {}) }
    : {
        ...(lock.suits[suitName]?.source ? { source: lock.suits[suitName].source } : {}),
        ...(lock.suits[suitName]?.ref ? { ref: lock.suits[suitName].ref } : {}),
      };

  lock.suits[suitName] = { ...origin, components: Array.from(kept.values()) };
  writeLock(lock);
}

/** How one current review item relates to the lock. */
export type PinState = "unchanged" | "changed" | "unpinned";

export interface VerifiedItem {
  item: ReviewItem;
  state: PinState;
  /** The pin the item was checked against, when one exists. */
  pinned?: LockedComponent;
}

/**
 * Checks a suit's current review plan against its pins.
 *
 * unchanged — hash matches the pin; the approval still applies.
 * changed   — a pin exists but the content is not what was approved: upstream
 *             drift or local tamper, indistinguishable by design. Blocked.
 * unpinned  — never approved (or approval withdrawn); full review applies.
 */
export function verifyAgainstLock(suitName: string, plan: ReviewItem[]): VerifiedItem[] {
  const locked = readLock().suits[suitName]?.components ?? [];
  const pins = new Map(locked.map((c) => [`${c.type}#${c.id}`, c]));

  return plan.map((item) => {
    const pinned = pins.get(`${item.type}#${item.id}`);
    if (!pinned) return { item, state: "unpinned" as const };
    return contentHash(item.detail) === pinned.contentHash
      ? { item, state: "unchanged" as const, pinned }
      : { item, state: "changed" as const, pinned };
  });
}

/**
 * Line-level diff of pinned vs current content: enough to see what changed
 * in a skill or a hook command without a dependency. Not minimal, just
 * honest — removed lines prefixed `-`, added `+`.
 */
export function driftDiff(pinned: string, current: string): string {
  const before = pinned.split("\n");
  const after = current.split("\n");
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const lines: string[] = [];
  for (const line of before) {
    if (!afterSet.has(line)) lines.push(`- ${line}`);
  }
  for (const line of after) {
    if (!beforeSet.has(line)) lines.push(`+ ${line}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(contents reordered)";
}
