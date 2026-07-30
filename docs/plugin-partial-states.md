# Plugin Components — Partial State Reference

This document enumerates every partial state that can occur during plugin activation and the recovery procedures for each. The plugin component system has two halves:

1. **Toggle** — ledger-managed updates to `enabledPlugins` entries in settings.json
2. **Install orchestration** — running `claude plugin install`, adding a marketplace first when one is needed

## Current Implementation

Both halves are implemented. Installation runs **before** any ledger write, so a
plugin that cannot be installed never reaches the toggle and no half-written
settings state exists — the only recovery ever needed concerns the `claude`
CLI's own state, never strongsuit's.

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

## Installation Orchestration

`ensurePluginInstalled` runs before any settings write, and returns rather than
throws: a half-finished install is a normal outcome here, not an exceptional
one, and the caller has to report it precisely. Every outcome names what was
left behind and, where anything was, the command that undoes it.

A suit entry may be a bare reference or carry its marketplace source:

```yaml
plugins:
  - superpowers@claude-plugins-official          # marketplace already configured
  - ref: caveman@caveman                         # marketplace added if missing
    marketplace: JuliusBrussee/caveman
```

| Outcome | Trigger | Left behind | Recovery |
|---|---|---|---|
| `already-installed` | `claude plugin list` names the ref | nothing | — |
| `installed` | marketplace known, install succeeded | plugin installed | — |
| `marketplace-added-and-installed` | marketplace added, then install succeeded | marketplace + plugin | — |
| `marketplace-unknown` | marketplace missing and the suit gives no source | **nothing** — only `list` commands ran | add the marketplace by hand, or give the entry a `marketplace:` source |
| `marketplace-add-failed` | `marketplace add` exited non-zero | **nothing** | fix the source or network, retry |
| `install-failed` | install exited non-zero, marketplace was already known | **nothing** | fix the cause, retry |
| `install-failed-after-marketplace-add` | marketplace was added, then install failed | **the marketplace** | `claude plugin marketplace remove <name>` (printed in the error) |

In every failing case activation aborts before the ledger is touched, so
`enabledPlugins` is exactly as it was.

## Rollback Behavior

Every journal entry is logged before any state change. On error at any point, all changes are reversed in LIFO order:

- Ledger writes are undone (entries removed)
- Settings file is reverted to its pre-activation state
- CLI operations (marketplace add, install) are **not** automatically undone. The
  `claude` CLI owns that state; strongsuit reports it and prints the undo command
  rather than running it.

## Test Coverage

`test/plugin.test.ts` covers p1–p6: reference parsing, config paths, ledgered
toggle, foreign-entry preservation, round-trip, validation abort, and every
orchestration outcome above via an injected command runner
(`setPluginCommandRunner`) — no test shells out to a real `claude` binary.

Seven mutations were applied and all seven were killed by a named test:
deactivation bypassing the ledger; the toggle proceeding after a failed install;
the undo command dropped from the partial state; an unknown marketplace being
installed into anyway; reference validation disabled; the already-installed
check inverted; and the missing-library-directory fix reverted.
