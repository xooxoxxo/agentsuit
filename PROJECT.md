# agentsuit — Project Document

> Working reference for the release README, website copy, and codebase review.
> Version: 1.1.0 · Status: functional, tested end to end, not yet published

---

## 1. The problem

Claude Code discovers skills by scanning a skills directory (`~/.claude/skills` globally,
`./.claude/skills` per project). Every skill it finds contributes its YAML frontmatter —
principally the `description:` line — to the model's context on **every single turn**, so that
Claude can decide whether to open the full `SKILL.md`.

That design is sound: the full body is lazily loaded, so an irrelevant skill costs one
description, not a whole file. But the cost is per-skill, per-turn, and unconditional.
Install thirty skills across four unrelated domains and you are paying for legal-drafting and
brand-voice descriptions in the middle of a debugging session, forever.

Claude Code itself surfaces this — it will warn when the installed skill set is inflating
token usage. The only remedies it offers today are blunt:

| Mechanism | Granularity | Dynamic? |
|---|---|---|
| `disable-model-invocation: true` in skill frontmatter | one skill | No — static, edit the file |
| `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` | all Anthropic built-ins | No |
| `enabledPlugins` in `settings.json` | one plugin bundle | No |
| Delete the folder | one skill | Destructive |

There is no native "turn this specific installed skill off for now" flag for skills living
directly in `.claude/skills/` — that has been an open feature request
(anthropics/claude-code#43928). And there is certainly no concept of a *named group* of skills
you switch between as your work changes.

**agentsuit fills that gap.** You define sets — `coding`, `marketing`, `legal`,
`writing` — and switch between them with one command. Nothing is deleted; switching is
instant and reversible.

---

## 2. The core idea

The trick is that Claude Code reads a *directory*. It does not care whether the entries in
that directory are real folders or symlinks. So:

- The **library** holds an entry for every skill you own — a real folder for skills the tool
  copied in, or a symlink for externally-owned skills (plugin dirs, dotfiles repos) that were
  adopted in place so they keep updating at their source.
- The **active directory** (what Claude Code actually reads) holds nothing but symlinks
  pointing into the library, one per currently-active skill.
- A **set** is just a named list of skill names in a JSON file.
- Activating a set means: delete every symlink in the active directory, then create symlinks
  for exactly the skills that set names.

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

Consequences worth stating plainly, because they are the whole value proposition:

- **Deactivating is not deleting.** The library entry is never touched. Switching sets moves
  symlinks only.
- **Links the tool does not own are never removed.** `use` deletes only symlinks whose first hop
  points into the library; anything else is left in place and reported, because the tool has no
  record of where it pointed and could not restore it.
- **Claude Code needs no awareness of this tool.** It sees a normal skills directory with
  fewer entries in it. No plugin, no hook, no config integration required.
- **Switching is O(number of skills) filesystem ops** — effectively instant.
- **Only the `unlink`/`symlink` calls are ever destructive**, and the code refuses to unlink
  anything that is not a symlink it recognises as managed.

---

## 3. Scope model: user vs project

Every command that touches active state takes an optional `--project` flag.

| Scope | Active directory | Flag |
|---|---|---|
| user (default) | `~/.claude/skills` | — |
| project | `<cwd>/.claude/skills` | `--project` |

The library and `sets.json` are **shared** — they always live under `~/.claude/agentsuit/`.
Only the active directory differs. This means you define a set once and can activate it
globally, or per repository, without duplicating anything.

Verified during testing: activating `marketing --project` inside `/tmp/proj` left the global
`~/.claude/skills` untouched. The two scopes are fully independent.

An escape hatch for testing: `AGENTSUIT_HOME` overrides the `~/.claude` root entirely,
so the whole tool can be pointed at a throwaway directory. The entire test suite for this
project ran against `/tmp/fake-claude` and never touched a real installation.

---

## 4. Command reference

```
skillset <command> [args] [--project]
```

### `init`

One-time migration. Walks the active skills directory; for every real directory containing a
`SKILL.md`, copies it into the library, removes the original, and replaces it with a symlink.
Reports the result to the user in five categories:

- **migrated** — Real directories copied into the library and replaced with symlinks.
- **adopted** — Pre-existing symlinks to externally-owned skills, now registered in the library (re-pointed from active dir to library entry).
- **alreadyManaged** — Symlinks already pointing into the library; left untouched.
- **broken** — Symlinks whose target no longer exists.
- **conflicts** — Names already taken in the library by something else; left untouched.

Idempotent — entries that are already managed are skipped on re-run. Directories without a `SKILL.md`
are ignored entirely (not skills). Run this once before anything else.

### `list`

Prints every skill in the library with:

- on/off state (is it symlinked into the current scope's active dir?)
- rough token cost, estimated as `SKILL.md bytes / 4`
- `[external]` flag if the library entry is a symlink to a skill owned elsewhere (plugin dir, dotfiles repo...)
- `[manual-only]` flag if the skill has `disable-model-invocation: true`
- truncated description
- a footer summarising `<active>/<total> active, ~N tokens of descriptions loaded`

The token figure is a **signal, not a measurement** — it is a crude chars-per-token divisor
over the whole file, which overstates cost (Claude only loads the frontmatter until the skill
triggers). Its job is to make bloated skills visible at a glance, and to make the effect of
switching sets legible.

### `sets`

Lists every defined set and its members. Marks a set `(currently active)` when the active
directory contains exactly that set's skills and nothing else — an exact bidirectional match,
so a set is not reported as active if you have since enabled an extra skill on top of it.

### `new <set>`

Interactive checkbox picker (inquirer) over the entire library. Pre-checks current members if
the set already exists, so it doubles as an editor. Prompts for confirmation before editing an
existing set. Writes to `sets.json`. Does **not** activate anything — definition and activation
are deliberately separate.

Requires a TTY.

### `use <set>`

The main event. Clears every symlink from the current scope's active directory, then links
exactly the skills named by the set. Skills named in the set but missing from the library are
reported as skipped rather than failing the whole operation. Foreign (unmanaged) symlinks pointing
outside the library are left untouched and reported with a nudge to run `skillset init`. Shows an
ora spinner and a summary of what ended up active.

### `enable <skill>` / `disable <skill>`

One-off toggles that do not touch any set definition. Use when you need one extra skill for a
single task without polluting a set. `enable` errors (exit 1) on an unknown skill name;
`disable` on an absent skill is a silent no-op, since the desired end state already holds.

### `add <set> <skill>` / `remove <set> <skill>`

Non-interactive set editing — the scriptable counterpart to `new`. `add` validates that the
skill exists in the library first and refuses otherwise. Both are idempotent. Creates the set
if it does not exist.

### `import <path> [--as <name>]`

Copies an external skill folder (must contain a `SKILL.md`) into the library. Refuses to
overwrite an existing library entry. `--as` renames it on the way in.

---

## 5. Codebase walkthrough

TypeScript, ES modules, `NodeNext` resolution, strict mode. Compiles `src/` → `dist/`.
Binary entry: `dist/cli.js`.

```
src/
├── cli.ts               entry point, arg parsing, dispatch
├── paths.ts             all filesystem location logic
├── types.ts             SkillMeta, SetsFile
├── frontmatter.ts       YAML frontmatter extraction
├── fsutil.ts            filesystem utilities — symlink inspection, path resolution
├── library.ts           library enumeration
├── sets.ts              sets.json load/save
├── activate.ts          symlink manipulation — the core
└── commands/
    ├── init.ts
    ├── list.ts
    ├── sets.ts
    ├── new.ts
    ├── use.ts
    ├── toggle.ts        enable + disable
    └── add-remove.ts    add, remove, import
```

### `paths.ts`

Single source of truth for every path the tool touches. Exports `CLAUDE_HOME` (env-overridable),
`activeSkillsDir(scope)`, `SKILLSETS_DIR`, `LIBRARY_DIR`, `SETS_FILE`.

Nothing else in the codebase constructs a path to `~/.claude` independently. That containment
is what makes the `CLAUDE_SKILLSETS_HOME` test override total rather than partial — a property
worth preserving in review.

### `frontmatter.ts`

Regex-extracts the leading `---` fenced block and parses it with `yaml`. Returns `{}` on a
missing or malformed block rather than throwing — a single broken skill should never break
`list` for every other skill.

### `fsutil.ts`

Filesystem utilities for symlink-aware path manipulation, imported by `activate.ts` and `library.ts`:

- `resolveSafe(p)` — `fs.realpathSync` that returns `null` instead of throwing on missing/broken paths.
- `lstatOrNull(p)` — `fs.lstatSync` (never follows symlinks) that returns `null` instead of throwing.
- `isInside(child, parent)` — True when `child` sits under `parent` (both should be realpath-resolved).
- `immediateTarget(linkPath)` — Resolves only the **first hop** of a symlink (with its parent directory realpath'd). Critical for distinguishing managed links from foreign ones: active links form chains like `active/x -> library/x -> /elsewhere/x`, and only the first hop tells us ownership.

### `library.ts` and `types.ts`

`listLibrarySkills()` enumerates library subdirectories, requires a `SKILL.md` to consider one
a skill, reads frontmatter, computes byte size and estimated tokens, and returns results sorted
by name. Falls back to the directory name when frontmatter has no `name:`, and to a placeholder
when it has no `description:`.

Returns an array of `SkillMeta` objects with fields:

- `name`, `description`, `path` — the skill identity and library location.
- `realPath` — fully resolved directory the skill actually lives in, or `null` if the link is broken.
- `external` — true when the library entry is a symlink to a skill owned elsewhere.
- `broken` — true when the library entry is a symlink whose target no longer exists.
- `bytes`, `estTokens`, `disableModelInvocation` — size and configuration.

`CHARS_PER_TOKEN = 4` lives here — the one tunable constant.

### `activate.ts` — the core, and the part to review hardest

Everything that mutates the filesystem in a destructive direction lives in this file.

- `lstatOrNull` — `lstat` not `stat`, deliberately. `stat` follows symlinks; the whole safety
  model depends on distinguishing a symlink from the real directory it points at.
- `getActiveSkillNames(scope)` — reads the active dir, returns names of symlinks and
  directories. Returns an empty set rather than throwing when the directory does not exist.
- `enableSkill(name, scope)` — no-ops when a symlink already exists; **throws when the path
  exists as a real directory**, directing the user to run `init`. This is the guard that stops
  the tool from shadowing an unmanaged skill.
- `disableSkill(name, scope)` — silent no-op when absent; **throws rather than deleting when
  the entry is a real directory**. The tool never removes a real skill folder from the active
  dir except through `init`, which copies to the library first.
- `activateOnly(names, scope)` — the set switcher. Its clearing loop filters on both `isSymbolicLink()` and first-hop ownership via `isManagedLink()` and `immediateTarget()` (which uses `readlink`, not `realpath`, to check if the link points into the library). Symlinks pointing outside the library are deliberately left in place and reported in the `foreign` field so the caller can suggest `skillset init`. Any real directory sitting in the active dir (an unmigrated skill) also survives untouched. Returns `{ linked, skipped, foreign }`.
- `initMigrate(scope, libraryDir)` — Three behaviors: (1) Real skill directories are copied into the library, the original is removed, and replaced with a symlink. (2) Pre-existing symlinks pointing *outside* the library are adopted — the library gets a symlink to the same external target, and the active link is re-pointed at the library entry, so the external skill keeps updating at its source. (3) Symlinks already pointing into the library are left alone. Skips directories without a `SKILL.md`. Will not overwrite an existing library entry.

**Review checklist for this file:** every `unlinkSync` and `rmSync` call site should be
reachable only after an `isSymbolicLink()` check, or (in `initMigrate`) only after a
successful `cpSync` into the library. That invariant is the tool's entire safety story.

### `sets.ts`

Trivial JSON load/save with `mkdir -p` and a corruption-tolerant read (returns `{}` on parse
failure). Pretty-printed with a trailing newline so `sets.json` diffs cleanly in git — a
deliberate choice, since users are likely to version-control it.

### `cli.ts`

`meow` for parsing and help text. `requireArg` is a TypeScript assertion function
(`asserts value is string`), which gives the dispatch switch proper narrowing without casts
while producing a clean error message and exit 1 on missing arguments.

Dispatch is a flat switch; unknown commands fall through to `showHelp(0)`.

---

## 6. Data formats

### `sets.json`

```json
{
  "coding": ["docx", "pptx", "xlsx"],
  "marketing": ["brand-voice-enforcement", "pptx"],
  "legal": ["legal-bd-sidekick", "brand-voice-enforcement"]
}
```

Flat `Record<string, string[]>`. Skills may appear in multiple sets. Order is preserved but
carries no meaning. Hand-editable, git-friendly.

### Skill frontmatter consumed

```yaml
---
name: docx
description: Use this skill whenever the user wants to create or edit Word documents...
disable-model-invocation: false
---
```

Only `name`, `description`, and `disable-model-invocation` are read. Everything else is passed
through untouched — the tool never rewrites a `SKILL.md`.

---

## 7. Testing performed

Executed end to end against a synthetic `CLAUDE_SKILLSETS_HOME=/tmp/fake-claude` populated with
five dummy skills:

| Case | Result |
|---|---|
| `init` migration — real dirs → library + symlinks | 5/5 migrated, verified via `ls -la` |
| `init` re-run | reported "already managed", no changes |
| `list` — on/off state and token totals | correct, 5/5 → ~154 tok |
| `add` × 7 building three sets | `sets.json` written as expected |
| `sets` before switching | all three listed, none marked active |
| `use coding` | active dir reduced to exactly docx/pptx/xlsx |
| `list` after switch | 3/5 active, ~77 tok |
| `sets` after switch | `coding (currently active)` correctly detected |
| `disable xlsx` / `enable legal-bd-sidekick` | single-skill toggles applied |
| `use marketing --project` from `/tmp/proj` | project dir populated, user scope untouched |
| `enable does-not-exist` | error message, exit 1 |
| `use nonexistent-set` | error message, no filesystem change |
| module load of all command modules | clean |

Not covered by automated tests: the interactive `new` picker (requires a TTY — verified only
that the module loads and its dependency graph resolves). **Adding a real test suite is the
top pre-release task.**

---

## 8. Known build gotcha

A `TS2591 Cannot find name 'process' / 'node:fs'` cascade appears when `@types/node` is not
visible to `tsc` — typically because the install omitted devDependencies (`NODE_ENV=production`,
an `.npmrc` with `omit=dev`, or a production CI install). Reproduced and confirmed as the cause.

Mitigated by pinning `"types": ["node"]` in `tsconfig.json` rather than relying on automatic
`@types` discovery. If it recurs:

```bash
npm ls @types/node
npm install --include=dev
npm run build
```

Consider, before release: moving `@types/node` to `dependencies`, or shipping prebuilt `dist/`
to the npm registry so consumers never invoke `tsc` at all.

---

## 9. Limitations and honest caveats

- **Symlinks on Windows.** `fs.symlinkSync` with the `"dir"` type requires Developer Mode or
  elevation on Windows. Untested there. A junction-based or copy-based fallback is the likely
  fix; this must be resolved or clearly documented before a public release.
- **Not automatic.** This is manual, explicit switching. It does not detect what kind of work
  you are doing and adjust. That was a deliberate choice — implicit skill switching would be
  unpredictable — but it is worth naming, because it is the first thing people will ask.
- **Token estimates are approximations.** `bytes / 4` over the whole file. Directionally useful,
  not accurate. Do not present it as a measurement in marketing copy.
- **`init` is one-directional.** There is no `unmigrate` command that restores real directories
  to the active dir and tears down the library.
- **No set composition.** Sets cannot include other sets, and there is no "activate the union of
  coding + writing" operation.

### Running Claude Code sessions

Measured on 2026-07-29 with a codeword-swap experiment: a marker skill whose description carried a
distinctive codeword was activated, edited, and deactivated between headless sessions
(`CLAUDE_SKILLSETS_HOME` override, project scope, synthetic environment — the probing session had
never seen any codeword in conversation, so answers could only come from live skill context).

- **New sessions read the current state of `.claude/skills`.** Activation, deactivation, and even
  edits to a skill's description are all visible to a session started afterwards (fresh sessions
  returned the post-edit codeword and reported the skill gone after deactivation).
- **Resumed sessions keep the skill context from when the session was created.** A session resumed
  with `claude --resume <session_id>` returned the original codeword after the description had
  changed on disk, and still listed the skill after it had been deactivated. The conversation
  prefix — including the skills loaded at session start — is fixed at creation and replayed on
  resume.
- **Live mid-conversation switches** (same interactive process, no resume) were not directly
  measurable headlessly, but the resume result implies the same snapshot behavior: skill context
  is assembled once at session start. Assume a running session will NOT see a set switch.

Practical guidance: switch sets, then start a fresh session. Nothing to do beyond that — new
sessions pick up the change instantly; existing and resumed conversations intentionally keep the
context they started with.

Methodology note: probes must ask the model to quote the skill's description verbatim (e.g. a
codeword) rather than asking whether a skill "is available" — presence questions produced false
negatives with smaller models during testing.

---

## 10. Roadmap

**Before release**

1. Real test suite (vitest) around `activate.ts`, exercised against a temp `CLAUDE_SKILLSETS_HOME`.
2. Windows symlink handling — junction fallback or a documented, graceful failure.
3. Publish to npm with a prebuilt `dist/`; verify `npx skillset` works cold.
4. `skillset status` — a compact one-line "active set + count + est. tokens" for shell prompts.

**Plausible next**

- `skillset use <set> --add` to layer a set on top of what is already active instead of replacing.
- Set composition / inheritance.
- Auto-switching by directory, via a `.skillsetrc` file the CLI reads from the cwd.
- A `doctor` command: find orphaned symlinks, skills missing frontmatter, duplicate names.
- Import directly from a git URL.

---

## 11. Positioning notes for the website

The one-line pitch: **named skill sets for Claude Code — switch context, not config.**

The story to lead with is concrete and personal, because it is the story every user will
recognise: Claude Code warned that the installed skills were inflating token usage, and the
only available response was to turn them off one at a time and then turn them back on later.
That is a workflow problem, not a capability problem.

Three things worth showing above the fold:

1. The `~/.claude` tree diagram from §2 — the mechanism is simple enough that showing it builds
   trust rather than confusion.
2. A `list` output before/after a `use` command, with the token footer visible. The drop from
   `5/5 active, ~154 tokens` to `3/5 active, ~77 tokens` tells the whole story without prose.
3. The safety line: nothing is ever deleted; the library keeps every skill, always.

What **not** to overclaim: this is not automatic detection, and the token numbers are estimates.
Both are easy to imply accidentally and both would erode trust on first contact with the tool.
