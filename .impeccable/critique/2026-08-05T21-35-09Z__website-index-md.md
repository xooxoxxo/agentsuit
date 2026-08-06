---
target: website/index.md
total_score: 25
max_score: 32
na_heuristics: 1,7
p0_count: 1
p1_count: 2
timestamp: 2026-08-05T21-35-09Z
slug: website-index-md
---
# Critique: strongsuit landing page (website/index.md)

Method: dual-agent (A: a9e39c038f1803f7e · B: adeb8d9c33fed9683)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | n/a | static landing page, no dynamic state |
| 2 | Match System / Real World | 3 | suit metaphor lives in words only; zero visual reinforcement |
| 3 | User Control and Freedom | 4 | nav escape routes everywhere (home/docs/GitHub) |
| 4 | Consistency and Standards | 3 | consistent, but consistency is stock VitePress, not a system of its own |
| 5 | Error Prevention | 3 | "reversible everywhere" claimed, never demonstrated |
| 6 | Recognition Rather Than Recall | 3 | everything visible; jargon (hash-pinned, ledger) forces translation for newcomers |
| 7 | Flexibility and Efficiency | n/a | Persuade surface |
| 8 | Aesthetic and Minimalist Design | 3 | clean but generic; minimalism doesn't differentiate THIS product |
| 9 | Error Recovery | 3 | honest-limits copy prevents confusion; placement undermines it |
| 10 | Help and Documentation | 3 | docs one click away, well-structured |
| **Total** | | **25/32 (78%)** | **Good** |

## Design Specificity Verdict

**LLM assessment:** A VitePress home layout with gold swapped in. Retitle it "configcli" and nothing structural changes. The copy is sharply authored (honest-limits voice, real technical specifics) but the visual design is template-default: centered hero, 3×2 feature grid, code block, footer. The suit/wardrobe metaphor — the binding brand asset — exists only in words. The one authored visual moment is the gold gradient on the hero name. Reads "credible dev tool," not "this specific dev tool."

**Deterministic scan:** 1 advisory finding — `em-dash-overuse` (slop category): 13 em-dashes in rendered body text, ~1 per 500 chars. Source markdown and theme scanned clean. Not a framework false positive: it is the page's actual copy cadence.

**Visual overlays:** not attempted (isolated assessment agent had no browser tab ownership); CLI detector evidence used instead.

## Overall Impression

The words are strongsuit; the pixels are VitePress. Copy earns trust with specifics and honesty, the gold gradient hero is memorable, and the terminal tour proves the product is real. But a skeptical HN visitor pattern-matches the layout to "default docs template" in the first second — and this brand's whole pitch is craft and honesty. The single biggest opportunity: make the wardrobe metaphor visible, not just legible.

## What's Working

1. **The tagline.** "Dress your agent for the occasion" is short, metaphor-forward, sticky — the rare hero line that is both positioning and brand.
2. **Copy discipline.** "Hash-pinned," "quarantine," "mutation testing" — specifics over adjectives, zero "revolutionary/automatic," exactly per the overclaim guard. This converts skeptics.
3. **Gold-on-dark execution.** 8.2:1 contrast (AAA), gradient reads premium without garish; the one moment of visual craft lands.

## Priority Issues

- **[P0] Indistinguishable from stock VitePress.** The brand promises craft; the layout says template. Fix: commit one designed moment that carries the metaphor — a closet/rack visual for the feature section, a "suit" visual treatment of the terminal tour, or a bespoke hero composition. One strong authored section beats six styled cards.
- **[P1] Three parallel hero CTAs split the decision.** "Get started" / "Why a review pipeline?" / "GitHub" have equal weight. Fix: make "Get started" visually dominant; demote the review-pipeline link into the body; keep GitHub tertiary.
- **[P1] The honest-limits section — the differentiator — is below the fold.** Skeptics hunt for the catch; finding limits buried at the bottom reads as reluctant disclosure rather than confident honesty. Fix: move it directly under the hero (the section is literally titled "up front").
- **[P2] Six feature cards, no narrative.** All parallel, no grouping (safety trio vs workflow trio), reads as a list. Fix: group or reorder into pain → mechanism → proof; or promote three, collapse three.
- **[P2] Copy cadence trips the AI-tell detector.** 13 em-dashes at saturation density — this audience notices AI-written pages and discounts them. Fix: one copy pass replacing most em-dashes with periods, colons, parentheses.
- **[P2] Mobile unverified.** Only the hero image has a max-width rule; the grid, CTA stack, and code blocks are untested on phones — half of HN traffic. Fix: verify + add the few needed media queries.
- **[P3] No copy-paste install in the hero region.** "Get started" costs a click + scroll before a command appears; and npm isn't live yet, so the honest command today is the clone+link path. Fix: put the real install block on the landing page once npm ships; until then label the source path plainly.

## Persona Red Flags

**Jordan (first-timer):** tagline is attractive but abstract — no one-liner saying what category this is; "hash-pinned/ledger/MCP" jargon hits by card two; assumes Claude Code fluency with no ramp. Will bounce to something with a screenshot.
**Riley (skeptical dev):** clicks GitHub before believing anything; finds the limits section below the fold and asks "why bury it?"; would trust the page MORE if limits led. The em-dash cadence is exactly what Riley screenshots with "AI wrote this."
**Casey (mobile, from HN):** hero fine; 2×3 card grid behavior, CTA stacking, and code-block overflow on a phone are all unverified — any one breaking kills a CLI tool's credibility in a screenshot.

## Minor Observations

- Token-estimate disclaimer lives only in the footer; it belongs beside the token-lean claim.
- "Reversible everywhere" — the top reassurance for skeptics — is card six.
- Search (⌘K) on a landing page is inert weight; harmless but unearned.
- The terminal tour block is the most persuasive element on the page; it deserves more visual prominence than the cards above it.

## Questions to Consider

1. Is this page selling per-task outfits or safe remote installs? Half the cards argue each. Choosing one as the headline claim would reorder everything.
2. What would this page look like if the honest-limits section WERE the hero? "Every tool hides its limits. Ours are the first thing you read."
3. If a visitor could see one 10-second animation — a suit being put on (skills/MCP snapping into place) — would the six cards even be needed?
