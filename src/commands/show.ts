import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { Scope } from "../activate.js";
import { getActiveSkillNames } from "../activate.js";
import { loadSuit, suitExists, listSuits } from "../suits.js";
import { ARTIFACT_TYPES, libraryPathForType, getArtifactType } from "../artifact-types.js";
import { SUITS_DIR } from "../paths.js";

/**
 * `suit show <name>` — the full manifest, human-shaped: every component type,
 * per-skill active state, and components that no longer resolve in the
 * library flagged red (the uninstalled-later case).
 */

/** A file component resolves as `<name>` or `<name>.md` in its library section. */
export function resolvesInLibrary(typeId: "skills" | "commands" | "agents" | "rules", name: string): boolean {
  const libDir = libraryPathForType(getArtifactType(typeId));
  return fs.existsSync(path.join(libDir, name)) || fs.existsSync(path.join(libDir, `${name}.md`));
}

export function runShow(name: string, scope: Scope): void {
  if (!suitExists(name)) {
    const available = listSuits();
    throw new Error(
      available.length > 0
        ? `No suit named '${name}'. Available: ${available.join(", ")}`
        : `No suits defined yet. Create one with 'suit tailor ${name}'.`
    );
  }
  const suit = loadSuit(name);
  const components = suit.components ?? {};
  const active = getActiveSkillNames(scope);

  console.log(chalk.bold(`\n${suit.name}`) + (suit.description ? chalk.dim(` — ${suit.description}`) : ""));

  let dangling = 0;
  for (const typeId of ["skills", "commands", "agents", "rules"] as const) {
    const names = components[typeId] ?? [];
    if (names.length === 0) continue;
    console.log(chalk.bold(`\n${ARTIFACT_TYPES[typeId].label}`));
    for (const entry of names) {
      if (!resolvesInLibrary(typeId, entry)) {
        dangling++;
        console.log(`  ${chalk.red("✗")} ${entry} ${chalk.red("— missing from library (uninstalled?)")}`);
      } else if (typeId === "skills") {
        const badge = active.has(entry) ? chalk.green("● on ") : chalk.gray("○ off");
        console.log(`  ${badge} ${entry}`);
      } else {
        console.log(`  ${chalk.green("✓")} ${entry}`);
      }
    }
  }

  const mcp = components.mcp ?? [];
  if (mcp.length > 0) {
    console.log(chalk.bold("\nMCP servers"));
    for (const entry of mcp) {
      const server = entry as Record<string, unknown>;
      const how = typeof server.command === "string" ? server.command : String(server.url ?? "?");
      console.log(`  ${chalk.green("✓")} ${String(server.name ?? "?")} ${chalk.dim(`(${how})`)}`);
    }
  }

  const plugins = components.plugins ?? [];
  if (plugins.length > 0) {
    console.log(chalk.bold("\nPlugins"));
    for (const entry of plugins) {
      const ref = typeof entry === "string" ? entry : String((entry as Record<string, unknown>).ref ?? "?");
      console.log(`  ${chalk.green("✓")} ${ref}`);
    }
  }

  const hooks = components.hooks ?? [];
  if (hooks.length > 0) {
    console.log(chalk.bold("\nHooks") + chalk.dim(" (code-executing — full command shown)"));
    for (const entry of hooks) {
      const hook = entry as Record<string, unknown>;
      console.log(`  ${chalk.yellow("⚡")} ${String(hook.event)}: ${String(hook.command)}`);
    }
  }

  if (Object.keys(components).length === 0) {
    console.log(chalk.dim("  (empty suit)"));
  }
  if (dangling > 0) {
    console.log(
      chalk.red(`\n✗ ${dangling} component(s) no longer resolve — 'suit up' will skip them with a warning.`)
    );
  }
  console.log(
    chalk.dim(`\nEdit skills: suit tailor ${suit.name} · everything else: ${path.join(SUITS_DIR, suit.name, "suit.yaml")}\n`)
  );
}
