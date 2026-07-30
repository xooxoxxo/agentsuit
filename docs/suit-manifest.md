# Suit Manifest Schema

A suit manifest is a YAML file that defines the contents of an agentic suit — a named, composable collection of skills, commands, agents, and other resources.

## File Location

Each suit lives in its own directory:

```
~/.claude/agentsuit/suits/<suit-name>/suit.yaml
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
| `skills` | string[] | Ordered list of skill names from the agentsuit library. |
| `commands` | string[] | List of command references (forward-compat). |
| `agents` | string[] | List of agent references (forward-compat). |
| `rules` | string[] | List of rule references (forward-compat). |
| `claudemd` | string[] | List of CLAUDE.md file paths (forward-compat). |
| `mcp` | object[] | List of MCP server configurations (forward-compat). |
| `plugins` | string[] | List of plugin references (forward-compat). |
| `hooks` | object[] | List of hook configurations (forward-compat). |

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
    - vscode-integration

  hooks:
    - event: activate
      script: setup.sh
    - event: deactivate
      script: teardown.sh
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

**Consumed by CLI:** Only the `components.skills` field is currently consumed by agentsuit. It maps skills to the library for activation.

**Forward-compatible:** The `components.commands`, `components.agents`, `components.rules`, `components.claudemd`, `components.mcp`, `components.plugins`, and `components.hooks` fields are validated but not yet activated. They are reserved for future expansion.

When these features are implemented, existing manifests will work without modification.

## Legacy Migration

If you have a legacy `~/.claude/agentsuit/sets.json` file and no `suits/` directory, it will be automatically converted to suit manifests on the first `loadSets()` call:

1. Each set in `sets.json` becomes a suit directory with `name: <setname>`
2. Skills are preserved as `components.skills`
3. The original `sets.json` is backed up as `sets.json.migrated`
4. The conversion is idempotent — calling `loadSets()` multiple times will not re-convert

This allows seamless migration from the old `sets.json` format to the new manifest-based system.

## API

Agentsuit provides a `suits.ts` module with the following functions:

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
