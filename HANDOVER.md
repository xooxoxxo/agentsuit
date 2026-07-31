# strongsuit — handover

Written 2026-07-30. Living document: update it when the state below stops being true.

Tracking lives in Linear project **strongsuit — Suits, Review, Launch** (team Xo).
Repo: **github.com/xooxoxxo/strongsuit**. Nothing is published to npm yet.

---

## What the tool is

`strongsuit` (binary `suit`) switches named **suits** — bundles of an agent's
customization surface: skills, commands, subagents, rules, CLAUDE.md fragments, MCP
servers, plugins and hooks. `suit up coding` swaps the lot atomically.
Remote suits will be gated behind a review pipeline before anything lands.

Two backends, one ownership rule:

- **Symlink backend** for file-based surfaces. The library holds each entry once; the
  active directory holds only symlinks into it. Anything whose **first hop** does not
  point into the library is not ours and is never removed.
- **Ownership-ledger backend** for JSON surfaces (`settings.json`, `~/.claude.json`,
  `.mcp.json`). Every key written is recorded in `<root>/ledger.json`; a key absent from
  the ledger is never modified or deleted. Same rule, different medium.

Config root is `~/.claude/strongsuit/`, overridable with `STRONGSUIT_HOME`.

---

## State as of this writing

Done: M0 (foundation, CI, safety suite), M1 (packaging, Windows junctions, README, shell
completion), M4 (two renames + `suit migrate`), M5 (manifest schema, file backends,
`suit up` with rollback, the isolation spike), and **all of M6** — the ledger backend
(XO-178), MCP components (XO-180), plugins with install orchestration (XO-181) and hooks
with the per-hook approval gate (XO-182).

**200 tests, green on macOS/Ubuntu/Windows × Node 20/22.**

Remaining, in dependency order:

| Milestone | Issues |
|---|---|
| M6 leftovers | XO-196 (MCP rollback test gap, see below) |
| M7 Remote + review | XO-183 review L1 → XO-184 `suit install` → XO-185 lockfile · XO-156 `--yes` · XO-158 onboarding |
| M7.5 Per-session suits | XO-191 materializer → XO-192 `suit run` → XO-193 `.suitrc` binding |
| M8 Launch | XO-145 publish (blocked by everything above) |
| M9 Post-launch | XO-146/147 suggest+find, 148 status, 149 doctor, 150 `up --add`, 152 unmigrate, 153 website, 159 export/import, 160 scaffold, 186 permissions/env, 187 review L2 |

XO-151 is superseded by XO-193 — close it when XO-193 lands.

---

## How to work on this

### Ground rules learned the hard way

**Never let anything write to the real `~/.claude`.** An early agent derived paths from
`os.homedir()` instead of `paths.ts`; running its tests created directories in the live
config and appended a block to the user's global `CLAUDE.md`. Three guards exist now and
must stay green:

- **G1** — only `src/paths.ts` may call `os.homedir()`; a test greps `src/` for violations.
- **G3** — every path in `allManagedPaths()` must resolve inside `STRONGSUIT_HOME`, and
  every registered artifact type must appear in that enumeration. It derives paths from
  the artifact-type registry deliberately: an earlier version rebuilt its own list and so
  tested `paths.ts` against itself, passing while a hardcoded escape path went unnoticed.
- **`test/setup.ts`** sandboxes `STRONGSUIT_HOME` before any module loads, so a missed
  override lands in a temp dir rather than the real home.

Before merging anything, run the leak check:

```bash
ls -d ~/.claude/strongsuit ~/strongsuit ~/.claude/agents ~/.claude/commands 2>&1
grep -c strongsuit ~/.claude/CLAUDE.md   # expect 0
ls ~/.claude/skills | wc -l              # expect 108
```

**A green suite is not evidence.** Five consecutive tickets shipped green with real
defects inside: a tautological containment guard, a rollback that never rolled back, a
marker migration that always threw, MCP writes to a ledger outside the managed root, and
a rollback branch still building paths by hand. Every one was found by mutation testing,
none by the suite as written.

So: **for any safety-relevant change, break it on purpose and confirm a test fails.**

```bash
# the shape of it
cp src/thing.ts /tmp/keep          # sabotage one guard
npx vitest run                     # a test MUST fail — name it
cp /tmp/keep src/thing.ts          # restore, confirm green again
```

A mutation that leaves the suite green means the test validates what was written, not
what could break. Write the real test or record the gap honestly (see XO-196 for the
format) — do not ship a test that passes for the wrong reason.

**Never execute a mutation that redirects a path.** Sabotaging `settingsPath()` to use
`$HOME/.claude` instead of `CLAUDE_HOME` and then running the suite wrote a real file
into the live config — the mutant did its damage before any test could report it, and
`test/setup.ts` cannot help, because the mutation is the thing bypassing it. Assert those
guards read-only instead: call the path helper and check the returned string. The same
applies to any mutation that would make a write escape the sandbox rather than merely
produce a wrong value.

This happened **twice**, the second time after the rule was already written here — by
re-running a harness that still contained the mutant. Knowing the rule does not help if
the mutant is still in the script: delete it. The durable fix is that `settingsPath()` is
now enumerated in `allManagedPaths()`, so G3 catches an escaping settings path with a
read-only assertion and no mutation is needed at all. Do the same for any new path
helper.

**A mutation harness needs a trustworthy oracle.** Two ways a scripted harness
reports a kill that never happened, both hit on XO-181:

- Deciding "killed" from the *absence* of a success string. `grep -q "FAIL (0)"`
  reported every mutant as killed the moment the output format changed. Decide from
  the *presence* of a named failing test instead, and print the name — an empty name
  column means you have not verified anything.
- A `perl -0pi -e 's/.../.../'` pattern that matches an earlier function too. One
  mutation aimed at `deactivatePlugins` landed in `deactivateMcpServers`, so the code
  under test was never touched. Anchor the pattern on something unique to the target
  and confirm with `git diff --stat` that the edit landed where you meant.

One more trap that cost a real recovery: `ManagedJson` writes via temp-file + `rename`,
which **resets the birth timestamp** on APFS. A fresh `stat` birth time is therefore not
evidence that a file was newly created rather than overwritten. To tell whether a config
file was clobbered, compare its contents against `~/.claude/settings.json.*backup` and
`~/.claude/file-history/`, which is where a recoverable copy actually lives.

### Environment

```bash
npm install --include=dev
npm run build          # tsc; must be clean
npx vitest run         # 200 tests
```

Agent worktrees under `.claude/worktrees/` each carry a copy of the suite. They are
gitignored and excluded in `vitest.config.ts` — if local counts ever balloon (547 was the
record), stale worktrees are why: `git worktree list`, then `git worktree remove --force`.

### GitHub

The machine's active `gh` account flips to `oytify` (work) unpredictably. Pin every call:

```bash
GH_TOKEN=$(gh auth token --user oytuneyucel) gh ...
```

CI occasionally does not queue a run even though the commit is the PR head. Close/reopen
does not reliably wake it; an empty commit does.

### Measuring Claude Code behaviour

Several decisions rest on measurements, not documentation. When adding to them, follow
`docs/session-isolation.md`:

- Probe by asking a session to **quote a codeword verbatim** from a skill's description.
  Never ask "is skill X available" — that produced false negatives on haiku, and a
  session that has already discussed the codeword answers from its own transcript.
- Use `--model sonnet` and `--output-format json`, and redirect stdin (`< /dev/null`).
- `--mcp-config` is variadic: put the prompt **before** it or it is swallowed.

---

## Facts worth not rediscovering

Measured, with the experiments in `docs/session-isolation.md`:

- `--strict-mcp-config` genuinely replaces the MCP set: **99 tools → 0** from the same
  directory, only the flag differing.
- Skills **can** be scoped to one session — not by a flag (none exists) but by handing
  Claude Code an ephemeral plugin directory (`.claude-plugin/plugin.json` + `skills/`)
  via `--plugin-dir`. The entries may be symlinks into the library.
- That delivery is **additive**: the session gets the suit *plus* whatever global and
  project directories already provide. It cannot be stripped to only the suit without
  `--bare`, which requires an API key. Say so in docs; do not imply exclusivity.
- `CLAUDE_CONFIG_DIR` relocates the config root but leaves an OAuth login
  unauthenticated — the token lives in the Keychain, bound to the real root. Copying
  `~/.claude.json` does not help.
- **Skills survive `--resume` without flags; MCP does not.** A conversation resumed
  normally silently regains every ambient MCP server while the skills half still looks
  right. This is why XO-193 must re-apply MCP flags on every launch including resume, and
  why a user running bare `claude --resume` bypasses the isolation entirely — a limit to
  document, not paper over.
- New sessions read the current `.claude/skills`; resumed sessions replay the listing
  fixed at session creation.

Honest positioning: the MCP half of a suit *is* exclusive, the skills half is layered.
Those are different promises and the README should keep them apart.

---

## Before launch (XO-145)

The name becomes permanent the moment it is published — it lands in the npm registry, in
every lockfile, and in the brew tap. Two renames were free because nothing was published;
a third would not be. Sit with `strongsuit` before publishing.

Also outstanding at launch: GitHub Actions release pipeline, brew tap
`xooxoxxo/tap/strongsuit`, cold `npx` verification on macOS and Windows, and a final
README pass that leads with the review pipeline and keeps the token figures labelled as
estimates (`bytes / 4`, a signal not a measurement).
