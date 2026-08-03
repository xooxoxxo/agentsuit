import chalk from "chalk";
import type { Scope } from "../activate.js";
import { LIBRARY_DIR } from "../paths.js";
import { restoreInitBackup, listInitBackups } from "../backup.js";

export function runRestore(scope: Scope): void {
  const backups = listInitBackups(scope);
  if (backups.length === 0) {
    console.log(
      chalk.yellow(
        "No init backup exists for this scope. Backups are taken automatically by 'suit init'."
      )
    );
    process.exitCode = 1;
    return;
  }

  const { restored, refused, untouched } = restoreInitBackup(scope, LIBRARY_DIR);

  if (restored.length > 0) {
    console.log(chalk.green(`Restored (${restored.length}): ${restored.join(", ")}`));
  }
  if (refused.length > 0) {
    console.log(
      chalk.yellow(
        `Left alone — changed since the backup was taken (${refused.length}): ${refused.join(", ")}`
      )
    );
  }
  if (untouched.length > 0) {
    console.log(
      chalk.dim(`Not in the backup, untouched (${untouched.length}): ${untouched.join(", ")}`)
    );
  }
  if (restored.length === 0 && refused.length === 0) {
    console.log(chalk.yellow("Backup was empty — nothing to restore."));
  }

  console.log(
    chalk.dim("\nThe library keeps its copies; delete ~/.claude/strongsuit yourself if you are leaving for good.")
  );
}
