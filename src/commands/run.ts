import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { loadSuit, type SuitManifest } from "../suits.js";
import {
  materializeSuit,
  cleanupMaterialized,
  sweepStaleMaterialized,
} from "../materialize.js";
import { activeSkillsDir } from "../paths.js";
import {
  findSuitrc,
  readSuitrc,
  recordSession,
  sessionById,
  latestSessionFor,
} from "../suitrc.js";

/**
 * `suit run [name] [-- <claude args>]` — launch one Claude Code session
 * wearing the suit, with zero global mutation. The suit is materialized as an
 * ephemeral plugin dir; the session gets exactly the suit's MCP servers
 * (strict replacement) and the suit's skills/commands/agents ON TOP of the
 * ambient global/project set — plugin delivery is additive, which is printed
 * honestly rather than papered over (docs/session-isolation.md, claim 9).
 *
 * With no name, the nearest `.suitrc` decides. Every launch mints a session id
 * and records id → suit, so `suit resume` can re-dress the conversation in the
 * suit it was born with — MCP flags do not survive a bare resume (claim 12).
 */

export interface ClaudeRunResult {
  status: number | null;
  signal?: NodeJS.Signals | null;
}

export type ClaudeRunner = (command: string, args: string[]) => ClaudeRunResult;

const defaultRunner: ClaudeRunner = (command, args) =>
  spawnSync(command, args, {
    stdio: "inherit",
    // npm-installed claude is a .cmd shim on Windows; spawnSync can't exec those directly.
    shell: process.platform === "win32",
  });

let claudeRunner: ClaudeRunner = defaultRunner;

/** Test seam: inject a fake claude. Pass null to restore the real one. */
export function setClaudeRunner(runner: ClaudeRunner | null): void {
  claudeRunner = runner ?? defaultRunner;
}

function countEntries(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((name) => !name.startsWith(".")).length;
  } catch {
    return 0;
  }
}

function exitCodeFrom(result: ClaudeRunResult): number {
  if (result.status !== null && result.status !== undefined) return result.status;
  if (result.signal) {
    const num = os.constants.signals[result.signal];
    if (num !== undefined) return 128 + num;
  }
  return 1;
}

/** Session-lifecycle flags must go through suit run/resume, not passthrough. */
const RESERVED_PASSTHROUGH = ["--resume", "-r", "--continue", "-c", "--session-id", "--fork-session"];

function rejectReservedPassthrough(passthrough: string[]): void {
  const hit = passthrough.find((arg) => RESERVED_PASSTHROUGH.includes(arg));
  if (hit) {
    throw new Error(
      `'${hit}' would bypass the session map, losing the suit binding on resume. ` +
        `Use 'suit resume [<session-id>]' or 'suit run --continue' instead.`
    );
  }
}

/** Materialize, print the honest UX, launch, forward exit code, clean up. */
async function launchWearing(
  suit: SuitManifest,
  sessionArgs: string[],
  passthrough: string[],
  intro: string
): Promise<number> {
  const swept = sweepStaleMaterialized();
  if (swept.length > 0) {
    console.log(chalk.gray(`Swept ${swept.length} stale session dir(s) from crashed runs.`));
  }

  const mat = materializeSuit(suit);
  const signalHandler = (signal: NodeJS.Signals): void => {
    try {
      cleanupMaterialized(mat.root);
    } catch {
      /* already gone or refused — exiting anyway */
    }
    process.exit(128 + (os.constants.signals[signal] ?? 0));
  };
  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);

  try {
    const components = suit.components ?? {};
    const counts = [
      ["skill", (components.skills ?? []).length],
      ["command", (components.commands ?? []).length],
      ["agent", (components.agents ?? []).length],
      ["MCP server", (components.mcp ?? []).length],
      ["hook", (components.hooks ?? []).length],
    ] as const;
    const worn = counts
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`)
      .join(", ");
    console.log(chalk.bold(`${intro}${worn ? `: ${worn}` : ""}.`));
    console.log(
      chalk.gray(
        "MCP is exclusive: this session gets only the suit's servers. Other sessions and the global config are untouched."
      )
    );

    const globalSkills = countEntries(activeSkillsDir("user"));
    const projectSkills = countEntries(activeSkillsDir("project"));
    if (globalSkills > 0 || projectSkills > 0) {
      const baseline = [
        globalSkills > 0 ? `${globalSkills} global skill(s)` : null,
        projectSkills > 0 ? `${projectSkills} project skill(s)` : null,
      ]
        .filter(Boolean)
        .join(" and ");
      console.log(
        chalk.yellow(
          `Skills are additive: the session also inherits ${baseline} from the ambient config. Keep the global set lean ('suit off') if you want this session close to exclusive.`
        )
      );
    }

    if (mat.skipped.length > 0) {
      console.log(
        chalk.yellow(
          `Not deliverable per session (activate globally with 'suit up'): ${mat.skipped.join(", ")}.`
        )
      );
    }

    // Passthrough first: --mcp-config is variadic, so a positional prompt
    // placed after it would be swallowed as another config path (XO-188).
    const args = [...passthrough, ...sessionArgs, ...mat.flags];
    const result = claudeRunner("claude", args);
    return exitCodeFrom(result);
  } finally {
    process.removeListener("SIGINT", signalHandler);
    process.removeListener("SIGTERM", signalHandler);
    try {
      cleanupMaterialized(mat.root);
    } catch {
      /* refusal here means the root was never ours to delete; nothing to clean */
    }
  }
}

export interface RunOptions {
  continue?: boolean;
}

export async function runRun(
  name: string | undefined,
  passthrough: string[] = [],
  options: RunOptions = {}
): Promise<number> {
  if (options.continue) {
    return runResume(undefined, passthrough);
  }

  rejectReservedPassthrough(passthrough);

  let suitName = name;
  if (!suitName) {
    const rc = findSuitrc(process.cwd());
    if (!rc) {
      throw new Error(
        "No suit named and no .suitrc found in this directory or any ancestor. " +
          "Run 'suit run <name>' or create a .suitrc naming the suit."
      );
    }
    suitName = readSuitrc(rc);
    console.log(chalk.gray(`Wearing '${suitName}' per ${rc}`));
  }

  const suit = loadSuit(suitName);
  const sessionId = crypto.randomUUID();
  // Recorded before launch: a crash mid-session must not orphan the binding.
  recordSession(sessionId, {
    suit: suitName,
    cwd: process.cwd(),
    launchedAt: new Date().toISOString(),
  });

  return launchWearing(
    suit,
    ["--session-id", sessionId],
    passthrough,
    `Session wears suit '${suit.name}'`
  );
}

export async function runResume(
  id: string | undefined,
  passthrough: string[] = []
): Promise<number> {
  rejectReservedPassthrough(passthrough);

  let sessionId = id;
  if (!sessionId) {
    const latest = latestSessionFor(process.cwd());
    if (!latest) {
      throw new Error(
        "No suit-launched session recorded for this directory. Sessions started with bare 'claude' are not tracked."
      );
    }
    sessionId = latest.id;
  }

  const record = sessionById(sessionId);
  if (!record) {
    throw new Error(
      `Session ${sessionId} was not launched through 'suit run', so its suit is unknown. ` +
        "Resume it with bare 'claude --resume' (ambient config) or start a new 'suit run' session."
    );
  }

  const suit = loadSuit(record.suit);
  return launchWearing(
    suit,
    ["--resume", sessionId],
    passthrough,
    `Re-dressing session ${sessionId.slice(0, 8)} in suit '${suit.name}' (MCP flags re-applied — they do not survive a bare resume)`
  );
}
