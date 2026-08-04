# Safety model

strongsuit manages files inside `~/.claude` — the config that steers your agent. The safety model is built on one idea: **strongsuit only ever touches what it owns, and can prove what it owns.**

## Two backends, one ownership rule

**File components** (skills, commands, agents, rules) activate as symlinks. A link is "ours" only if its first hop resolves into the library — anything else is foreign and is never removed, only reported. Your hand-made symlinks survive every suit switch.

**JSON components** (MCP servers, plugins, hooks) go through an **ownership ledger**.

## The ownership ledger

`~/.claude/strongsuit/ledger.json` records every JSON key strongsuit writes, with a hash of the value it wrote. On every subsequent touch:

- **Keys absent from the ledger are never modified or deleted.** Your hand-configured MCP servers are invisible to `suit off`.
- **Foreign edits are detected.** If a value strongsuit wrote was changed by something else, the hash mismatch is caught and the operation refuses rather than clobbering.
- **Every file is backed up before first touch**, and writes are atomic (temp file + rename) — a crash never leaves a half-written config.
- **Hook ownership is per event.** Claude's `hooks.<Event>` is an array; strongsuit either owns the whole event or leaves it alone. It will not merge into an event holding hooks it didn't write — a wrong guess there deletes someone's hook.

## Journaled activation

`suit up` journals every step. If anything fails mid-switch — a link that can't be created, a config write refused — the journal rolls back in reverse order and you're left in the previous state, not halfway.

## The init snapshot

`suit init` is the one command that restructures your existing setup, so it snapshots first:

```bash
suit init      # snapshot → migrate skills into the library → relink
suit restore   # put ~/.claude/skills back exactly as it was pre-init
```

`restore` only replaces managed links and missing entries; anything you changed since init is refused rather than overwritten, and reported.

## Quarantine for remote content

Anything fetched by `suit install` exists only under `~/.claude/strongsuit/quarantine/` until reviewed and approved. Aborting leaves a byte-identical machine. See [Installing remote suits](/guide/review).

## How the guarantees are enforced

Green tests are not treated as evidence on their own. Every safety guard in this list has a **mutation test**: the guard was deliberately removed or inverted, and the suite was verified to go red — the ledger ignoring ownership, rollback journalling the wrong target, `--yes` approving code execution, drift activating anyway, cleanup deleting arbitrary paths, the sweeper touching live processes' dirs. A guard whose removal no test notices doesn't count as a guarantee.

Additionally, the test suite enforces containment guards: every path the tool may touch is enumerated and asserted to live inside `~/.claude` (or the OS temp dir for ephemeral session materialization), and the tests themselves run against a sandboxed home — they cannot reach your real config.
