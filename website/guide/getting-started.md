# Getting started

strongsuit is a CLI (`suit`) that manages your Claude Code customization — skills today at minimum, and everything else a **suit** can carry: commands, agents, rules, CLAUDE.md fragments, MCP servers, plugins, and hooks — as named, switchable bundles.

## Install

::: code-group

```bash [npm (after 1.0.0 ships)]
npm install -g strongsuit
suit --version
```

```bash [from source (works today)]
git clone https://github.com/xooxoxxo/strongsuit
cd strongsuit
npm install && npm run build
npm link            # puts `suit` on your PATH
suit --version
```

:::

Requires Node ≥ 20. Windows works — directory links are created as junctions, no Developer Mode needed.

## 1. Adopt what you already have

```bash
suit init
```

This moves the real skill folders out of `~/.claude/skills` into a **library** (`~/.claude/strongsuit/library`) and replaces each with a symlink. Claude Code cannot tell the difference — it reads the directory and follows links.

Two safety facts before you run it:

- `init` takes a **byte-for-byte snapshot first**. `suit restore` returns `~/.claude/skills` to exactly its pre-init state at any time.
- Anything `init` doesn't recognize (foreign symlinks, stray files) is left alone and reported.

Check the result:

```bash
suit list
```

Every skill shows on/off state and an estimated token cost — that's what its description costs *every session* while active.

## 2. Define your first suit

```bash
suit new coding --skills docx,pptx,xlsx     # scriptable
suit new coding                             # or the interactive picker
```

A suit is stored as a YAML manifest at `~/.claude/strongsuit/suits/coding/suit.yaml`. Skills are just the beginning — see [Suits](/guide/suits) for adding MCP servers, plugins, and hooks to the same manifest.

## 3. Wear it

```bash
suit up coding      # activate: exactly this suit's components, atomically
suit list           # 3/12 active, ~61 of ~340 tokens loaded
suit off            # deactivate everything managed
```

`up` is exclusive and atomic: the active set becomes exactly the suit's contents, and a failure mid-switch rolls back to the previous state. Your library is never touched — deactivated skills still exist, one `suit up` away.

Per project instead of global: almost every command takes `--project` to target `./.claude/skills`.

## 4. Or wear it for one session only

```bash
suit run coding                          # this session wears 'coding'; nothing global changes
suit run coding -- -p "review this PR"   # everything after -- goes to claude
echo coding > .suitrc                    # make it this directory's default
suit run                                 # reads .suitrc
suit resume                              # resume, re-dressed in the suit it was born with
```

See [Per-session suits](/guide/sessions) for how this works and its one honest limitation.

## 5. Install someone else's suit

```bash
suit install owner/repo        # GitHub shorthand, or a URL, or a local dir
```

Nothing lands in your config until you've reviewed and approved each component — see [Installing remote suits](/guide/review).

## Where everything lives

```
~/.claude/
├── skills/                       ← Claude Code reads this (symlinks)
└── strongsuit/
    ├── library/                  ← real components, never deleted
    ├── suits/<name>/suit.yaml    ← your suit manifests
    ├── suit.lock                 ← content pins for reviewed components
    ├── ledger.json               ← ownership record for JSON config writes
    ├── init-backups/             ← the pre-init snapshot
    └── sessions.json             ← session → suit bindings for resume
```

## Next steps

- [Suits](/guide/suits) — manifests and every component type
- [Commands reference](/reference/commands) — the full surface, flags, exit codes
- [Safety model](/guide/safety) — what strongsuit guarantees and how it's enforced
