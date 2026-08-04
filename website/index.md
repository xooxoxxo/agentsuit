---
layout: home

hero:
  name: strongsuit
  text: Dress your agent for the occasion.
  tagline: Skills, MCP servers, plugins, and hooks as named, atomically-switchable suits for Claude Code — with a review pipeline for anything you didn't write yourself.
  image:
    src: /logo.png
    alt: strongsuit
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why a review pipeline?
      link: /guide/review
    - theme: alt
      text: GitHub
      link: https://github.com/xooxoxxo/strongsuit

features:
  - icon: 🎽
    title: One command, one outfit
    details: suit up coding activates exactly the skills, MCP servers, plugins, and hooks that task needs — atomically, with rollback on failure. Nothing is ever deleted; switching back is one command.
  - icon: 🔍
    title: Review before it touches you
    details: Remote suits land in quarantine. Every component is printed in full, risk-classed — prompt-surface, process/network, code-executing — and approved individually. Hooks are never bulk-approved.
  - icon: 📌
    title: Approval sticks to content
    details: Approved components are pinned by hash. If upstream changes — or something tampers locally — activation blocks with a diff until a human re-approves. Names are never trusted; bytes are.
  - icon: 🧪
    title: One session, one suit
    details: suit run wears a suit for a single Claude session with zero global mutation. A .suitrc names your project's suit; resumed conversations are re-dressed in the suit they were born with.
  - icon: 🪙
    title: Token-lean by default
    details: Claude Code loads every installed skill's description into every session. Keep the library big and the active set small — suit list shows what each skill costs, estimated honestly.
  - icon: 🧯
    title: Reversible everywhere
    details: init snapshots your setup before touching it; restore puts it back byte-for-byte. A JSON ownership ledger guarantees keys strongsuit didn't write are never modified — foreign edits are detected and refused.
---

## Thirty seconds of it

```bash
$ suit new deep-work --skills docx,pptx
Saved set "deep-work" with 2 skill(s).

$ suit up deep-work
✓ skills: docx, pptx
Suit "deep-work" active.

$ suit install acme/research-suit        # remote → quarantine → review
── skills/paper-summarizer ──────────── YELLOW · prompt-surface
<full content shown, approve? y/n>

$ suit run writing -- -p "draft the launch post"
Session wears suit 'writing': 3 skills, 1 MCP server.
MCP is exclusive: this session gets only the suit's servers.
```

## The honest parts, up front

- **Per-session skills are additive.** A `suit run` session gets the suit *plus* your ambient global set — measured, documented, and printed at launch, not hidden.
- **Bare `claude --resume` bypasses the binding.** Skills survive, MCP isolation doesn't. `suit resume` exists for exactly this; the limitation is in the docs, not buried.
- **Token figures are estimates** (`bytes / 4`) for comparing skills — never presented as measurements.

Every safety guarantee on this page is enforced by a test that was verified to fail when the guard is removed — mutation testing, not vibes. Read the [safety model](/guide/safety).
