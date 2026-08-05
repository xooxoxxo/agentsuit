import path from "node:path";
import chalk from "chalk";
import { listLibrarySkills } from "../library.js";
import { loadSets, saveSets } from "../sets.js";
import { SUITS_DIR } from "../paths.js";
import { runNew } from "./new.js";

/**
 * `suit tailor <name>` — the one create/edit verb for a suit's skill list.
 * Interactive picker (pre-checked with current members) when no flags; for
 * scripts: `--skills a,b,c` replaces the list, `--add`/`--remove` merge.
 * `new`, `add`, `remove` remain as quiet aliases onto this.
 */

export interface TailorOptions {
  /** Replace the whole skill list. Mutually exclusive with add/remove. */
  skills?: string[];
  add?: string[];
  remove?: string[];
  /** Test seam; defaults to process.stdin.isTTY. */
  interactive?: boolean;
}

export async function runTailor(name: string, options: TailorOptions = {}): Promise<void> {
  const { skills, add = [], remove = [] } = options;

  if (skills && (add.length > 0 || remove.length > 0)) {
    throw new Error("--skills replaces the whole list; combine it with --add/--remove and the result is ambiguous. Use one or the other.");
  }

  // Full replace and the interactive picker are exactly what `new` does.
  if (skills) return runNew(name, { skills });
  if (add.length === 0 && remove.length === 0) {
    await runNew(name, { interactive: options.interactive });
    console.log(chalk.dim(`MCP servers, plugins and hooks: edit ${path.join(SUITS_DIR, name, "suit.yaml")}`));
    return;
  }

  const known = new Set(listLibrarySkills().map((s) => s.name));
  const unknown = add.filter((n) => !known.has(n));
  if (unknown.length > 0) {
    throw new Error(
      `Cannot add unknown skill(s): ${unknown.join(", ")}. ` +
        (known.size === 0
          ? "The library is empty — run 'suit init' first."
          : `The library has: ${Array.from(known).sort().join(", ")}`)
    );
  }

  const sets = loadSets();
  const current = new Set(sets[name] ?? []);
  const missingRemovals = remove.filter((n) => !current.has(n));
  for (const n of add) current.add(n);
  for (const n of remove) current.delete(n);
  sets[name] = Array.from(current);
  saveSets(sets);

  console.log(chalk.green(`Tailored "${name}": ${sets[name].length} skill(s).`));
  if (missingRemovals.length > 0) {
    console.log(chalk.dim(`  (not in the suit anyway: ${missingRemovals.join(", ")})`));
  }
}
