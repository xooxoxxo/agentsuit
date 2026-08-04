# Suit manifest

One YAML file per suit: `~/.claude/strongsuit/suits/<name>/suit.yaml`. The directory name must match the `name` field.

## Top level

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Non-empty; must match the directory name |
| `description` | string | no | Human-readable purpose |
| `components` | object | no | The bundle itself |

Unknown fields — at the root or under `components` — are **rejected with an error naming the field**. A typo never silently does nothing, and future-version fields never get ignored by an older CLI.

## Components

| Field | Type | Activated as |
|---|---|---|
| `skills` | string[] | Symlinks into the library |
| `commands` | string[] | Symlinks into the library |
| `agents` | string[] | Symlinks into the library |
| `rules` | string[] | Symlinks into the library |
| `claudemd` | string[] | Managed block in CLAUDE.md |
| `mcp` | object[] | Ledgered entries in the MCP config |
| `plugins` | (string \| object)[] | Marketplace install + ledgered enable |
| `hooks` | object[] | Ledgered entries in settings — code-executing, see below |

### `mcp` — two shapes

```yaml
mcp:
  # stdio server
  - name: context7
    command: npx
    args: ["-y", "@upstash/context7-mcp"]   # optional
    env: { API_KEY: "..." }                  # optional

  # http / sse server
  - name: docs-api
    type: http        # or: sse
    url: https://mcp.example.com
    headers: { Authorization: "Bearer ..." } # optional
```

`name` plus either `command` (stdio) or `type`+`url` (http/sse). Mixing the shapes in one entry is a validation error.

### `plugins` — two shapes

```yaml
plugins:
  - superpowers@claude-plugins-official      # ref shorthand
  - ref: caveman@caveman                     # explicit marketplace source
    marketplace: JuliusBrussee/caveman
```

### `hooks`

```yaml
hooks:
  - event: PreToolUse        # required, from the list below
    matcher: Bash            # optional
    command: ~/.claude/guards/audit-bash.sh   # required
    timeout: 30              # optional, seconds, > 0
```

Valid events: `PreToolUse` · `PostToolUse` · `Notification` · `UserPromptSubmit` · `Stop` · `SubagentStop` · `PreCompact` · `SessionStart` · `SessionEnd`. Anything else is a validation error.

Hooks execute code, so they carry rules other components don't: full command always printed before activation, per-hook approval, never covered by `--yes` (only `--approve-code-execution`), per-event ownership (activation into an event holding foreign hooks is refused by name). Details: [Suits › Hooks](/guide/suits#hooks-are-special).

## Errors

Every validation failure names the file and the field:

```
Validation error in …/suit.yaml: unknown field 'components.skils'
  (allowed: skills, commands, agents, rules, claudemd, mcp, plugins, hooks)
Invalid MCP server 'docs-api': field 'url' is required for type 'http'
Invalid hook: unknown event 'PreTool'. Known events: PreToolUse, …
```

## Legacy `sets.json`

A `sets.json` from older versions converts to suit manifests automatically on first read — each set becomes a suit with `components.skills`, the original is kept as `sets.json.migrated`, and the conversion is idempotent.
