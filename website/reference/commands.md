# Commands

```
suit <command> [args] [flags]
```

Global flags: `--project` targets `./.claude/*` (repo-local) instead of `~/.claude/*`. Applies to most commands.

**Exit codes:** `0` success; `1` anything else — validation failure, refused review, missing suit/skill. `suit run`/`suit resume` forward the child session's exit code; a signal-killed session maps to `128+signal`.

## Setup

### `suit init`
Adopts real skill folders from the active directory into the library and replaces them with symlinks. Takes a byte-for-byte snapshot first. Foreign entries are left alone and reported. Idempotent.

### `suit restore`
Returns the active skills directory to its exact pre-init state from the snapshot. Only replaces managed links or missing entries; entries you changed since init are refused and reported, never overwritten.

### `suit migrate`
Relocates a legacy `~/.claude/skillsets` or `~/.claude/agentsuit` root to `~/.claude/strongsuit`. One-time, for upgrades from old versions.

## Inspecting

### `suit list`
Every library skill: on/off state, estimated token cost (`bytes/4` — an estimate, not a measurement), `[external]`/`[manual-only]`/broken-link badges, and an active-total footer. On an empty library, prints the getting-started path instead.

### `suit sets`
All defined sets (suits), the currently active one marked.

## Defining suits

### `suit new <name> [--skills a,b,c]`
Interactive picker, or `--skills` for scripts — the flag names the full list, validates every name against the library, and overwrites without prompting (the flag is the consent). Without a TTY and without `--skills`, fails with guidance instead of hanging.

### `suit add <set> <skill>` / `suit remove <set> <skill>`
Edit a suit's skill list non-interactively.

### `suit import <path> [--as <name>]`
Copies an external skill folder into the library.

## Activating

### `suit up <suit>` (alias: `use`)
Atomic, exclusive activation of every component type in the manifest. Pinned-and-unchanged components activate silently; drifted ones are blocked with a diff. Failure rolls back to the previous state. Unknown suit → the available suits are listed.

Flags: `--yes` (approve everything except code-executing components; never re-approves drift), `--approve-code-execution` (approve hooks too).

### `suit off`
Deactivates all managed entries — managed symlinks and ledger-owned JSON keys only. Foreign content untouched.

### `suit enable <skill>` / `suit disable <skill>`
Toggle one skill without changing any suit definition.

## Remote suits

### `suit install <source> [--yes] [--approve-code-execution]`
Sources: `owner/repo`, `owner/repo@ref`, a git URL, or a local directory. Fetches into quarantine, reviews every component individually (see [the review guide](/guide/review)), copies approved content into the library, registers the suit, pins approvals in the lockfile. Conflicting names (same name, different content already in your library) are excluded — local wins. Zero trace on abort.

### `suit sync <suit> [--yes]`
Re-fetches the recorded source and delta-reviews: unchanged silent, drift shown with a diff and re-decided. Rejecting a new version keeps the old approved one.

## Per-session

### `suit run [suit] [-- <claude args>]`
Launches one `claude` session wearing the suit; no argument reads the nearest `.suitrc`. Everything after `--` is passed to `claude` verbatim. Records the session → suit binding. Prints the additive-skills baseline and anything non-deliverable per session. `--continue` resumes the directory's latest suit-launched session.

### `suit resume [session-id]`
Re-materializes the suit the conversation was **born** with and re-applies its MCP flags (which a bare `claude --resume` silently loses). No id → the latest suit-launched session in this directory. Sessions launched with bare `claude` are not tracked and are refused by id.

## Misc

### `suit completion <shell>`
Prints bash or zsh completion script.
