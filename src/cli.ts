#!/usr/bin/env node
import meow from "meow";
import chalk from "chalk";
import { runList } from "./commands/list.js";
import { runSets } from "./commands/sets.js";
import { runNew } from "./commands/new.js";
import { runUse } from "./commands/use.js";
import { runUp, runOff } from "./commands/up.js";
import { runEnable, runDisable } from "./commands/toggle.js";
import { runInit } from "./commands/init.js";
import { runAdd, runRemove, runImport } from "./commands/add-remove.js";
import { runCompletion } from "./commands/completion.js";
import { runMigrate } from "./commands/migrate.js";
import type { Scope } from "./activate.js";

const cli = meow(
  `
  ${chalk.bold("Usage")}
    $ suit <command> [args] [--project]

  ${chalk.bold("Commands")}
    migrate                     Relocate legacy ~/.claude/skillsets or ~/.claude/agentsuit to ~/.claude/strongsuit
    init                        Migrate real skill dirs in the active folder into a managed library
    list                        Show every skill in the library and whether it's active
    sets                        Show defined sets and which one (if any) is active
    new <set>                   Interactively pick skills for a new (or existing) set
    up <suit>                   Atomically activate all entries in a suit manifest
    use <set>                   Alias for 'up' (backward compat); activate a set
    off                         Deactivate all managed entries
    enable <skill>              Activate a single skill without changing set membership
    disable <skill>             Deactivate a single skill without changing set membership
    add <set> <skill>           Add a skill to a set's definition
    remove <set> <skill>        Remove a skill from a set's definition
    import <path> [--as name]   Copy an external skill folder into the library
    completion <shell>          Print shell completion script (bash or zsh)

  ${chalk.bold("Flags")}
    --project     Operate on ./.claude/skills instead of ~/.claude/skills
    --as <name>   Used with "import" to rename the skill in the library
    --yes                     Approve every component except code-executing ones (all are still printed)
    --approve-code-execution  Also approve hooks and other code-executing components

  ${chalk.bold("Examples")}
    $ suit init
    $ suit new coding
    $ suit use coding
    $ suit use marketing --project
    $ suit disable pdf
  `,
  {
    importMeta: import.meta,
    flags: {
      project: { type: "boolean", default: false },
      as: { type: "string" },
      yes: { type: "boolean", default: false },
      approveCodeExecution: { type: "boolean", default: false },
    },
  }
);

const scope: Scope = cli.flags.project ? "project" : "user";
const [command, ...args] = cli.input;

function requireArg(value: string | undefined, label: string): asserts value is string {
  if (!value) {
    console.log(chalk.red(`Missing required argument: ${label}`));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  switch (command) {
    case "migrate":
      runMigrate();
      break;
    case "init":
      runInit(scope);
      break;
    case "list":
      runList(scope);
      break;
    case "sets":
      runSets(scope);
      break;
    case "new":
      requireArg(args[0], "set name");
      await runNew(args[0]);
      break;
    case "up":
      requireArg(args[0], "suit name");
      await runUp(args[0], scope, {
        yes: cli.flags.yes,
        approveCodeExecution: cli.flags.approveCodeExecution,
      });
      break;
    case "use":
      // Backward compat: 'use' is an alias for 'up'
      requireArg(args[0], "set/suit name");
      await runUp(args[0], scope, {
        yes: cli.flags.yes,
        approveCodeExecution: cli.flags.approveCodeExecution,
      });
      break;
    case "off":
      await runOff(scope);
      break;
    case "enable":
      requireArg(args[0], "skill name");
      runEnable(args[0], scope);
      break;
    case "disable":
      requireArg(args[0], "skill name");
      runDisable(args[0], scope);
      break;
    case "add":
      requireArg(args[0], "set name");
      requireArg(args[1], "skill name");
      runAdd(args[0], args[1]);
      break;
    case "remove":
      requireArg(args[0], "set name");
      requireArg(args[1], "skill name");
      runRemove(args[0], args[1]);
      break;
    case "import":
      requireArg(args[0], "path");
      runImport(args[0], cli.flags.as);
      break;
    case "completion":
      requireArg(args[0], "shell");
      runCompletion(args[0], args[1]);
      break;
    default:
      cli.showHelp(0);
  }
}

main().catch((err: unknown) => {
  console.error(chalk.red((err as Error).message));
  process.exit(1);
});
