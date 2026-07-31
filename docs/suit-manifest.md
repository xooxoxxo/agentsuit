# Suit Manifest Schema

A suit manifest is a YAML file that defines the contents of an agentic suit — a named, composable collection of skills, commands, agents, and other resources.

## File Location

Each suit lives in its own directory:

```
~/.claude/strongsuit/suits/<suit-name>/suit.yaml
```

The directory name must match the suit's `name` field in the manifest.

## Schema Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier for the suit. Must be a non-empty string. Must match the directory name. |
| `description` | string | No | Human-readable description of the suit's purpose. |
| `components` | object | No | Collection of component arrays/objects (skills, commands, agents, etc.). |

### Components

The `components` field is an object that groups different types of resources. All component fields are optional.

| Field | Type | Description |
|-------|------|-------------|
| `skills` | string[] | Ordered list of skill names from the strongsuit library. |
| `commands` | string[] | List of command references (forward-compat). |
| `agents` | string[] | List of agent references (forward-compat). |
| `rules` | string[] | List of rule references (forward-compat). |
| `claudemd` | string[] | List of CLAUDE.md file paths (forward-compat). |
| `mcp` | object[] | List of MCP server configurations (forward-compat). |
| `plugins` | (string \| object)[] | `"plugin@marketplace"`, or `{ref, marketplace}` to name the marketplace source. |
| `hooks` | object[] | List of hooks: `{event, matcher?, command, timeout?}`. |

Unknown component fields are rejected with a validation error naming the field and the manifest file.

## Complete Example

```yaml
name: react-dev
description: "Full React development environment with TypeScript, testing, and AI design feedback"

components:
  skills:
    - vercel-react-best-practices
    - stitch-design-taste
    - imagegen-frontend-web

  commands:
    - npm-scripts
    - git-workflows

  agents:
    - design-reviewer
    - test-generator

  rules:
    - typescript-strict
    - eslint-defaults

  claudemd:
    - .claude/PROJECT.md

  mcp:
    - server: brave-search
      config: {}
    - server: memory
      config: {}

  plugins:
    - superpowers@claude-plugins-official
    - ref: caveman@caveman
      marketplace: JuliusBrussee/caveman

  hooks:
    - event: PreToolUse
      matcher: Bash
      command: ~/.claude/guards/audit-bash.sh
      timeout: 30
    - event: Stop
      command: notify-send "session finished"
```

## Validation Rules

1. **Name (required)**
   - Must be a non-empty string
   - Must match the suit's directory name
   - If missing or invalid, save/load fails with a validation error

2. **Description (optional)**
   - Must be a string or null/omitted
   - If present but not a string, save fails with a validation error

3. **Components (optional)**
   - Each component field must be an array or object
   - Unknown component field names are rejected with a validation error naming the field
   - If present but not an object, save fails with a validation error

4. **Unknown fields**
   - Any field at root level not in {name, description, components} is rejected
   - This ensures forward compatibility: new fields added in future versions will not silently be ignored

## Current Implementation

**Consumed by CLI:** every component field — `skills`, `commands`, `agents`, `rules`, `claudemd`, `mcp`, `plugins` and `hooks` — is activated by `suit up`.

### Hooks

Hooks are the only component that executes arbitrary code, so they carry rules
the others do not:

- **Every hook command is printed in full before activation.** `--yes` waives
  the prompt, not the disclosure.
- **Approval is never bulk.** Interactively, each hook is confirmed on its own
  and declining one skips only that hook. With no TTY and no `--yes`,
  `suit up` refuses rather than activating anything unseen.
- **`--yes` does not approve a hook.** Hooks are RED in the review engine, so
  `--yes` leaves them out and lists what it skipped; accepting them takes the
  separate `--approve-code-execution` flag. See `docs/review.md`.
- **Ownership is per event, not per hook.** `hooks.<Event>` in settings is an
  array and the ledger hashes whole values, so strongsuit either owns an event
  or leaves it alone. Activating into an event that already holds hooks it did
  not write is refused with a message naming the event — merging would mean
  rewriting an array whose foreign elements it could not later tell from its
  own, and a wrong guess there deletes someone's hook.
- **`disableAllHooks` is respected and surfaced.** Hooks still install, and a
  notice says they will not run until the flag is unset.
- `event` must be one of: `PreToolUse`, `PostToolUse`, `Notification`,
  `UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`,
  `SessionEnd`. An unknown event is a validation error rather than a hook that
  silently never fires.

When these features are implemented, existing manifests will work without modification.

## Legacy Migration

If you have a legacy `sets.json` file (from agentsuit or skillsets) and no `suits/` directory, it will be automatically converted to suit manifests on the first `loadSets()` call:

1. Each set in `sets.json` becomes a suit directory with `name: <setname>`
2. Skills are preserved as `components.skills`
3. The original `sets.json` is backed up as `sets.json.migrated`
4. The conversion is idempotent — calling `loadSets()` multiple times will not re-convert

This allows seamless migration from the old `sets.json` format to the new manifest-based system.

## API

Strongsuit provides a `suits.ts` module with the following functions:

- `listSuits(): string[]` — Returns an array of suit names.
- `loadSuit(name: string): SuitManifest` — Loads a manifest by name. Throws if not found or invalid.
- `saveSuit(suit: SuitManifest): void` — Saves a manifest. Creates the suit directory if needed. Validates before saving.
- `suitExists(name: string): boolean` — Returns true if a suit directory exists.
- `deleteSuit(name: string): void` — Deletes a suit directory. No-op if it doesn't exist.

The `sets.ts` module provides a compatible adapter:

- `loadSets(): Record<string, string[]>` — Derives sets from suit manifests' `components.skills`. Auto-converts legacy `sets.json` on first call.
- `saveSets(sets: Record<string, string[]>): void` — Updates manifests to match the sets record.

## Error Handling

Malformed manifests report actionable errors:

- **Unparseable YAML**: "Failed to parse YAML in `<filepath>`: `<message>`"
- **Invalid field**: "Validation error in `<filepath>`: `<message>`" (e.g., "unknown field 'components.badField'")
- **Missing required field**: "Validation error in `<filepath>`: required field 'name' is missing"
- **Wrong type**: "Validation error in `<filepath>`: field 'name' must be a non-empty string"

All errors name the offending file and field to aid debugging.
