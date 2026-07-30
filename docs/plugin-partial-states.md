# Plugin Components — Partial State Reference

This document enumerates every partial state that can occur during plugin activation and the recovery procedures for each. The plugin component system has two halves:

1. **Toggle** — ledger-managed updates to `enabledPlugins` entries in settings.json
2. **Install orchestration** — (future) running `claude plugin install` and marketplace setup

## Current Implementation

The strongsuit MVP implements the **toggle half only**. Plugin installation is managed by the user or external tooling; strongsuit manages only the `enabledPlugins` toggle point.

## Partial States — Toggle Half

### S1: Clean activation (success)

**Starting state:** User has suit manifest with `components.plugins` entries.

**Steps:**
1. Validate all plugin references (format: `plugin@marketplace`)
2. Lock ledger
3. For each plugin, record entry in `enabledPlugins` with ledger ownership
4. Unlock ledger

**Terminal state:** All plugins toggled on in `settings.json`; all ledger entries recorded.

**User sees:** "✓ plugins: plugin-1@marketplace, plugin-2@marketplace"

---

### S2: Ledger corruption (failure)

**Starting state:** Ledger is corrupted (read-only mode active).

**What fails:** Step 2 of S1 — lock attempt on corrupted ledger.

**Error reported:** `"Ledger is corrupted (path/to/ledger.json); read-only mode active. Cannot write."`

**Terminal state:** No plugin entries written; ledger unchanged; activation aborted with full rollback.

**Recovery:** Fix ledger corruption (e.g., `rm ~/.claude/strongsuit/ledger.json` to reset), then retry activation.

---

### S3: Invalid plugin reference (validation failure)

**Starting state:** User has suit manifest with malformed plugin reference (e.g., `"plugin-only"` instead of `"plugin@marketplace"`).

**What fails:** Step 1 of S1 — validation phase, before any ledger writes.

**Error reported:** `"Failed to activate plugins for suit 'suit-name': Invalid plugin reference 'plugin-only': must be in the form 'plugin@marketplace'"`

**Terminal state:** No plugin entries written; no ledger records created; activation aborted.

**Recovery:** Correct the manifest (add `@marketplace` suffix) and retry.

---

### S4: Clean deactivation (success)

**Starting state:** Some plugins are active (ledger records exist for them).

**Steps:**
1. Lock ledger
2. For each ledger record in `settings.json`:
   - Check if entry is owned by strongsuit (in ledger)
   - Remove the entry from `enabledPlugins`
   - Remove ledger record
3. Unlock ledger

**Terminal state:** All strongsuit-managed plugin entries removed; foreign entries preserved.

**User sees:** "All managed entries deactivated (user)" (no plugin-specific message; plugins rolled into general deactivation).

---

### S5: Round-trip consistency (activate → deactivate → activate)

**Verifies:** Byte-identical preservation of foreign entries across multiple activation cycles.

**Starting state:** Settings file contains both foreign and managed plugin entries.

```json
{
  "enabledPlugins": {
    "foreign-plugin@marketplace": true,    ← not owned by strongsuit ledger
    "managed-plugin@marketplace": true     ← owned by strongsuit ledger
  }
}
```

**Steps:**
1. Activate suit A (sets `plugin-a@marketplace`)
2. Activate suit B (sets `plugin-b@marketplace`)
3. Deactivate (removes suit B's entry)
4. Activate suit A again (restores suit A's entry)

**Terminal state:** Foreign entry untouched; managed entries toggled correctly.

**Verification:**
- Before/after byte hashes of foreign entries must match
- Foreign entry must persist through full cycle
- Managed entries must appear/disappear as expected

---

## Installation Orchestration (Future: XO-182+)

The full plugin component system will also implement install orchestration: when a referenced plugin is not installed locally, drive the `claude plugin` CLI to install it. This introduces additional partial states:

### S6: Marketplace unknown (future)

**Triggers:** Plugin references an unfamiliar marketplace (e.g., `plugin@internal-registry`).

**Steps:**
1. Run `claude plugin marketplace add <repo-url>` to register the marketplace
2. Then run `claude plugin install plugin@internal-registry`

**Partial failure:** Marketplace added, but install fails.

**State:** Marketplace registered; plugin not installed.

**Recovery:** `claude plugin marketplace remove <repo-url>`, then retry the full activation.

---

### S7: Install failure (future)

**Triggers:** Plugin install command exits with error.

**Partial state:** Nothing ledgered yet (all CLI operations precede ledger writes).

**Error reported:** Exact command that failed + exit code + stderr.

**Recovery:** Fix the environment issue (network, permissions, etc.), then retry.

---

### S8: Plugin already installed (future)

**Triggers:** Plugin already exists locally; install is a no-op.

**Behavior:** Skip install step, proceed directly to S1 (toggle via ledger).

**State:** Plugin is active without any install overhead.

---

## Rollback Behavior

Every journal entry is logged before any state change. On error at any point, all changes are reversed in LIFO order:

- Ledger writes are undone (entries removed)
- Settings file is reverted to its pre-activation state
- Any CLI operations (marketplace add, install) are **not** automatically undone (the `claude` CLI has its own state; strongsuit defers to user recovery instructions)

## Test Coverage

Every partial state S1–S5 is covered by automated tests:

- `test/plugin.test.ts`: p1–p5 test categories
- `test/up.test.ts`: extended activation/deactivation round-trip scenarios

Mutation testing verifies that each guard and journal entry is essential:
- Foreign-entry preservation guard
- Ledger ownership check before removal
- Validation-phase-failure rollback

---

## Checklist for XO-182+ (Install Orchestration)

When implementing install orchestration:

- [ ] Add S6, S7, S8 to this document
- [ ] Implement CLI stub injection (testable without real `claude` CLI)
- [ ] Test all failure paths in isolation
- [ ] Test marketplace-add-succeeds + install-fails partial state
- [ ] Add recovery instructions to error messages
- [ ] Mutation-test: break marketplace-add-check, install-check, pre-ledger guard
