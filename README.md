# agentsuit

**Agentic suits for Claude Code — dress your agent for the occasion.**

Claude Code warns when installed skills inflate token usage, and the only remedy is deleting and re-downloading them later. `agentsuit` lets you define named sets — `coding`, `marketing`, `legal`, `writing` — and switch between them instantly. Nothing is deleted; switching moves only symlinks and is instantly reversible.

## Quick start

For now, clone and link locally:
```bash
git clone https://github.com/oytuneyucel/agentsuit
cd agentsuit && npm install && npm run build
npm link          # gives you the `suit` command
```

Then initialize your library:
```bash
suit init                # Move existing skills into the library, replace with symlinks
suit new coding          # Define a set interactively
suit use coding          # Activate it
```

**Publishing soon** — `npm install -g agentsuit` will work once published.

## How it works

The trick: Claude Code reads a *directory* and does not care if entries are real folders or symlinks.

```
~/.claude/
├── skills/                          ← Claude Code reads THIS
│   ├── docx -> ../agentsuit/library/docx
│   ├── pptx -> ../agentsuit/library/pptx
│   └── xlsx -> ../agentsuit/library/xlsx
└── agentsuit/                       ← managed by this CLI
    ├── library/                     ← real skill folders live here, always
    │   ├── brand-voice-enforcement/
    │   │   └── SKILL.md
    │   ├── docx/
    │   ├── legal-bd-sidekick/
    │   ├── pptx/
    │   └── xlsx/
    └── sets.json                    ← { "coding": ["docx","pptx","xlsx"], ... }
```

The **library** holds every skill you own. The **active directory** (what Claude Code actually reads) holds only symlinks — one per currently-active skill. A **set** is a named list in `sets.json`. Activating a set means clearing the active directory and relinking exactly those skills. **Nothing is ever deleted from the library.**

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

- **Nothing is deleted.** Skills live in the library forever. Switching sets moves symlinks only.
- **The library is never touched during a set switch.** Activating a set changes only the active directory (`~/.claude/skills` globally or `./.claude/skills` per project).
- **Foreign symlinks are left alone.** The tool only removes symlinks it recognises as managed (first hop into the library). Anything else is reported with a nudge to run `suit init`.
- **The tool is fully reversible.** An active set can be disabled, re-enabled, or mixed with one-off toggles without side effects.

## Commands

```bash
suit init                              # One-time: migrate existing skills into the library
suit list                              # Show library with on/off + token estimates
suit sets                              # List every defined set; mark the currently active one
suit new <set>                         # Interactive picker to define or edit a set
suit use <set>                         # Activate a set
suit enable <skill>                    # Turn on one skill (outside any set)
suit disable <skill>                   # Turn off one skill
suit add <set> <skill>                 # Add a skill to a set (non-interactive)
suit remove <set> <skill>              # Remove a skill from a set
suit import <path> [--as <name>]       # Copy a skill into the library
```

All commands except `new` and `import` accept an optional `--project` flag to target `./.claude/skills` (repo-local) instead of the global `~/.claude/skills`. Define sets once; activate them globally or per project.

## Session behavior

- **New sessions read the current state of `.claude/skills`.** Activating, deactivating, or even editing a skill's description are all visible to a session started afterwards.
- **Resumed sessions keep the skill context from when they started.** A resumed session replays the conversation prefix — including skills — from session creation time. Live mid-conversation switches are **not** visible to the running session.
- **Practical guidance:** Switch sets, then start a fresh session. New sessions pick up changes instantly; existing and resumed conversations keep the context they started with.

## Where this is going

Suits will grow to bundle not just skills, but MCP servers, plugins, hooks, commands, and agents alongside a mandatory review pipeline for remote installs. Each suit remains a named, atomically-switchable set — one command to dress your agent for the task at hand. For now: skills only, manual not automatic.

## Limitations

- **Token estimates are approximations.** `bytes / 4` over the whole file. Directionally useful for comparing skills, not a precise measurement. Do not present it as a measurement in marketing.
- **Windows symlink support is incomplete.** `fs.symlinkSync` with the `"dir"` type requires Developer Mode or elevation on Windows. A fallback or workaround is planned before a public release.
- **Switching is manual, not automatic.** The tool does not detect what kind of work you are doing and adjust. That is intentional — implicit switching would be unpredictable.
- **`init` is one-directional.** There is no `unmigrate` command that restores real directories to the active folder.

## About

Version 1.1.0. Built with TypeScript, compiles to a standalone CLI. Licensed under MIT.

For details on the design, test coverage, and roadmap, see [PROJECT.md](PROJECT.md).
