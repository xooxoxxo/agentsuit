# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Claude Code power users — developers who have accumulated skills, MCP servers, plugins, and hooks, feel the token cost of loading everything into every session, and want per-task control without deleting anything. Confirmed direction: a **public dev tool** (npm/brew audience, dev-social launch), not a personal-only utility. Secondary, later: teams sharing suits — not a current commitment.

## Product Purpose

strongsuit (`suit` CLI) turns Claude Code customization into named, atomically-switchable **suits** — bundles of skills, commands, agents, rules, CLAUDE.md fragments, MCP servers, plugins, and hooks. One command dresses the agent for a task; nothing is ever deleted; a review pipeline gates everything remote; `suit run` binds a suit to a single session with zero global mutation. Success (confirmed): **adoption** (installs, stars, daily wearers) and **launch credibility** (a polished, complete, honestly documented product).

## Positioning

The mechanism neighbors cannot truthfully copy today: **content-pinned review** (approval attaches to sha256 of exactly what the reviewer saw; drift blocks with a diff — upstream update and local tamper are indistinguishable by design) plus **measured per-session isolation** (ephemeral plugin materialization + strict MCP replacement, verified by codeword/tool-count probes, not claimed). Prior art (andydbc/skillset) is dormant and skills-only. Every safety guarantee is mutation-tested — guards were deliberately broken and the suite verified to go red.

## Operating Context

The product is a terminal CLI operating on `~/.claude` (or `./.claude` per project); the **web surfaces are the website/docs** (VitePress, live at https://xooxoxxo.github.io/strongsuit/, auto-deployed from `website/` on push to main). Users arrive from Claude Code's own token-bloat warning, the `/skills` panel toggling era, npm/brew, or the repo. Install today: `npm link` from source; npm publish (v1.0.0) is pipeline-ready awaiting the maintainer's tag. Docs must let a stranger go install → init → tailor → up/run with zero outside help.

## Capabilities and Constraints

- Full command surface grouped as closet (install/import/adopt/list) · tailor (tailor/show/status) · wear globally (up/off/sync) · wear one session (run/resume, `.suitrc`, session map) · safety (init/restore/migrate).
- Review boundary is provenance: local content trusted and never pinned; remote content quarantined, per-component reviewed, hash-pinned. Hooks are never bulk-approved (`--approve-code-execution` is separate from `--yes`).
- Honest limits are product facts, stated wherever relevant: per-session skills are **additive** (ambient set inherited); bare `claude --resume` bypasses MCP isolation; token figures are **estimates** (`bytes/4`), never measurements.
- Overclaim guard (binding, from the website ticket): no "automatic" claims, no invented users/benchmarks.
- Undecided: npm publish timing (name locks at first publish); team/shared-suit features; version-history rollback (XO-205, backlog).

## Brand Commitments

All binding (confirmed 2026-08-05):
- **Name**: strongsuit; binary `suit`; repo github.com/xooxoxxo/strongsuit.
- **Logo**: `assets/logo.png` (gold on dark), used on README and website hero.
- **Metaphor**: the suit/wardrobe world — closet, tailor, wear; "dress your agent for the occasion"; `up` = your default outfit, `run` = one meeting. One pun carries the theme (`tailor`); piling on more is off-brand.
- **Voice**: honest-limits-first. Limitations are stated plainly and early, estimates labeled as estimates, measurements cited over claims. Safety talk is concrete (what is enforced and how it was verified), never vague reassurance.
- Website theme: dark default with gold brand accent (`#e0a82e` family).

## Evidence on Hand

Real and citable: measured isolation probes with method and dates (`docs/session-isolation.md`); mutation-testing record across every safety layer (30+ named killed mutants); 348 tests on 5 CI legs; live docs site; the review pipeline demonstrable end-to-end. **Absent — never fabricate**: users, testimonials, download counts, benchmarks, pricing.

## Product Principles

1. **Nothing is ever deleted.** Every destructive-looking operation is a symlink or ledgered entry away from reversal; init snapshots first.
2. **Approval attaches to content, not names.** Bytes are trusted, labels are not; drift always needs a human.
3. **Local is yours, remote is reviewed.** The user's own files are never gated; fetched bytes always are.
4. **Measured, not claimed.** Isolation, savings, and safety are demonstrated with reproducible probes or they are labeled estimates.
5. **Honesty is the brand.** Limits stated up front convert better with this audience than polish that hides them.
