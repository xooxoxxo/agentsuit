# Per-session suits

`suit up` changes what *every* new session sees. `suit run` dresses **one session** and leaves everything else alone:

```bash
suit run writing                          # this session wears 'writing'
suit run writing -- -p "draft the post"   # args after -- go to claude verbatim
```

Zero global mutation: nothing under `~/.claude` is written or linked. The suit is materialized as a throwaway plugin directory of symlinks into your library, handed to `claude` via flags, and deleted when the session ends — crashes included; stale dirs are swept on the next run.

What the session gets:

- **Skills, commands, agents** from the suit — delivered per-session via an ephemeral plugin.
- **Exactly the suit's MCP servers** — strict replacement. A suit with no MCP servers means a session with none, even if your machine has fifty configured.
- **The suit's hooks** via a session-scoped settings file.

Rules and CLAUDE.md fragments can't be delivered per session; `suit run` says so at launch instead of silently dropping them.

## `.suitrc` — a directory's default suit

```bash
echo writing > .suitrc
suit run          # no argument: nearest ancestor .suitrc decides
```

One suit name per file, `#` comments allowed. Nearest ancestor wins. Malformed files (no name, several names) refuse rather than guessing.

## Resume: the part that actually matters

Two measured facts shape everything here:

1. **Skills are sticky across resume.** The conversation prefix replays, so a session keeps the skills it was born with — free.
2. **MCP is not.** MCP servers are live connections re-established from flags at process start. Resume a conversation without its flags and it silently regains **every ambient MCP server** while the skills half still looks right.

So every `suit run` records its session → suit binding, and:

```bash
suit resume                # latest suit-launched session in this directory
suit resume <session-id>   # a specific one
suit run --continue        # same as bare resume
```

re-materializes the suit **it was born with** — not whatever `.suitrc` says now — and re-applies the MCP flags. The two can differ: change `.suitrc` all you want, existing conversations keep their outfit.

To keep the binding intact, session-lifecycle flags (`--resume`, `-c`, `--session-id`, `--fork-session`) are rejected in passthrough — use the wrapper commands.

## The two honest limitations

- **Skills are additive, not exclusive.** A plugin-delivered skill set merges with whatever your global and project directories already provide. A session can be *given* a suit; it can't be *stripped* to only that suit. `suit run` prints what the ambient baseline contributes — keep the global set lean (`suit off`) if you want sessions close to exclusive.
- **Bare `claude --resume` bypasses everything.** No hook can intercept it. Skills survive; MCP isolation evaporates. If a conversation matters, resume it with `suit resume`.

Both facts were established by measurement (codeword round-trips and MCP tool counts on real sessions), and the acceptance for this feature was measured the same way. Details: [`docs/session-isolation.md`](https://github.com/xooxoxxo/strongsuit/blob/main/docs/session-isolation.md).
