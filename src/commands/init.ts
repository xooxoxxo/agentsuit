import chalk from "chalk";
import { initMigrate } from "../activate.js";
import { LIBRARY_DIR } from "../paths.js";
import type { Scope } from "../activate.js";
import { createInitBackup } from "../backup.js";

export function runInit(scope: Scope): void {
  // Snapshot before anything moves. init deletes each real skill directory
  // after copying it into the library; the snapshot is what lets
  // 'suit restore' undo that instead of the change being one-directional.
  const backup = createInitBackup(scope);
  if (backup) {
    console.log(chalk.dim(`Backup of ${backup.entries.length} entries taken: ${backup.dir}`));
  }

  const { migrated, adopted, alreadyManaged, broken, conflicts } = initMigrate(scope, LIBRARY_DIR);

  if (migrated.length > 0) {
    console.log(chalk.green(`Copied into library and linked (${migrated.length}): ${migrated.join(", ")}`));
  }
  if (adopted.length > 0) {
    console.log(
      chalk.green(`Adopted external skills, left in place (${adopted.length}): ${adopted.join(", ")}`)
    );
  }
  if (alreadyManaged.length > 0) {
    console.log(chalk.dim(`Already managed (${alreadyManaged.length}): ${alreadyManaged.join(", ")}`));
  }
  if (broken.length > 0) {
    console.log(chalk.yellow(`Broken links, target missing (${broken.length}): ${broken.join(", ")}`));
  }
  if (conflicts.length > 0) {
    console.log(
      chalk.red(
        `Name already taken in library, skipped (${conflicts.length}): ${conflicts.join(", ")}`
      )
    );
  }
  if (migrated.length + adopted.length + alreadyManaged.length === 0) {
    console.log(chalk.yellow("Nothing to manage \u2014 active skills dir is empty."));
  }

  console.log(chalk.dim(`\nLibrary lives at: ${LIBRARY_DIR}`));
  if (backup) {
    console.log(chalk.dim(`To return to the pre-init layout: suit restore`));
  }
}
