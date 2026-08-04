# Review

Review guards the remote boundary: everything fetched by `suit install`/`suit
sync` is shown in full and decided per component before it can touch the
machine. Locally-created content (init-adopted skills, imports, hand-written
manifests) is the user's own and activates without review — it is also never
pinned, so editing your own files never triggers a drift block. `suit up`
therefore only intervenes for pinned (remote-approved) content: unchanged pins
activate silently, drifted pins are blocked. Local hooks still have their full
command printed at activation — disclosure survives the trust rule.

## Risk classes

A component's class is what it can do to the machine if it turns out to be
hostile — not how likely that is.

| Class | Types | Why |
|---|---|---|
| **RED** | `hooks`, `permissions` | Runs a command, or grants tool access without prompting. Acts on its own. |
| **ORANGE** | `mcp`, `plugins` | Starts a process, contacts a network service, or installs code from a marketplace. |
| **YELLOW** | `skills`, `commands`, `agents`, `rules`, `claudemd` | Instructions the agent will follow — prompt injection, not code execution. |

Every type the manifest accepts has a class. A type without one is a bug, and
`test/review.test.ts` fails if one appears.

## What you are shown

For each component: its risk class and the reason for it, the full content
(a skill's actual instructions, a hook's whole command, an MCP server's whole
config), and what is installed at the same key today, when anything is. Content
is never truncated — it is the thing being approved.

## Flags

| Situation | Result |
|---|---|
| Interactive | Each component is confirmed on its own. |
| No TTY, no `--yes` | **Refuses.** Nothing is activated. |
| `--yes` | Approves everything **except RED**, and lists what it left out. |
| `--yes --approve-code-execution` | Approves RED too. |

`--yes` and `--approve-code-execution` are separate on purpose. A flag that
means "don't ask me about this suit" must not also mean "run this command for
me" — those are different decisions, and bundling them is how a hostile hook
rides in on a routine install.

## Recorded decisions

Decisions are written to `<strongsuit>/reviews/<suit>.json`:

```json
[{ "type": "hooks", "id": "Stop", "risk": "red", "approved": false,
   "contentHash": "…", "decidedAt": "…" }]
```

The hash covers exactly what was displayed. An approval therefore applies to
the content that was approved and nothing else — edit the skill, and
`previouslyApproved` returns false, so it is reviewed again rather than
inheriting a decision made about different text. This is what the L3 lockfile
(XO-185) builds on.

## The lockfile (review L3)

`<strongsuit>/suit.lock` pins every approved component: the sha256 of exactly
what the reviewer saw, the text itself (for drift diffs), and — for installed
suits — the source and ref. Approval attaches to content, never to a name.

On `suit up`:

| Pin state | Behaviour |
|---|---|
| unchanged | activates silently — the approval still applies |
| changed | **blocked**, diff shown. Upstream drift and local tamper are indistinguishable by design. Interactive re-review re-pins; `--yes` never re-approves drift |
| unpinned | normal review flow |

`suit sync <name>` re-fetches an installed suit's source and runs a **delta
review**: unchanged components are silent, only drift is decided on. Rejecting
v2 does not unapprove v1 — the old pin stands, the old library copy stays, and
the manifest is merged per decision (never taken from the remote wholesale,
which would smuggle rejected MCP or hook config into the next `suit up`).

## Verification

Nine mutations were applied to the review engine and all nine were killed by a
named test: `--yes` approving RED; hooks demoted out of RED; the no-TTY path
deciding instead of refusing; a per-item answer being ignored; rejected
components surviving into the activated suit; the content hash being ignored so
an approval outlived an edit; a rejection counting as an approval; components
being decided without being printed; and the hook command being truncated in
the review display.
