# claude-skillsets

CLI for managing named sets of Claude Code skills (`coding`, `marketing`, `legal`, ...)
so you can switch which skills are active without deleting/re-downloading anything.

## How it works

Claude Code has no built-in per-skill enable/disable — this tool fakes it with symlinks:

- `~/.claude/skillsets/library/` holds the real copy of every skill you own.
- `~/.claude/skills/` (what Claude Code actually reads) contains only **symlinks**
  into the library, one per currently-active skill.
- `~/.claude/skillsets/sets.json` maps a set name to a list of skill names.
- `skillset use <set>` clears all symlinks and relinks exactly that set's skills.
  Nothing is ever deleted from the library — switching sets is instant and reversible.

`--project` targets `./.claude/skills` (repo-local) instead of the global
`~/.claude/skills`, so you can keep a different active set per project if you want.

## Install

```bash
npm install
npm run build
npm link          # gives you the `skillset` command globally
```

## First-time setup

```bash
skillset init
```

Moves whatever skill folders are currently sitting in `~/.claude/skills` into the
library and replaces them with symlinks. Safe to re-run — already-linked skills
are left alone.

## Building sets

```bash
skillset new coding       # interactive checkbox picker over your whole library
skillset add legal legal-bd-sidekick   # or edit a set non-interactively
skillset remove legal pdf
skillset sets             # see every set and which one (if any) is currently active
```

## Switching what's active

```bash
skillset use coding                 # global
skillset use marketing --project    # this repo only
skillset disable pdf                # one-off, outside any set
skillset enable pdf
skillset list                       # everything in the library, on/off + rough token cost
```

## Importing a skill into the library

```bash
skillset import ~/Downloads/some-skill
skillset import ~/Downloads/some-skill --as renamed-skill
```

## Notes

- `skillset list` estimates token cost from `SKILL.md` byte size (`bytes / 4`) —
  it's a rough signal for spotting bloated skills, not an exact count.
- Skills with `disable-model-invocation: true` in their frontmatter are flagged
  `[manual-only]` in `list` — those never auto-trigger regardless of on/off state here.
- `CLAUDE_SKILLSETS_HOME` env var overrides the `~/.claude` root — useful for testing
  against a throwaway directory before pointing it at the real thing.
