import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { loadSuit } from "../suits.js";
import {
  materializeSuit,
  cleanupMaterialized,
  sweepStaleMaterialized,
} from "../materialize.js";
import { activeSkillsDir } from "../paths.js";

/**
 * `suit run <name> [-- <claude args>]` — launch one Claude Code session
 * wearing the suit, with zero global mutation. The suit is materialized as an
 * ephemeral plugin dir; the session gets exactly the suit's MCP servers
 * (strict replacement) and the suit's skills/commands/agents ON TOP of the
 * ambient global/project set — plugin delivery is additive, which is printed
 * honestly rather than papered over (docs/session-isolation.md, claim 9).
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

export async function runRun(name: string, passthrough: string[] = []): Promise<number> {
  const suit = loadSuit(name);

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
    console.log(chalk.bold(`Session wears suit '${suit.name}'${worn ? `: ${worn}` : ""}.`));
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

    const args = [...mat.flags, ...passthrough];
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
