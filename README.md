<p align="center">
  <img src="https://raw.githubusercontent.com/xooxoxxo/strongsuit/main/assets/logo.png" alt="strongsuit" width="640">
</p>

**Agentic suits for Claude Code — dress your agent for the occasion.**

A **suit** is a named bundle of Claude Code customization: skills, commands, agents, rules, CLAUDE.md fragments, MCP servers, plugins, and hooks. `suit up coding` dresses your agent for the task — atomically, reversibly, without deleting anything. Remote suits go through a **review pipeline** where every component is shown, risk-classed, and individually approved before a byte of it touches your config. And `suit run` puts a suit on **one session only**, leaving your global setup untouched.

## Quick start

```bash
npm install -g strongsuit         # gives you the `suit` command

suit init                         # adopt existing skills into the library (backup taken first)
suit new coding --skills docx,pptx,xlsx
suit up coding                    # activate globally
suit run writing                  # or: wear a suit for ONE session, no global changes
```

## Why

Claude Code loads every installed skill's description into every session, and warns when that inflates token usage — but the only stock remedy is deleting skills and re-downloading them later. And as customization grows past skills into MCP servers, hooks, and plugins, "what is my agent wearing right now" stops having an answer.

strongsuit gives it one. The library holds everything you own, forever. A suit names the subset a task needs. Switching is one command, atomic, and reversible.

## How it works

Claude Code reads *directories* and does not care whether entries are real folders or symlinks:

```
~/.claude/
├── skills/                           ← Claude Code reads THIS
│   ├── docx -> ../strongsuit/library/docx
│   └── pptx -> ../strongsuit/library/pptx
└── strongsuit/                       ← managed by this CLI
    ├── library/                      ← real components live here, always
    ├── suits/<name>/suit.yaml        ← suit manifests
    ├── suit.lock                     ← content pins for reviewed components
    └── ledger.json                   ← ownership record for JSON config writes
```

File-based components (skills, commands, agents, rules) activate via symlinks into the library. JSON-based components (MCP servers, plugins, hooks) go through an **ownership ledger**: strongsuit only ever modifies keys it wrote itself, detects foreign edits by hash and refuses to clobber them, backs up every file before first touch, and journals every activation so a failure rolls the whole switch back. Foreign symlinks and unknown config keys are left alone, always.

## The review pipeline

`suit install owner/repo` fetches a remote suit into **quarantine** — nothing exists outside it until reviewed. Every component is printed in full and risk-classed:

- **prompt-surface** (skills, commands, agents, rules, CLAUDE.md) — text that steers your agent; the prompt-injection surface
- **process/network** (MCP servers, plugins) — things that run processes or talk to the network
- **code-executing** (hooks) — commands that run the moment an event fires

You approve each component individually. Approvals pin content by hash in `suit.lock`: unchanged content activates silently forever after, while content that drifts — upstream update or local tamper, indistinguishable by design — is **blocked with a diff** until a human re-approves it. `suit sync` re-fetches an installed suit and delta-reviews only what changed. Rejecting a new version never un-approves the one you already vetted.

## Per-session suits

```bash
suit run writing -- -p "draft the launch post"   # one session wears 'writing'
echo writing > .suitrc                           # this directory's default suit
suit run                                         # reads .suitrc (nearest ancestor wins)
suit resume                                      # resume, re-dressed in the suit it was born with
```

`suit run` materializes the suit as an ephemeral plugin directory of library symlinks and launches `claude` with it: skills/commands/agents for that session only, and **exactly** the suit's MCP servers via strict config replacement. Zero global mutation; the temp dir is cleaned on exit.

Two honest mechanics, printed at launch rather than papered over:

- **Skills are additive per session** — the session gets the suit *plus* the ambient global/project set. Keep the global set lean if you want sessions close to exclusive.
- **MCP does not survive a bare resume** — skills replay with the conversation prefix, but MCP flags must be re-applied every launch. strongsuit records every launched session's suit, so `suit resume` and `suit run --continue` re-dress conversations correctly. Bare `claude --resume` gets the ambient config back; no hook can prevent that.

## Before and after

```
$ suit list
 ✔ brand-voice-enforcement    [manual-only]  Enforce consistent brand voice...  ~42 tok
 ✔ docx                                       Use this skill for Word docs...    ~18 tok
 ✔ legal-bd-sidekick          [manual-only]  Business development sidekick...   ~31 tok
 ✔ pptx                                       Use this skill for PowerPoint...    ~19 tok
 ✔ xlsx                                       Use this skill for Excel...        ~24 tok

5/5 active, ~154 tokens of descriptions loaded.

$ suit use coding
$ suit list
 ✔ docx                                       Use this skill for Word docs...    ~18 tok
 ✔ pptx                                       Use this skill for PowerPoint...    ~19 tok
 ✔ xlsx                                       Use this skill for Excel...        ~24 tok
   brand-voice-enforcement    [manual-only]  Enforce consistent brand voice...  ~42 tok
   legal-bd-sidekick          [manual-only]  Business development sidekick...   ~31 tok

3/5 active, ~77 tokens of descriptions loaded.
```

Token counts are **estimates** (SKILL.md bytes / 4), useful for spotting bloated skills at a glance, not measurements. The real savings show up in your Claude Code session context.

## Safety

- **Nothing is deleted.** Components live in the library forever. Switching moves symlinks and ledgered JSON entries only.
- **Ownership is absolute.** Symlinks are only removed when their first hop resolves into the library; JSON keys are only touched when the ledger records strongsuit wrote them. Foreign edits are detected by hash and refused, not overwritten.
- **Everything is journaled.** A failed activation rolls back to the previous state; `suit off` deactivates cleanly.
- **`suit init` takes a snapshot first.** `suit restore` returns the active directory to its exact pre-init state.
- **Remote content is quarantined until approved.** Aborting a review leaves your machine byte-identical.

## Commands

```bash
suit init                              # One-time: migrate existing skills into the library (backup first)
suit restore                           # Put the active skills dir back to its pre-init state
suit list                              # Show library with on/off + token estimates
suit sets                              # List every defined set; mark the currently active one
suit tailor <suit> [flags]             # THE edit command: picker, or --skills a,b / --add x --remove y
suit show <suit>                       # Full manifest: active state, dangling components flagged
suit status [--short]                  # Where am I: worn suit, .suitrc here, session, attention items
suit adopt [--to <suit>]               # Library skills installed by other tools (marketplace, npx skills)
suit up <suit>                         # Atomically activate a suit (use <set> is an alias)
suit off                               # Deactivate all managed entries
suit install <source> [--yes]          # Fetch a remote suit (owner/repo[@ref], URL, dir) through review
suit sync <suit> [--yes]               # Re-fetch; drifted components blocked until re-reviewed
suit run [suit] [-- <claude args>]     # Launch ONE session wearing the suit (or the nearest .suitrc one)
suit resume [session-id]               # Resume a conversation re-dressed in the suit it was born with
suit enable <skill>                    # Turn on one skill (outside any set)
suit disable <skill>                   # Turn off one skill
suit import <path> [--as <name>]       # Copy a skill into the library
suit completion <shell>                # bash/zsh completion
```

Most commands accept `--project` to target `./.claude/skills` (repo-local) instead of the global `~/.claude/skills`. Define suits once; activate them globally or per project.

### Scripting and CI

Every command is scriptable without a terminal:

- `suit new <set> --skills a,b,c` defines a set non-interactively (the flag names the full set and overwrites without prompting).
- `suit up/install/sync --yes` accept every reviewed component except code-executing ones (hooks); add `--approve-code-execution` to accept those too. `--yes` never re-approves content that drifted from its approved pin.
- A command that would need a prompt on a non-TTY without these flags fails with guidance instead of hanging.

**Exit codes:** `0` success; `1` anything else — validation failure, refused review, missing suit/skill, or a child `claude` session's own non-zero exit forwarded by `suit run`/`suit resume` (a signal-killed session maps to `128+signal`).

## Session behavior

- **New sessions read the current state of `.claude/skills`.** Activating, deactivating, or even editing a skill's description are all visible to a session started afterwards.
- **Resumed sessions keep the skill context from when they started.** A resumed session replays the conversation prefix — including skills — from session creation time. Live mid-conversation switches are **not** visible to the running session.
- **Practical guidance:** Switch suits, then start a fresh session — or bind sessions explicitly with `suit run`/`suit resume`, which also keeps MCP isolation intact across resumes.

## Limitations

- **Token estimates are approximations.** `bytes / 4` over the whole file. Directionally useful for comparing skills, not a precise measurement. Do not present it as a measurement in marketing.
- **Windows uses junctions.** Directory links are created as junctions (no Developer Mode needed); single-file components use file symlinks, which may require Developer Mode or elevation on some setups.
- **Switching is manual, not automatic.** The tool does not detect what kind of work you are doing and adjust. That is intentional — implicit switching would be unpredictable.
- **Per-session skills are additive**, not exclusive — see [docs/session-isolation.md](docs/session-isolation.md) for the measured details.
- **Bare `claude --resume` bypasses the suit binding.** Skills survive a resume, MCP flags do not. Always resume suit-launched conversations with `suit resume` or `suit run --continue`; no hook can protect a bare resume.

## About

Version 1.0.0. Built with TypeScript, compiles to a standalone CLI. Licensed under MIT.

For details on the design, test coverage, and roadmap, see [PROJECT.md](PROJECT.md). For how per-session isolation was measured (not assumed), see [docs/session-isolation.md](docs/session-isolation.md).
