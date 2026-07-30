# strongsuit — Pivot Design: Skillsets → Agentic Suits

Date: 2026-07-30 · Status: approved in interactive brainstorming session
Supersedes the initiative shape of `2026-07-29-claude-skillsets-initiative-design.md`
(its M0 foundation, safety model, and best-of amendments carry forward unchanged).

## 1. The pivot

First public release is not a skills switcher — it is **strongsuit** (bin `suit`): named,
atomically-switchable **suits** of an agent's entire customizable surface — skills, MCP
servers, plugins, hooks, slash commands, subagents, rules/CLAUDE.md — with a **full
review pipeline** for anything installed from a remote source. `suit up coding` dresses
the agent for the occasion; `suit install owner/repo` never lands a byte unreviewed.

Competitive context: andydbc/skillset (dormant, npm `@andbc/skillset`) validates the
bundle-distribution shape but has no switching, no safety, no review, no tests. Our
mutation-verified safety core + review pipeline is the differentiation.

## 2. Verified platform facts (doc-cited, claude-code-guide agent 2026-07-30)

Two artifact classes on the Claude Code side:

| Class | Surfaces | Mechanism |
|---|---|---|
| **File-based** (symlinkable dirs) | skills, commands (`.claude/commands`), subagents (`.claude/agents`), rules (`.claude/rules`), CLAUDE.md, plugin dirs | existing symlink backend extends directly |
| **JSON-entry** (keys in shared files) | MCP servers (`~/.claude.json` per-project nesting, project `.mcp.json`), `enabledPlugins`, hooks (settings), permissions, env | NEW managed-entries backend |

Trust nuances: project `.mcp.json` requires workspace-trust; `settings.local.json` allow
rules apply immediately; managed settings always win; `disabledMcpServers` /
`enabledPlugins` / `disableAllHooks` are the native toggle points.

## 3. Locked architecture decisions

1. **Two backends, one ownership discipline.** Symlink backend (shipped, 21 tests,
   mutation-verified) + **managed-entries backend**: an ownership ledger (state file in
   the strongsuit home) records every JSON key strongsuit writes; keys absent from the
   ledger are NEVER modified or deleted — the first-hop principle extended to JSON.
   Ledger-backend invariants get the same mutation-testing bar as XO-141.
2. **Suit = manifest.** `suit.yaml` (yaml — the dependency already ships) listing components by type; local suits
   live in the library; a remote suit is a git repo containing a manifest;
   `suit install owner/repo` fetches manifest + components.
3. **Activation stays atomic + exclusive per scope.** `suit up <name>` = symlink swap +
   ledgered JSON entry swap in one operation with rollback on partial failure.
4. **Review pipeline gates all remote content** (L1 + L3 at launch):
   - L1: manifest view → per-component content diff → risk class (hook = code-exec,
     MCP = network, permission = trust-boundary) → individual approve/reject.
     **Hooks are never bulk-approved — always explicit per-hook.**
   - L3: approved content hash-pinned in a lockfile; upstream drift = component blocked
     until re-reviewed.
   - L2 (post-launch): optional `--review claude` headless security pass.
5. **Skills core survives as a component type.** Existing library/sets migrate via
   `suit migrate`; nothing about the skills mechanics changes.
6. **Naming:** npm package `strongsuit`, bin `suit`, config root `~/.claude/strongsuit/`
   (library, suits, ledger, lockfile). GitHub repo renamed `strongsuit` (redirects keep
   old links alive). First npm publish = **strongsuit@1.0.0** (the 1.1.0 internal
   version was never published; git history preserves it).

## 4. Feature tiers (walked with user 2026-07-30)

| Tier | Feature |
|---|---|
| 🟢 MUST | Rename/rebrand refactor + `suit migrate` + repo rename |
| 🟢 MUST | Suit manifest schema + library storage |
| 🟢 MUST | Managed-entries backend (ownership ledger, mutation-tested) |
| 🟢 MUST | File-backend extension: commands, agents, rules, CLAUDE.md fragments |
| 🟢 MUST | MCP server components |
| 🟢 MUST | Plugin components — full: enabledPlugins + marketplace install orchestration |
| 🟢 MUST | Hook components (per-hook explicit approval rule) |
| 🟢 MUST | Remote install from git (`suit install owner/repo`) |
| 🟢 MUST | Review L1: manifest + per-component diff + risk class + approve |
| 🟢 MUST | Review L3: lockfile hash pinning + drift block |
| 🟢 MUST | `--yes` non-interactive mode (carried XO-156) |
| 🟢 MUST | First-run onboarding (carried XO-158) |
| 🟢 MUST | npm publish strongsuit@1.0.0 + brew tap + Actions release pipeline |
| 🟡 NICE | Permissions/env fragments (post-launch; merge semantics + trust care) |
| 🟡 NICE | Review L2: agent-assisted security pass |
| 🟡 NICE | suggest + find (re-voiced for suits; corpus incl. all component types) |
| 🟡 NICE | status · doctor · up --add · .suitrc · unmigrate · export/import |
| 🟡 NICE | Website (strongsuit brand, review pipeline as hero) |
| 🔵 FUTURE | Cross-agent targets, suit composition, registry/leaderboard, telemetry |

## 5. Milestones (restructured; M0 done, old M1 partially done and absorbed)

- **M1 Rename** — strongsuit/suit rename across package, bin, paths, docs; repo rename;
  `suit migrate`; README rebrand pass. App green throughout.
- **M2 Suit core** — manifest schema + library; file-backend extension to
  commands/agents/rules/CLAUDE.md; `suit up` exclusive across file types; tests.
- **M3 Managed entries** — ledger backend (foundation issue, mutation-tested), then MCP
  components, plugin components, hook components as separate issues on top.
- **M4 Remote + review** — git fetch/install; review L1; lockfile L3; `--yes` mode;
  onboarding. Remote install PR and review-L1 PR land together (remote never exists
  unreviewed).
- **M5 Launch** — publish strongsuit@1.0.0, cold npx verify, brew tap, Actions pipeline,
  positioning README final.
- **M6 Post-launch (NICE pool)** — perms/env, review L2, suggest/find, status, doctor,
  up --add, .suitrc, unmigrate, export/import, website.

Rules unchanged: 1 issue = 1 PR, green after every issue, deps explicit, tests ride
with their PR.

## 6. Existing Linear reconciliation

- Done issues (XO-138..144, 157) stay as-is under their historical milestones.
- XO-156 (--yes), XO-158 (onboarding): keep, re-milestone to M4.
- XO-145 (publish): rewrite as strongsuit@1.0.0 launch, re-milestone M5.
- XO-146/147 (suggest corpus/command): re-voice for suits, move to M6 pool.
- XO-148..153, 159, 160 (status/doctor/--add/.skillsetrc/unmigrate/export/scaffold/
  website): move to M6 pool; .skillsetrc renamed .suitrc.
- New issues for M1–M4 MUST features.

## 7. Dead code / obsolescence

- "skillset(s)" naming across package, paths, docs — removed in M1.
- sets.json format — migrated to suit manifests (`suit migrate`).
- README (just shipped) — rebranded in M1; §11 positioning notes re-voiced.
- Old spec's M2/M3 structure — superseded by this document.

## 8. Risks

- **Settings-file surgery** is the new highest-risk surface; the ledger backend ships
  first in M3 with its own invariant suite before any component type uses it.
- **Marketplace install orchestration** (plugins MUST) shells to `claude plugin
  install` — partial-state handling needs explicit design in that issue.
- **Scope size**: 13 MUST features before launch. Cut line if needed: plugins
  marketplace-install half (toggle-only ships), hooks (drop to NICE) — flagged here so
  the cut is pre-agreed, not improvised.
- Watch list unchanged: native skillPresets (#39749 etc.) now also applies to any
  native "profiles" concept covering MCP/plugins.
