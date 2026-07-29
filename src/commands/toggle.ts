import chalk from "chalk";
import { enableSkill, disableSkill } from "../activate.js";
import type { Scope } from "../activate.js";

export function runEnable(skillName: string, scope: Scope): void {
  try {
    enableSkill(skillName, scope);
    console.log(chalk.green(`Enabled "${skillName}" (${scope}).`));
  } catch (err) {
    console.log(chalk.red((err as Error).message));
    process.exitCode = 1;
  }
}

export function runDisable(skillName: string, scope: Scope): void {
  try {
    disableSkill(skillName, scope);
    console.log(chalk.green(`Disabled "${skillName}" (${scope}).`));
  } catch (err) {
    console.log(chalk.red((err as Error).message));
    process.exitCode = 1;
  }
}
