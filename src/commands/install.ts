import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Scope } from "../activate.js";
import { saveSuit } from "../suits.js";
import {
  parseSource,
  fetchToQuarantine,
  loadRemoteSuit,
  copyApprovedToLibrary,
  withoutConflicts,
  assertInstallable,
} from "../install.js";
import {
  buildReviewPlan,
  reviewComponents,
  filterApproved,
  approvedByType,
  recordDecisions,
  summarize,
} from "../review.js";

export interface InstallOptions {
  /** Register the suit under this name instead of the remote's own. */
  as?: string;
  /** Approve every non-RED component without prompting. */
  yes?: boolean;
  /** Also approve RED components. */
  approveCodeExecution?: boolean;
}

/**
 * `suit install <source>` — fetch into quarantine, review, then let only the
 * approved components out. Install registers the suit; it never activates
 * anything. `suit up <name>` remains the only path onto the machine.
 */
export async function runInstall(
  source: string,
  scope: Scope,
  options: InstallOptions = {}
): Promise<void> {
  let quarantine: string | null = null;

  try {
    const parsed = parseSource(source);
    const name = options.as ?? parsed.suggestedName;
    assertInstallable(name);

    console.log(chalk.dim(`Fetching ${parsed.location} into quarantine...`));
    quarantine = fetchToQuarantine(parsed);

    const suit = loadRemoteSuit(quarantine, name);

    // Review runs against quarantine content. Nothing has left it yet.
    const plan = buildReviewPlan(suit, scope, { fileRoot: quarantine });
    if (plan.length === 0) {
      throw new Error(`Remote suit '${name}' has no components; nothing to install.`);
    }

    const decisions = await reviewComponents(plan, {
      yes: options.yes,
      approveCodeExecution: options.approveCodeExecution,
    });

    const approvedCount = decisions.filter((d) => d.approved).length;
    if (approvedCount === 0) {
      console.log(chalk.yellow("Nothing was approved. Nothing was installed."));
      process.exitCode = 1;
      return;
    }

    // Only now does anything leave quarantine — and only what was approved.
    const reviewed = filterApproved(suit, decisions);
    const { copied, identical, conflicts } = copyApprovedToLibrary(
      quarantine,
      approvedByType(decisions)
    );
    const finalSuit = withoutConflicts(reviewed, conflicts);

    saveSuit(finalSuit);
    recordDecisions(name, decisions);

    if (copied.length > 0) {
      console.log(chalk.green(`Into library (${copied.length}): ${copied.join(", ")}`));
    }
    if (identical.length > 0) {
      console.log(chalk.dim(`Already in library, identical (${identical.length}): ${identical.join(", ")}`));
    }
    if (conflicts.length > 0) {
      console.log(
        chalk.yellow(
          `Name taken in library with different content — excluded, local copy kept (${conflicts.length}): ${conflicts.join(", ")}`
        )
      );
    }
    console.log(summarize(decisions));
    console.log(chalk.green(`\nSuit '${finalSuit.name}' installed. Activate with: suit up ${finalSuit.name}`));
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exitCode = 1;
  } finally {
    // Quarantine dies regardless of outcome. On abort this is the whole
    // cleanup: nothing else was written. The root goes too when empty —
    // zero trace means the tree looks as if the install never happened.
    if (quarantine) {
      fs.rmSync(quarantine, { recursive: true, force: true });
      const root = path.dirname(quarantine);
      try {
        if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
      } catch {
        // Root already gone or unreadable; nothing to clean.
      }
    }
  }
}
