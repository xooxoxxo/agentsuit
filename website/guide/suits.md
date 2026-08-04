# Suits

A suit is a YAML manifest naming the components a task needs. `suit up <name>` activates exactly those components; `suit off` deactivates them; switching suits is atomic.

## The manifest

`~/.claude/strongsuit/suits/<name>/suit.yaml`:

```yaml
name: react-dev
description: "React work: skills, a docs server, strict rules"

components:
  skills:
    - vercel-react-best-practices
    - imagegen-frontend-web

  commands:        # slash commands
    - npm-scripts

  agents:          # custom subagents
    - design-reviewer

  rules:           # rule files
    - typescript-strict

  claudemd:        # CLAUDE.md fragments appended to the managed block
    - react-conventions

  mcp:             # MCP servers — stdio or http/sse shape
    - name: context7
      command: npx
      args: ["-y", "@upstash/context7-mcp"]
    - name: docs-api
      type: http
      url: https://mcp.example.com

  plugins:         # marketplace plugins
    - superpowers@claude-plugins-official
    - ref: caveman@caveman
      marketplace: JuliusBrussee/caveman

  hooks:           # ⚠ code-executing — see below
    - event: PreToolUse
      matcher: Bash
      command: ~/.claude/guards/audit-bash.sh
      timeout: 30
```

Every field under `components` is optional. Unknown fields are rejected with an error naming the field — a typo never silently does nothing.

## How each type activates

| Components | Mechanism |
|---|---|
| skills, commands, agents, rules | Symlinks from the active directory into the library |
| claudemd | Managed block in `CLAUDE.md`, clearly delimited, only that block ever rewritten |
| mcp, plugins, hooks | JSON config entries through the [ownership ledger](/guide/safety#the-ownership-ledger) — keys strongsuit didn't write are never touched |

## Hooks are special

Hooks run arbitrary commands the moment Claude Code fires the matching event. So:

- Every hook's **full command is printed** before activation — always, even with `--yes`.
- Approval is per-hook, never bulk. `--yes` does **not** approve hooks; that takes the explicit `--approve-code-execution` flag.
- Ownership is per event: if an event already holds hooks strongsuit didn't write, activation into that event is refused by name rather than risk clobbering someone's hook.

Valid events: `PreToolUse`, `PostToolUse`, `Notification`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`, `SessionEnd`. An unknown event is a validation error, not a hook that silently never fires.

## Sets and suits

`suit new`, `suit add`, `suit remove`, and `suit sets` speak in "sets" — a set **is** a suit whose manifest only lists skills. Editing a set edits the manifest; there is no second storage format. A legacy `sets.json` from older versions is converted automatically on first read (the original is kept as `sets.json.migrated`).

## Editing

Manifests are plain files — edit them directly, or:

```bash
suit add coding docx        # add a skill to a suit
suit remove coding docx
suit new coding --skills a,b,c   # replace the skill list wholesale
```

See the [manifest reference](/reference/manifest) for the full schema and validation rules.
