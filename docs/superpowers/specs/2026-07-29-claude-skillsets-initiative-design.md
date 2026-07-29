# claude-skillsets — Release + Auto-Select Initiative Design

Date: 2026-07-29 · Status: approved by user (interactive brainstorming session)
Sources: competitive research (July 2026), prior build-session transcript (v1.0.0 → v1.1.0), PROJECT.md, codebase verification workflow (file:line evidence).

## 1. Initiative goal

Ship claude-skillsets publicly (npm + README + GitHub), then differentiate with automatic
set suggestion. Cross-agent portability is explicitly out of this initiative.

Positioning (from research): named skill sets with **mutually-exclusive switch semantics**
— the gap in skill-toggle's additive "Collections" — plus **suggest-based auto-selection**,
the layer no tool currently serves.

## 2. Verified current state (evidence-based)

- Version 1.1.0 (`package.json:3`). 15 TS source files, meow + switch dispatch
  (`src/cli.ts:61-104`), commands in `src/commands/*.ts`.
- Safety model verified TRUE on all six claims:
  - external-symlink adoption into library (`src/activate.ts:167-196`);
  - `use` deletes only links whose first hop points into the library, foreign links
    reported (`src/activate.ts:103-109`);
  - ownership check reads immediate link target via `readlinkSync`, not realpath
    (`src/fsutil.ts:39-49`);
  - enable/disable throw rather than touch real directories (`src/activate.ts:57-62,74-79`);
  - `list` tags `[external]` (`src/commands/list.ts:24`);
  - every `unlinkSync`/`rmSync` guarded by symlink/ownership check or preceded by
    `cpSync` (`src/activate.ts:79,107,193,208-209`).
- **Zero tests.** **Not a git repository** (until this initiative's first commit).
- PROJECT.md has 9 documented drifts vs code (stale 1.0.0 header, missing `fsutil.ts`
  in walkthrough, undocumented adoption/InitResult/foreign reporting, undocumented
  SkillMeta fields `realPath`/`external`/`broken`).

## 3. Feature tiers (walked through with user, one at a time)

| Tier | Feature |
|---|---|
| 🟢 MUST | git init + public GitHub repo |
| 🟢 MUST | PROJECT.md drift fixes (all 9) before README seeding |
| 🟢 MUST | Session-pickup characterization experiment |
| 🟢 MUST | Vitest suite over activate.ts safety invariants |
| 🟢 MUST | Windows junction fallback |
| 🟢 MUST | npm publish with prebuilt dist, cold-npx verified |
| 🟢 MUST | README seeded from refreshed PROJECT.md |
| 🟢 MUST | `suggest` + confirm (auto-select core) |
| 🟡 NICE | `status` command |
| 🟡 NICE | `doctor` command |
| 🟡 NICE | `use <set> --add` layering |
| 🟡 NICE | `.skillsetrc` deterministic per-directory switch |
| 🟡 NICE | `unmigrate` command |
| 🟡 NICE | Website (§11 positioning notes as copy source) |
| 🔵 FUTURE | Set composition/inheritance |
| 🔵 FUTURE | Import from git URL |
| 🔵 FUTURE | Cross-agent portability (bridle/skillkit contest this) |

## 4. Locked architecture decisions

1. **Symlink mechanism untouched.** The v1.1.0 library + first-hop-ownership model is
   the product; no milestone alters its semantics.
2. **Suggest never mutates without explicit yes.** Ranked output + reasoning; activation
   only on interactive confirm or `--yes`. This permanently resolves the PROJECT.md §9
   ("implicit switching unpredictable") vs research ("auto-select is the moat") tension.
3. **Suggest corpus = aggregated member-skill descriptions.** BM25 over each set's
   member skills' frontmatter `description:` text, derived at runtime. No sets.json
   schema change, no user setup. Signals: cwd file extensions, package manifest,
   optional free-text prompt argument. Deterministic, offline, no embeddings, no network.
4. **Windows = directory junctions.** `symlinkSync(target, path, 'junction')` on win32
   (no elevation needed), `'dir'` elsewhere. One branch at link-creation sites. No
   copy-based fallback.
5. **npm ships prebuilt `dist/`.** `files: ["dist"]`, `prepublishOnly` build. Consumers
   never run `tsc`; kills the TS2591 `@types/node` failure class.
6. **sets.json stays flat `Record<string, string[]>`** for this initiative.

## 5. Milestones (dependency-ordered)

**M0 Foundation** (de-risk first — no publish before this is green)
1. git init, initial commit, public GitHub repo.
2. PROJECT.md drift fixes (9 items from verification).
3. Session-pickup experiment: does a running Claude Code session see set switches?
   Documented answer feeds README + suggest UX wording.
4. Vitest suite: temp `CLAUDE_SKILLSETS_HOME` fixtures; invariants — never delete
   foreign link, never delete real dir, adoption chain resolves, idempotent init,
   exclusive `use`, enable/disable guards. CI: GitHub Actions macOS + Linux.

**M1 Release** (blocked by M0)
1. Junction branch + win32 smoke test (Windows CI job, junction creation only).
2. Publish config: `files`, `prepublishOnly`, metadata, license.
3. README from refreshed PROJECT.md — lead: token-warning story, tree diagram,
   before/after `list` output, safety line. No overclaims (§11 guidance).
4. npm publish + cold `npx skillset` verification.

**M2 Auto-select** (blocked by M1)
1. Corpus builder: aggregate member-skill descriptions per set.
2. BM25 scoring + cwd/manifest signal extraction.
3. `suggest` command: ranked sets, matched-term reasoning, confirm/`--yes` flow.
4. Docs + README section.

**M3 Polish** (after M1; items independent, each an optional cut line)
`status` → `doctor` → `use --add` → `.skillsetrc` → `unmigrate` → website.

Rules: one issue = one PR; app builds green after every issue; new commands land with
their tests in the same PR.

## 6. Dead code / obsolescence created

- PROJECT.md §7 manual test log — superseded by the vitest suite (M0.4).
- PROJECT.md as a whole becomes an internal working doc once README (M1.3) is the
  public source of truth; refresh (M0.2) keeps it honest until then.
- No source-code dead paths created; all work is additive or packaging.

## 7. Risks and pivot triggers (watch list)

- **anthropics/claude-code #39749 / #43928 / #62174**: if native `skillPresets` or
  per-session skill flags ship, the manual-set core is first-party redundant →
  re-scope M2/M3 toward suggest quality and cross-agent (research recommendation 4).
- **skill-toggle spins out / bridle adds per-session skill groups** → accelerate M2;
  auto-selection becomes the primary moat.
- Token figures remain estimates (`bytes/4`) — README must not present them as
  measurements.

## 8. Out of scope

Set composition, git-URL import, cross-agent portability, embeddings/network-based
suggestion, automatic (unconfirmed) switching in any form.
