# strongsuit 1.0.0

First public release. `npm install -g strongsuit` gives you `suit`.

## What a suit is

A named bundle of Claude Code customization: skills, commands, agents, rules, CLAUDE.md fragments, MCP servers, plugins, and hooks. One command dresses your agent for the task; switching is atomic and reversible, and your library is never deleted.

## Highlights

- **`suit up <name>`** — atomic, exclusive activation across every component type, with rollback on failure. File surfaces switch via symlinks; JSON surfaces (MCP, plugins, hooks) go through an ownership ledger that never touches keys it does not own, detects foreign edits by hash, and backs up before first touch.
- **Review pipeline for remote suits** — `suit install owner/repo` fetches into quarantine; nothing lands outside it until each component is reviewed and approved. Components are risk-classed: prompt-surface (skills, commands, agents, rules, CLAUDE.md), process/network (MCP, plugins), and code-executing (hooks).
- **Lockfile pinning** — approval attaches to content, not names. Approved components are pinned by hash in `suit.lock`; unchanged content activates silently, changed content is blocked with a diff until re-reviewed. `suit sync` re-fetches and delta-reviews only what drifted.
- **Per-session suits** — `suit run <name>` launches one Claude session wearing a suit with zero global mutation: skills via an ephemeral plugin dir, MCP via strict config replacement. `.suitrc` names a directory's suit; the session map re-dresses resumed conversations in the suit they were born with (`suit resume`).
- **Init backup** — `suit init` snapshots the active directory first; `suit restore` returns it to the pre-init state.
- **Scriptable** — `suit new <set> --skills a,b,c`, `--yes`, documented exit codes; non-TTY paths fail with guidance instead of hanging.

## ⚠️ Review semantics — read before scripting

Review guards the REMOTE boundary. Content you put on your own machine (init-adopted skills, imports, hand-written manifests) activates without prompts — `suit up` of a local suit asks nothing, and local hooks activate with their full command printed. Content fetched by `suit install`/`suit sync` is always reviewed: `--yes` approves everything there **except code-executing components** (hooks) — those take the separate, explicit `--approve-code-execution` flag — and `--yes` never re-approves content that drifted from its approved pin. Drift always needs a human.

## Honest limits

- Plugin-delivered skills are **additive** per session — `suit run` layers on top of the ambient global/project set; it prints what the baseline contributes.
- Bare `claude --resume` bypasses the wrapper: skills survive, MCP isolation does not. Resume suit-launched conversations with `suit resume` or `suit run --continue`.
- Token figures are estimates (`bytes / 4`), for comparing skills — not measurements.
