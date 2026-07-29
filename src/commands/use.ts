import ora from "ora";
import chalk from "chalk";
import { loadSets } from "../sets.js";
import { activateOnly } from "../activate.js";
import { LIBRARY_DIR } from "../paths.js";
import type { Scope } from "../activate.js";

export async function runUse(setName: string, scope: Scope): Promise<void> {
  const sets = loadSets();
  const skillNames = sets[setName];

  if (!skillNames) {
    console.log(chalk.red(`No set named "${setName}". Run \`skillset sets\` to see what's defined.`));
    return;
  }

  const spinner = ora(`Switching ${scope} skills to "${setName}"...`).start();
  try {
    const { linked, skipped, foreign } = activateOnly(skillNames, scope, LIBRARY_DIR);
    spinner.succeed(`Active skills (${scope}): ${linked.join(", ") || "(none)"}`);

    if (skipped.length > 0) {
      console.log(chalk.yellow(`Skipped, not in library: ${skipped.join(", ")}`));
    }
    if (foreign.length > 0) {
      console.log(
        chalk.yellow(
          `Left untouched, not managed by skillset (${foreign.length}): ${foreign.join(", ")}`
        )
      );
      console.log(chalk.dim(`Run \`skillset init\` to bring these under management.`));
    }
  } catch (err) {
    spinner.fail(`Failed to switch sets: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
