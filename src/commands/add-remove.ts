import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadSets, saveSets } from "../sets.js";
import { findSkill } from "../library.js";
import { LIBRARY_DIR } from "../paths.js";

export function runAdd(setName: string, skillName: string): void {
  if (!findSkill(skillName)) {
    console.log(chalk.red(`"${skillName}" is not in the library. Run \`suit import <path>\` first.`));
    return;
  }
  const sets = loadSets();
  const current = sets[setName] ?? [];
  if (!current.includes(skillName)) current.push(skillName);
  sets[setName] = current;
  saveSets(sets);
  console.log(chalk.green(`Added "${skillName}" to "${setName}".`));
}

export function runRemove(setName: string, skillName: string): void {
  const sets = loadSets();
  const current = sets[setName];
  if (!current) {
    console.log(chalk.red(`No set named "${setName}".`));
    return;
  }
  sets[setName] = current.filter((s) => s !== skillName);
  saveSets(sets);
  console.log(chalk.green(`Removed "${skillName}" from "${setName}".`));
}

export function runImport(sourcePath: string, asName?: string): void {
  const resolved = path.resolve(sourcePath);
  const skillMd = path.join(resolved, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    console.log(chalk.red(`No SKILL.md found at "${resolved}".`));
    return;
  }

  const name = asName ?? path.basename(resolved);
  const dest = path.join(LIBRARY_DIR, name);
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });

  if (fs.existsSync(dest)) {
    console.log(chalk.red(`"${name}" already exists in the library.`));
    return;
  }

  fs.cpSync(resolved, dest, { recursive: true });
  console.log(chalk.green(`Imported "${name}" into the library.`));
}
