import chalk from "chalk";
import type { Scope } from "../activate.js";
import { getActiveSkillNames } from "../activate.js";
import { listLibrarySkills } from "../library.js";
import { loadSets } from "../sets.js";
import { findSuitrc, readSuitrc, latestSessionFor } from "../suitrc.js";
import { offOverrides } from "../skill-overrides.js";
import { externalArrivals } from "./adopt.js";
import { loadSuit, suitExists } from "../suits.js";
import { resolvesInLibrary } from "./show.js";

/**
 * `suit status` — the orientation command. Default: a small dashboard (what
 * am I wearing, what does this directory want, what needs attention).
 * `--short`: one plain line for shell prompts.
 */

const DEFAULT_TOKEN_WARN = 2000;

interface Wearing {
  /** Exact-match suit name, or null when active set matches no suit. */
  suit: string | null;
  activeCount: number;
  totalCount: number;
  activeTokens: number;
}

function detectWearing(scope: Scope): Wearing {
  const skills = listLibrarySkills();
  const active = getActiveSkillNames(scope);
  const activeSkills = skills.filter((s) => active.has(s.name));
  const activeTokens = activeSkills.reduce((sum, s) => sum + s.estTokens, 0);

  let suit: string | null = null;
  for (const [name, members] of Object.entries(loadSets())) {
    if (
      members.length > 0 &&
      activeSkills.length === members.length &&
      members.every((m) => active.has(m))
    ) {
      suit = name;
      break;
    }
  }
  return { suit, activeCount: activeSkills.length, totalCount: skills.length, activeTokens };
}

function shortLine(w: Wearing): string {
  const name = w.suit ?? (w.activeCount > 0 ? "mixed" : "none");
  return `${name} · ${w.activeCount}/${w.totalCount} · ~${w.activeTokens}tok`;
}

export function runStatus(scope: Scope, options: { short?: boolean } = {}): void {
  const wearing = detectWearing(scope);

  if (options.short) {
    console.log(shortLine(wearing));
    return;
  }

  console.log(chalk.bold("\nWearing") + `  ${shortLine(wearing)}`);
  if (wearing.suit === null && wearing.activeCount > 0) {
    console.log(chalk.dim("  Active skills match no suit exactly — one-off toggles or a partial activation."));
  }

  const warnAt = Number(process.env.STRONGSUIT_TOKEN_WARN ?? DEFAULT_TOKEN_WARN);
  if (wearing.activeTokens > warnAt) {
    console.log(
      chalk.yellow(
        `  ~${wearing.activeTokens} tokens of skill descriptions loaded (estimate) — consider a leaner set.`
      )
    );
  }

  const rc = findSuitrc(process.cwd());
  if (rc) {
    try {
      console.log(chalk.bold("Here   ") + `  .suitrc wants '${readSuitrc(rc)}' ${chalk.dim(`(${rc})`)}`);
    } catch (err) {
      console.log(chalk.bold("Here   ") + `  ${chalk.red((err as Error).message)}`);
    }
  } else {
    console.log(chalk.bold("Here   ") + chalk.dim("  no .suitrc — 'suit run <name>' or echo a suit name into .suitrc"));
  }

  const session = latestSessionFor(process.cwd());
  if (session) {
    console.log(
      chalk.bold("Session") +
        `  latest here wore '${session.record.suit}' ${chalk.dim(`(${session.id.slice(0, 8)}, resume with 'suit resume')`)}`
    );
  }

  const attention: string[] = [];
  const activeNames = Array.from(getActiveSkillNames(scope));
  const overridden = offOverrides(activeNames, scope);
  if (overridden.length > 0) {
    attention.push(
      `${overridden.length} linked skill(s) toggled off in Claude Code /skills — 'suit up' clears: ${overridden.join(", ")}`
    );
  }
  const arrivals = externalArrivals(scope);
  if (arrivals.length > 0 && wearing.totalCount > 0) {
    attention.push(`${arrivals.length} external arrival(s) — 'suit adopt': ${arrivals.join(", ")}`);
  }
  if (wearing.suit && suitExists(wearing.suit)) {
    const components = loadSuit(wearing.suit).components ?? {};
    for (const typeId of ["skills", "commands", "agents", "rules"] as const) {
      const missing = (components[typeId] ?? []).filter((n) => !resolvesInLibrary(typeId, n));
      if (missing.length > 0) {
        attention.push(`${typeId} missing from library (uninstalled?): ${missing.join(", ")}`);
      }
    }
  }

  if (attention.length > 0) {
    console.log(chalk.bold("\nNeeds attention"));
    for (const line of attention) console.log(chalk.yellow(`  ⚠ ${line}`));
  }
  console.log();
}
