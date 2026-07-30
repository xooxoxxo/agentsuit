import chalk from "chalk";
import { loadSets } from "../sets.js";
import { getActiveSkillNames } from "../activate.js";
import type { Scope } from "../activate.js";

export function runSets(scope: Scope): void {
  const sets = loadSets();
  const names = Object.keys(sets);

  if (names.length === 0) {
    console.log(chalk.yellow("No sets defined yet. Run `suit new <name>` to create one."));
    return;
  }

  const active = getActiveSkillNames(scope);

  console.log(chalk.bold("\nDefined sets\n"));
  for (const name of names) {
    const skills = sets[name];
    const isCurrentlyActive =
      skills.length > 0 && active.size === skills.length && skills.every((s) => active.has(s));
    const marker = isCurrentlyActive ? chalk.green(" (currently active)") : "";
    console.log(`${chalk.bold.cyan(name)}${marker}`);
    console.log(`  ${skills.length ? skills.join(", ") : chalk.dim("(empty)")}`);
  }
  console.log();
}
