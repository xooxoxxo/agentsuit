import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Scope } from "../activate.js";
import { loadSuit, saveSuit, type SuitManifest } from "../suits.js";
import { readLock, pinSuit, verifyAgainstLock, driftDiff } from "../lock.js";
import { fetchToQuarantine, loadRemoteSuit, copyApprovedToLibrary, FILE_COMPONENT_TYPES } from "../install.js";
import { buildReviewPlan, reviewComponents, approvedByType, recordDecisions, type Decision } from "../review.js";
import { ARTIFACT_TYPES, libraryPathForType } from "../artifact-types.js";

export interface SyncOptions {
  yes?: boolean;
  approveCodeExecution?: boolean;
}

/**
 * `suit sync <name>` — re-fetch an installed suit's source and reconcile with
 * the lock. Unchanged components are silent. Changed ones are blocked and put
 * through a delta review: only what drifted is shown, with a diff against
 * what was approved. Approval re-pins and updates the library copy; anything
 * else stays exactly as it was.
 */
export async function runSync(name: string, scope: Scope, options: SyncOptions = {}): Promise<void> {
  let quarantine: string | null = null;

  try {
    const locked = readLock().suits[name];
    if (!locked?.source) {
      throw new Error(
        `Suit '${name}' has no recorded source — it was not installed from a remote, so there is nothing to sync.`
      );
    }
    loadSuit(name); // fails early if the suit itself is gone

    console.log(chalk.dim(`Fetching ${locked.source}${locked.ref ? `@${locked.ref}` : ""}...`));
    quarantine = fetchToQuarantine({
      kind: locked.source.startsWith("/") || fs.existsSync(locked.source) ? "path" : "git",
      location: locked.source,
      ...(locked.ref ? { ref: locked.ref } : {}),
      suggestedName: name,
    });

    const remote = loadRemoteSuit(quarantine, name);
    const plan = buildReviewPlan(remote, scope, { fileRoot: quarantine });
    const verified = verifyAgainstLock(name, plan);

    const unchanged = verified.filter((v) => v.state === "unchanged");
    const drifted = verified.filter((v) => v.state !== "unchanged");

    if (drifted.length === 0) {
      console.log(chalk.green(`'${name}' is up to date — ${unchanged.length} pinned components unchanged.`));
      return;
    }

    console.log(
      chalk.yellow(
        `${drifted.length} component${drifted.length === 1 ? "" : "s"} changed upstream; ${unchanged.length} unchanged (silent).`
      )
    );
    for (const entry of drifted) {
      if (entry.pinned) {
        console.log(chalk.red(`\n⛔ ${entry.item.type}: ${entry.item.id} — drifted from its approved content:`));
        console.log(driftDiff(entry.pinned.detail, entry.item.detail));
      } else {
        console.log(chalk.yellow(`\nNew upstream component: ${entry.item.type}: ${entry.item.id}`));
      }
    }

    // Delta review: only the drift is decided on. Same rule as `suit up`:
    // --yes never re-approves content that drifted from a pin — that is
    // exactly what it drifted from. Only components upstream added fresh
    // (never pinned) may ride --yes; pinned-but-changed needs a human.
    const decisions: Decision[] = [];
    const needHuman = [];
    for (const entry of drifted) {
      if (entry.pinned && options.yes) {
        decisions.push({ item: entry.item, approved: false });
      } else {
        needHuman.push(entry.item);
      }
    }
    if (needHuman.length > 0) {
      decisions.push(
        ...(await reviewComponents(needHuman, {
          yes: options.yes,
          approveCodeExecution: options.approveCodeExecution,
        }))
      );
    }

    const approvedFileNames = approvedByType(decisions.filter((d) => d.approved));
    // Replace approved file components in the library with the re-reviewed
    // remote content. The old copy was pinned to an approval superseded by
    // this one; the new one was just approved in this exact form.
    for (const typeId of FILE_COMPONENT_TYPES) {
      for (const id of approvedFileNames[typeId] ?? []) {
        const dest = path.join(libraryPathForType(ARTIFACT_TYPES[typeId]), id);
        fs.rmSync(dest, { recursive: true, force: true });
      }
    }
    const { copied } = copyApprovedToLibrary(quarantine, approvedFileNames);

    // The manifest is merged per decision, never taken from the remote
    // wholesale — wholesale would put rejected MCP or hook config into the
    // manifest, where the next `suit up --yes` could activate it.
    //   unchanged           → remote entry (identical to what was approved)
    //   drift, re-approved  → remote entry
    //   drift, rejected     → the old entry stays; v1 remains approved.
    //                         Rejecting v2 does not unapprove v1.
    //   new, rejected       → dropped entirely
    const approvedKeys = new Set(
      decisions.filter((d) => d.approved).map((d) => `${d.item.type}#${d.item.id}`)
    );
    const oldSuit = loadSuit(name);
    const oldByKey = new Map(
      buildReviewPlan(oldSuit, scope).map((i) => [`${i.type}#${i.id}`, i.source])
    );
    const components: Record<string, unknown[]> = {};
    for (const entry of verified) {
      const key = `${entry.item.type}#${entry.item.id}`;
      let sourceEntry: unknown;
      if (entry.state === "unchanged" || approvedKeys.has(key)) {
        sourceEntry = entry.item.source;
      } else if (entry.pinned) {
        sourceEntry = oldByKey.get(key);
      } else {
        continue;
      }
      if (sourceEntry !== undefined) {
        (components[entry.item.type] ??= []).push(sourceEntry);
      }
    }

    saveSuit({ ...oldSuit, components: components as SuitManifest["components"] });
    recordDecisions(name, decisions);
    // Only approvals are pinned. A rejected drift must not withdraw the v1
    // pin — the old content is still approved and still activatable.
    pinSuit(name, decisions.filter((d) => d.approved));

    const approved = decisions.filter((d) => d.approved).length;
    if (copied.length > 0) console.log(chalk.green(`Updated in library: ${copied.join(", ")}`));
    console.log(
      chalk.green(`\nSync done: ${approved} re-approved, ${decisions.length - approved} blocked, ${unchanged.length} unchanged.`)
    );
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exitCode = 1;
  } finally {
    if (quarantine) {
      fs.rmSync(quarantine, { recursive: true, force: true });
      const root = path.dirname(quarantine);
      try {
        if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
      } catch {
        // Root already gone; nothing to clean.
      }
    }
  }
}
