import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { STRONGSUIT_DIR } from "./paths.js";
import { ARTIFACT_TYPES, libraryPathForType } from "./artifact-types.js";
import { loadSuitFrom, suitExists, type SuitManifest } from "./suits.js";

/**
 * Remote install mechanics. One invariant above all others: nothing from a
 * remote exists outside the quarantine directory until it has been reviewed
 * and approved. The library, the suits dir and the active dirs never see
 * unreviewed bytes; an abort at any point leaves zero trace.
 */

export const FILE_COMPONENT_TYPES = ["skills", "commands", "agents", "rules"] as const;

/** Where a source's content lands before review. */
export function quarantineRoot(): string {
  return path.join(STRONGSUIT_DIR, "quarantine");
}

export interface ParsedSource {
  kind: "path" | "git";
  /** Local directory, or clonable URL. */
  location: string;
  /** Branch or tag for git sources. */
  ref?: string;
  /** Suggested suit name derived from the source. */
  suggestedName: string;
}

/**
 * Understands three source forms:
 * - an existing local directory (fixtures, `--from-path` workflows)
 * - `owner/repo[@ref]` GitHub shorthand
 * - a full clonable URL (https or ssh), passed to git verbatim
 */
export function parseSource(source: string): ParsedSource {
  if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
    return {
      kind: "path",
      location: source,
      suggestedName: path.basename(path.resolve(source)),
    };
  }

  const shorthand = /^([\w.-]+)\/([\w.-]+?)(?:@([\w./-]+))?$/.exec(source);
  if (shorthand) {
    const [, owner, repo, ref] = shorthand;
    return {
      kind: "git",
      location: `https://github.com/${owner}/${repo}.git`,
      ...(ref ? { ref } : {}),
      suggestedName: repo,
    };
  }

  if (/^(https?:\/\/|git@)/.test(source)) {
    const base = path.basename(source).replace(/\.git$/, "");
    return { kind: "git", location: source, suggestedName: base };
  }

  throw new Error(
    `Cannot understand source '${source}'. Use owner/repo[@ref], a git URL, or a local directory.`
  );
}

/** Runs a command; injectable so tests never touch the network. */
export type GitRunner = (args: string[]) => { status: number; stdout: string };

function realGit(args: string[]): { status: number; stdout: string } {
  const result = spawnSync("git", args, { encoding: "utf-8" });
  return { status: result.status ?? 1, stdout: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

let gitRunner: GitRunner = realGit;

/** Replaces the git runner. Pass null to restore the real one. */
export function setGitRunner(runner: GitRunner | null): void {
  gitRunner = runner ?? realGit;
}

/**
 * Fetches a source into a fresh quarantine directory and returns its path.
 * Local directories are copied (symlinks verbatim); git sources are
 * shallow-cloned.
 */
export function fetchToQuarantine(parsed: ParsedSource): string {
  const dir = path.join(
    quarantineRoot(),
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${parsed.suggestedName}`
  );
  fs.mkdirSync(dir, { recursive: true });

  if (parsed.kind === "path") {
    fs.cpSync(parsed.location, dir, { recursive: true, verbatimSymlinks: true });
    return dir;
  }

  const args = ["clone", "--depth", "1", "--quiet"];
  if (parsed.ref) args.push("--branch", parsed.ref);
  args.push(parsed.location, dir);

  const result = gitRunner(args);
  if (result.status !== 0) {
    // Clean the empty/partial dir now; the caller's finally would also get
    // it, but a failed fetch should not depend on that.
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `git clone failed (exit ${result.status}) for ${parsed.location}${parsed.ref ? `@${parsed.ref}` : ""}:\n${result.stdout.trim()}`
    );
  }
  return dir;
}

/**
 * Loads and validates the remote manifest, and confirms every file component
 * it references actually exists in the quarantine. A manifest that points at
 * missing content is malformed — better to say so before review than to show
 * a reviewer an empty placeholder.
 */
export function loadRemoteSuit(quarantineDir: string, asName?: string): SuitManifest {
  const suit = loadSuitFrom(quarantineDir);
  const named = asName ? { ...suit, name: asName } : suit;

  const missing: string[] = [];
  for (const typeId of FILE_COMPONENT_TYPES) {
    for (const name of named.components?.[typeId] ?? []) {
      if (!fs.existsSync(path.join(quarantineDir, typeId, name))) {
        missing.push(`${typeId}/${name}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Malformed remote suit '${named.name}': the manifest references content the repo does not contain: ${missing.join(", ")}`
    );
  }
  return named;
}

/** Byte-level equality of two directory trees (symlinks compared by target). */
function sameTree(a: string, b: string): boolean {
  const la = fs.lstatSync(a);
  const lb = fs.lstatSync(b);
  if (la.isSymbolicLink() || lb.isSymbolicLink()) {
    return (
      la.isSymbolicLink() &&
      lb.isSymbolicLink() &&
      fs.readlinkSync(a) === fs.readlinkSync(b)
    );
  }
  if (la.isDirectory() !== lb.isDirectory()) return false;
  if (!la.isDirectory()) {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  }
  const ea = fs.readdirSync(a).sort();
  const eb = fs.readdirSync(b).sort();
  if (ea.join("\n") !== eb.join("\n")) return false;
  return ea.every((name) => sameTree(path.join(a, name), path.join(b, name)));
}

export interface CopyResult {
  /** Components copied into the library. */
  copied: string[];
  /** Already in the library with identical content; nothing to do. */
  identical: string[];
  /**
   * Name exists in the library with different content. The local copy wins —
   * a remote must never overwrite it — and the component is excluded, because
   * activating it would run content other than what was reviewed.
   */
  conflicts: string[];
}

/**
 * Copies approved file components from quarantine into the library.
 * Only names in `approved` move; everything else stays in quarantine and
 * dies with it.
 */
export function copyApprovedToLibrary(
  quarantineDir: string,
  approved: Record<string, string[] | undefined>
): CopyResult {
  const copied: string[] = [];
  const identical: string[] = [];
  const conflicts: string[] = [];

  for (const typeId of FILE_COMPONENT_TYPES) {
    const names = approved[typeId] ?? [];
    if (names.length === 0) continue;
    const libraryDir = libraryPathForType(ARTIFACT_TYPES[typeId]);
    fs.mkdirSync(libraryDir, { recursive: true });

    for (const name of names) {
      const src = path.join(quarantineDir, typeId, name);
      const dest = path.join(libraryDir, name);
      const label = `${typeId}/${name}`;

      if (fs.existsSync(dest)) {
        if (sameTree(src, dest)) identical.push(label);
        else conflicts.push(label);
        continue;
      }
      fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
      copied.push(label);
    }
  }

  return { copied, identical, conflicts };
}

/** Drops conflicted file components from a manifest so what activates is what was reviewed. */
export function withoutConflicts(suit: SuitManifest, conflicts: string[]): SuitManifest {
  if (conflicts.length === 0) return suit;
  const exclude = new Set(conflicts);
  const components = { ...suit.components };
  for (const typeId of FILE_COMPONENT_TYPES) {
    const names = components[typeId];
    if (!names) continue;
    components[typeId] = names.filter((name) => !exclude.has(`${typeId}/${name}`));
  }
  return { ...suit, components };
}

/** Guard used by runInstall before anything is fetched. */
export function assertInstallable(name: string): void {
  if (suitExists(name)) {
    throw new Error(
      `A suit named '${name}' already exists. Pick another name with --as, or delete the existing suit first.`
    );
  }
}
