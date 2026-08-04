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
| 8 | Skills can be delivered per session via `--plugin-dir` | ephemeral plugin dir (`.claude-plugin/plugin.json` + `skills/`) attached to one session | returned `CODEWORD-AMBER-5521` | **VERIFIED** |
| 9 | Plugin-delivered skills merge rather than replace | run from a project holding its own marker, with the plugin attached | returned **both** `CODEWORD-TEAL-7788` and `CODEWORD-AMBER-5521` | **VERIFIED — additive** |
| 10 | A plugin's `skills/` entries may be symlinks into the library | plugin whose only entry is a symlink to a library skill | returned `CODEWORD-ROSE-8842` | **VERIFIED** |
| 11 | Plugin-delivered skills survive `--resume` without the flag | started with `--plugin-dir`, resumed with no flags | returned `CODEWORD-AMBER-5521` | **VERIFIED — sticky** |
| 12 | MCP isolation survives `--resume` without the flag | started with `--strict-mcp-config` (0 tools), resumed with no flags | full ambient tool set restored | **REFUTED — not sticky** |

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

- **Skills** — not by a skills flag, which does not exist, but by materialising the suit as
  an **ephemeral plugin**: a temp directory holding `.claude-plugin/plugin.json` and a
  `skills/` directory whose entries are symlinks into the library, passed as
  `--plugin-dir`. Measured working, symlinks and all, with OAuth intact. This is the
  mechanism that makes per-session skills possible at all.

**The one hard limit: additive, not exclusive.** Plugin-delivered skills merge with
whatever the global and project directories already provide (claim 9). A session can be
*given* a suit; it cannot be *stripped* down to only that suit without `--bare`, which
requires an API key. The practical consequence is that the globally-active set is the
baseline every session inherits, so `suit up` should keep it lean and `suit run` layers
the session's extras on top.

## Resume semantics — the asymmetry that shapes `.strongsuit`

The two halves of a suit behave differently when a conversation is resumed:

- **Skills are sticky.** A session started with a plugin-delivered skill still had it
  after `--resume` with no flags at all (claim 11). This matches XO-140: the conversation
  prefix, including the skill listing assembled at session start, is replayed verbatim. A
  conversation keeps the skills it was born with, for free.
- **MCP is not sticky.** A session started with `--strict-mcp-config` and zero servers came
  back from `--resume` with the entire ambient tool set (claim 12). MCP servers are live
  connections re-established from flags and config at process start, not prompt text.

So resuming a conversation without re-supplying its flags silently re-attaches every MCP
server the user has configured — the isolation quietly evaporates while the skills half
still looks correct. Any per-conversation binding (`.strongsuit`) therefore has to
re-apply the MCP flags on **every** launch, resume included; it does not need to do
anything to keep skills consistent.

The limit worth stating plainly: this only holds for sessions launched through the
wrapper. A user who runs bare `claude --resume` gets the ambient MCP set back and there is
no hook that can prevent it.

## Reproduction

```bash
# Claim 8/10 — per-session skills via an ephemeral plugin of symlinks
mkdir -p /tmp/suit/.claude-plugin /tmp/suit/skills
echo '{"name":"suit-ephemeral","description":"one session"}' > /tmp/suit/.claude-plugin/plugin.json
ln -s ~/.claude/strongsuit/library/<skill> /tmp/suit/skills/<skill>
claude -p "…" --plugin-dir /tmp/suit          # skill is present, OAuth intact

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

## The materializer (XO-191)

`src/materialize.ts` turns a suit manifest into the ephemeral plugin dir described
above: `<tmp>/strongsuit-run-<suit>-<pid>/` holding `.claude-plugin/plugin.json`,
symlinks into the library for skills/commands/agents, always an `mcp.json` (empty
when the suit defines no servers — strict replacement stays deterministic), and a
`settings.json` when the suit carries hooks. Rules, claudemd fragments and
marketplace plugins cannot be delivered per session; they are reported in
`skipped`. Structural behaviour is covered by `test/materialize.test.ts`; the
end-to-end acceptance is the manual codeword check:

```bash
# Manual check — a real session accepts the materialized plugin
node dist/cli.js …  # or: materializeSuit(<suit with one marker skill>) via tsx
claude -p "Quote the codeword from the marker skill's description verbatim." \
  --plugin-dir <materialized root>
# Expected: the codeword, proving the plugin loaded (claims 8/10 measured 2026-07-30)
```

## suit run (XO-192)

`suit run <name> [-- <claude args>]` wires the materializer to a real launch:
passthrough args lead (the variadic `--mcp-config` would swallow a trailing
positional prompt), suit flags follow, exit codes and signals forward
(128+signal), temp dir cleaned in a finally plus SIGINT/SIGTERM handlers, stale
dirs swept on every launch. Acceptance measured live 2026-08-04 with the
codeword/tool-count method: a sandboxed home (`STRONGSUIT_HOME`), one marker
skill, ambient directory with ~99 `mcp__` tools — the session answered
`codeword=CODEWORD-JADE-3311 mcp_count=0` and exited 0, leaving the real
`~/.claude` and the OS temp dir byte-untouched.

## Open

- `--agents` and `--plugin-dir` are confirmed present but their isolation was not measured
  end to end; worth a follow-up before `suit run` relies on either.
- Behaviour for API-key (non-OAuth) users, where `CLAUDE_CONFIG_DIR` and `--bare` would
  give full isolation including skills, is untested.
