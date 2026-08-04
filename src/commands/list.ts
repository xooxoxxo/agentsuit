import chalk from "chalk";
import { listLibrarySkills } from "../library.js";
import { getActiveSkillNames } from "../activate.js";
import type { Scope } from "../activate.js";
import { printOnboarding } from "../onboarding.js";
import { offOverrides } from "../skill-overrides.js";

export function runList(scope: Scope): void {
  const skills = listLibrarySkills();
  const active = getActiveSkillNames(scope);
  const overridden = new Set(offOverrides(skills.map((s) => s.name), scope));

  if (skills.length === 0) {
    printOnboarding(scope);
    return;
  }

  console.log(chalk.bold(`\nSkill library (${scope} scope)\n`));
  for (const skill of skills) {
    const badge = skill.broken
      ? chalk.red("\u2715 bad")
      : active.has(skill.name) && overridden.has(skill.name)
        ? chalk.yellow("⊘ ovr")
        : active.has(skill.name)
          ? chalk.green("\u25cf on ")
          : chalk.gray("\u25cb off");

    const tags = [
      skill.external && !skill.broken ? chalk.blue(" [external]") : "",
      skill.disableModelInvocation ? chalk.magenta(" [manual-only]") : "",
    ].join("");

    console.log(`${badge}  ${chalk.cyan(skill.name.padEnd(28))} ~${skill.estTokens}tok${tags}`);
    console.log(chalk.dim(`        ${truncate(skill.description, 100)}`));
  }

  const activeSkills = skills.filter((s) => active.has(s.name));
  const activeTokens = activeSkills.reduce((sum, s) => sum + s.estTokens, 0);
  const totalTokens = skills.reduce((sum, s) => sum + s.estTokens, 0);

  console.log(
    chalk.bold(
      `\n${activeSkills.length}/${skills.length} active, ~${activeTokens} of ~${totalTokens} tokens loaded\n`
    )
  );

  const contradicted = skills.filter((s) => active.has(s.name) && overridden.has(s.name));
  if (contradicted.length > 0) {
    console.log(
      chalk.yellow(
        `⊘ ${contradicted.length} linked skill(s) are toggled off in Claude Code /skills and will not load — activating them via 'suit up'/'suit enable' clears the toggle.\n`
      )
    );
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}
