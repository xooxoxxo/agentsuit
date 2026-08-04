import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { rollbackJournal, type JournalEntry } from "../src/commands/up.js";
import { ManagedJson } from "../src/managed-json.js";
import { ledgerPath, backupsDir, STRONGSUIT_DIR, CLAUDE_HOME } from "../src/paths.js";

/**
 * XO-196: the json-entry rollback branch once hand-built its ledger/backups
 * paths from path.dirname(entry.path) — for user scope that resolves to the
 * home root, where the ledger owns nothing, so removal silently no-opped.
 * These tests exercise rollbackJournal directly with a synthetic journal; the
 * added-server case fails if the canonical-paths fix regresses.
 */

// Deliberately a file whose dirname is CLAUDE_HOME, not STRONGSUIT_DIR: the
// regression builds its ledger from this dirname and must visibly own nothing.
const CONFIG = path.join(CLAUDE_HOME, "test-claude.json");
const JSON_PATH = ["mcpServers", "added-server"];

function canonical(): ManagedJson {
  return new ManagedJson(ledgerPath("user"), backupsDir("user"));
}

afterEach(() => {
  fs.rmSync(STRONGSUIT_DIR, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
});

describe("json-entry rollback (XO-196)", () => {
  it("removes an ADDED server via the scope's canonical ledger — the discriminating case", () => {
    // Activation added the server: file has the key, canonical ledger owns it.
    canonical().setEntries(CONFIG, [{ jsonPath: JSON_PATH, value: { command: "npx" } }], "testsuit");
    expect(JSON.parse(fs.readFileSync(CONFIG, "utf8")).mcpServers["added-server"]).toEqual({
      command: "npx",
    });

    const journal: JournalEntry[] = [
      {
        type: "json-entry",
        path: CONFIG,
        jsonPath: JSON_PATH,
        previousValue: undefined, // absent before activation → rollback must REMOVE
        scope: "user",
      } as JournalEntry,
    ];
    rollbackJournal(journal);

    // A ledger built from dirname(entry.path) owns nothing and no-ops here.
    expect(JSON.parse(fs.readFileSync(CONFIG, "utf8")).mcpServers ?? {}).not.toHaveProperty(
      "added-server"
    );
  });

  it("restores an OVERWRITTEN server's previous value", () => {
    canonical().setEntries(CONFIG, [{ jsonPath: JSON_PATH, value: { command: "new" } }], "testsuit");

    const journal: JournalEntry[] = [
      {
        type: "json-entry",
        path: CONFIG,
        jsonPath: JSON_PATH,
        previousValue: { command: "old" },
        scope: "user",
      } as JournalEntry,
    ];
    rollbackJournal(journal);

    expect(JSON.parse(fs.readFileSync(CONFIG, "utf8")).mcpServers["added-server"]).toEqual({
      command: "old",
    });
  });
});
