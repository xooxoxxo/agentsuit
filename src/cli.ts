#!/usr/bin/env node
import meow from "meow";
import chalk from "chalk";
import { runList } from "./commands/list.js";
import { runSets } from "./commands/sets.js";
import { runNew } from "./commands/new.js";
import { runTailor } from "./commands/tailor.js";
import { runUse } from "./commands/use.js";
import { runUp, runOff } from "./commands/up.js";
import { runEnable, runDisable } from "./commands/toggle.js";
import { runInit } from "./commands/init.js";
import { runImport } from "./commands/add-remove.js";
import { runCompletion } from "./commands/completion.js";
import { runMigrate } from "./commands/migrate.js";
import { runRestore } from "./commands/restore.js";
import { runInstall } from "./commands/install.js";
import { runSync } from "./commands/sync.js";
import { runRun, runResume } from "./commands/run.js";
import type { Scope } from "./activate.js";

// Everything after a literal `--` is passed through verbatim to the child
// process (suit run) and hidden from meow so its flags are not parsed as ours.
const rawArgv = process.argv.slice(2);
const ddIndex = rawArgv.indexOf("--");
const passthrough = ddIndex === -1 ? [] : rawArgv.slice(ddIndex + 1);
const ownArgv = ddIndex === -1 ? rawArgv : rawArgv.slice(0, ddIndex);

const cli = meow(
  `
  ${chalk.bold("Usage")}
    $ suit <command> [args] [--project]

  ${chalk.bold("The closet")} — what you own
    install <source> [--yes]    Fetch a remote suit (owner/repo[@ref], URL, dir) through quarantine + review
    import <path> [--as name]   Copy a local skill folder into the library
    list                        Show every skill in the library and whether it's active

  ${chalk.bold("The tailor")} — shaping suits
    tailor <suit> [flags]       THE edit command: interactive picker, or --skills a,b / --add x --remove y
    sets                        Show defined suits and which one (if any) is active

  ${chalk.bold("Wear globally")} — your default outfit, every new session
    up <suit>                   Atomically activate all entries in a suit manifest
    off                         Deactivate all managed entries
    sync <suit>                 Re-fetch an installed suit; changed components blocked until re-reviewed
    enable/disable <skill>      One-off toggle without changing any suit

  ${chalk.bold("Wear for one session")} — one meeting, nothing global changes
    run [suit] [-- <args>]      Launch one Claude session wearing the suit (or the nearest .suitrc one)
    resume [session-id]         Resume a conversation re-dressed in the suit it was born with

  ${chalk.bold("Safety")}
    init                        One-time: adopt existing skills into the library (backup taken first)
    restore                     Put the active skills dir back to its pre-init state
    migrate                     Relocate a legacy skillsets/agentsuit root to strongsuit
    completion <shell>          Print shell completion (bash or zsh)

  ${chalk.bold("Aliases")} (older names, still work)
    new <set> [--skills a,b]    = tailor    ·    use <set> = up    ·    add/remove <set> <skill> = tailor --add/--remove

  ${chalk.bold("Flags")}
    --project     Operate on ./.claude/* instead of ~/.claude/*
    --skills a,b,c            tailor/new: replace the suit's skill list (validated, no prompt)
    --add a,b / --remove c    tailor: merge changes into the skill list
    --as <name>   import: rename the skill in the library
    --yes                     Approve reviewed remote components except code-executing ones
    --approve-code-execution  Also approve hooks and other code-executing components
    --continue                run: resume the latest suit-launched session here

  ${chalk.bold("Examples")}
    $ suit init
    $ suit tailor coding --skills docx,pptx
    $ suit up coding                  # default outfit
    $ suit run writing -- -p "draft"  # one session only
    $ echo coding > .suitrc && suit run
  `,
  {
    importMeta: import.meta,
    argv: ownArgv,
    flags: {
      project: { type: "boolean", default: false },
      as: { type: "string" },
      yes: { type: "boolean", default: false },
      approveCodeExecution: { type: "boolean", default: false },
      continue: { type: "boolean", default: false },
      skills: { type: "string" },
      add: { type: "string" },
      remove: { type: "string" },
    },
  }
);

const scope: Scope = cli.flags.project ? "project" : "user";
const [command, ...args] = cli.input;

function splitList(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
    case "restore":
      runRestore(scope);
      break;
    case "list":
      runList(scope);
      break;
    case "sets":
      runSets(scope);
      break;
    case "tailor":
    case "new":
      requireArg(args[0], "suit name");
      await runTailor(args[0], {
        skills: splitList(cli.flags.skills),
        add: splitList(cli.flags.add) ?? [],
        remove: splitList(cli.flags.remove) ?? [],
      });
      break;
    case "install":
      requireArg(args[0], "source");
      await runInstall(args[0], scope, {
        as: cli.flags.as,
        yes: cli.flags.yes,
        approveCodeExecution: cli.flags.approveCodeExecution,
      });
      break;
    case "sync":
      requireArg(args[0], "suit name");
      await runSync(args[0], scope, {
        yes: cli.flags.yes,
        approveCodeExecution: cli.flags.approveCodeExecution,
      });
      break;
    case "run":
      process.exitCode = await runRun(args[0], passthrough, { continue: cli.flags.continue });
      break;
    case "resume":
      process.exitCode = await runResume(args[0], passthrough);
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
      requireArg(args[0], "suit name");
      requireArg(args[1], "skill name");
      await runTailor(args[0], { add: [args[1]] });
      break;
    case "remove":
      requireArg(args[0], "suit name");
      requireArg(args[1], "skill name");
      await runTailor(args[0], { remove: [args[1]] });
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
