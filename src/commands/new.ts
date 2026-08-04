import inquirer from "inquirer";
import chalk from "chalk";
import { listLibrarySkills } from "../library.js";
import { loadSets, saveSets } from "../sets.js";

export interface NewOptions {
  /** Comma-split skill names for non-interactive set definition. */
  skills?: string[];
  /** Test seam; defaults to whether stdin is a TTY. */
  interactive?: boolean;
}

export async function runNew(setName: string, options: NewOptions = {}): Promise<void> {
  const skills = listLibrarySkills();

  if (options.skills) {
    // Non-interactive path: --skills names the full set, validated against the
    // library. Passing the flag IS the overwrite consent — no prompt.
    const known = new Set(skills.map((s) => s.name));
    const unknown = options.skills.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown skill(s): ${unknown.join(", ")}. ` +
          (skills.length === 0
            ? "The library is empty — run 'suit init' first."
            : `The library has: ${skills.map((s) => s.name).join(", ")}`)
      );
    }
    const sets = loadSets();
    sets[setName] = options.skills;
    saveSets(sets);
    console.log(chalk.green(`Saved set "${setName}" with ${options.skills.length} skill(s).`));
    return;
  }

  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
  if (!interactive) {
    throw new Error(
      `'suit new' needs a terminal to pick skills interactively. ` +
        `In scripts, pass the full list: suit new ${setName} --skills a,b,c`
    );
  }

  if (skills.length === 0) {
    console.log(chalk.yellow("Library is empty — run `suit init` first."));
    return;
  }

  const sets = loadSets();
  if (sets[setName]) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: "confirm",
        name: "overwrite",
        message: `Set "${setName}" already exists with ${sets[setName].length} skill(s). Edit it?`,
        default: true,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  const { chosen } = await inquirer.prompt<{ chosen: string[] }>([
    {
      type: "checkbox",
      name: "chosen",
      message: `Select skills for set "${setName}":`,
      pageSize: 15,
      choices: skills.map((s) => ({
        name: `${s.name}  ${chalk.dim(`(~${s.estTokens}tok)`)} \u2014 ${truncate(s.description, 70)}`,
        value: s.name,
        checked: sets[setName]?.includes(s.name) ?? false,
      })),
    },
  ]);

  sets[setName] = chosen;
  saveSets(sets);
  console.log(chalk.green(`\nSaved set "${setName}" with ${chosen.length} skill(s).`));
  console.log(chalk.dim(`Run \`suit use ${setName}\` to activate it.`));
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}
