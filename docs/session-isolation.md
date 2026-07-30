# Per-Session Config Isolation — measured findings (XO-188)

Date: 2026-07-30 · Claude Code CLI on macOS · probes on `--model sonnet`, `--output-format json`

## The question

Can one Claude Code session be bound to its own combination of skills, MCP servers,
agents and settings — invisible to other sessions, leaving the global config untouched?
If yes, `suit run <name> -- claude` becomes possible: a chat wearing exactly one suit,
with no global mutation at all.

## Method

Probes ask the session to **quote a codeword verbatim** from a marker skill's frontmatter
description, never "is skill X available". Presence questions produced false negatives in
an earlier experiment (XO-140), and a session that has already discussed a codeword can
answer from its own transcript rather than from live context — so any session used as
evidence had never seen the codeword before being asked.

MCP claims are measured by asking for the **count** of available `mcp__*` tools, run from
the same directory with and without the flag under test, changing nothing else.

## Results

| # | Claim under test | How it was measured | Observed | Verdict |
|---|---|---|---|---|
| 1 | `--strict-mcp-config` replaces rather than merges the MCP set | same dir, plain vs `--strict-mcp-config --mcp-config empty.json` | **99 `mcp__` tools → 0** | **VERIFIED** |
| 2 | Project `.claude/skills` load automatically | marker skill in a scratch project's `.claude/skills`, plain session from that dir | returned `CODEWORD-TEAL-7788` | **VERIFIED** |
| 3 | `CLAUDE_CONFIG_DIR` relocates the config root usably | `CLAUDE_CONFIG_DIR=<temp> claude -p …` | `Not logged in · Please run /login` | **REFUTED for OAuth users** |
| 4 | Seeding the relocated root with the account file restores auth | copied `~/.claude.json` into the temp root, retried | still `Not logged in` | **REFUTED** |
| 5 | A per-session skills flag exists | `claude --help` | no `--skills` flag | **REFUTED** |
| 6 | Per-session injection flags exist for other surfaces | `claude --help` | `--agents <json>`, `--mcp-config`, `--strict-mcp-config`, `--plugin-dir`, `--settings` all present | **VERIFIED (present)** |
| 7 | `--bare` skips discovery of everything | `claude --help` | present; states it requires `ANTHROPIC_API_KEY` or `apiKeyHelper` — OAuth unsupported in that mode | **VERIFIED (documented)** |

Claim 1 is the load-bearing one and the measurement is unambiguous: same working
directory, same account, same model — only the flag differs, and the entire MCP surface
disappears.

Claim 2 corrects an earlier draft of this document, which recorded project skills as
non-loading. They load; the original probe was faulty. This is consistent with XO-140,
where a project-scope skill was read by a fresh session.

Claim 3 is the wall. An OAuth login's credentials are not stored inside the config
directory (there is no `.credentials.json` under `~/.claude` on macOS; the token lives in
the Keychain, bound to the real root), so a relocated root starts unauthenticated, and
copying the account file does not fix it. API-key users would not hit this, but that is
not the default install.

## What this means for `suit run`

**Isolatable per session today — no global mutation, OAuth intact:**

- **MCP servers** — `--strict-mcp-config --mcp-config <suit>/mcp.json`. The largest
  context lever, since MCP tool definitions are the heaviest per-session cost. The
  measurement above shows a suit can define exactly the servers a session gets.
- **Agents** — `--agents '<json>'`
- **Plugins** — `--plugin-dir <path>` (repeatable)
- **Settings and hooks** — `--settings <file>`

**Not isolatable per session:**

- **Skills.** No flag exists. The only levers are which directory they sit in — global
  `~/.claude/skills` or the project's `.claude/skills` — or relocating the whole config
  root, which costs OAuth. Skills therefore stay on the symlink model: global or
  per-project, switched with `suit up`.

So `suit run <name> -- claude` is real, with an honest boundary: it isolates the MCP,
agent, plugin and settings half of a suit into a single session, while the skills half
follows the directory it is launched in. Documentation must state that plainly — a user
who expects per-session skills would otherwise be surprised.

## Reproduction

```bash
# Claim 1 — the MCP measurement
echo '{"mcpServers":{}}' > /tmp/empty-mcp.json
cd <a directory that has MCP servers configured>

claude -p "How many MCP-provided tools (names starting mcp__) are available to you?" \
  --model sonnet --output-format json                       # → 99

claude -p "How many MCP-provided tools (names starting mcp__) are available to you?" \
  --model sonnet --output-format json \
  --strict-mcp-config --mcp-config /tmp/empty-mcp.json       # → 0
```

`--mcp-config` is variadic, so the prompt must come **before** it or it is swallowed as
another config path.

## Open

- `--agents` and `--plugin-dir` are confirmed present but their isolation was not measured
  end to end; worth a follow-up before `suit run` relies on either.
- Behaviour for API-key (non-OAuth) users, where `CLAUDE_CONFIG_DIR` and `--bare` would
  give full isolation including skills, is untested.
