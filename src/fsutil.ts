import fs from "node:fs";
import path from "node:path";

/** realpathSync that returns null instead of throwing on a missing/broken path. */
export function resolveSafe(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** lstatSync that returns null instead of throwing. Never follows symlinks. */
export function lstatOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/**
 * True when `child` sits under `parent`. Both should already be realpath-resolved,
 * since on macOS paths like /tmp and /var are themselves symlinks.
 */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Resolves only the FIRST hop of a symlink, with its parent directory realpath'd.
 *
 * This matters because library entries for externally-owned skills are themselves
 * symlinks, so an active link forms a chain: active/x -> library/x -> /elsewhere/x.
 * Fully resolving that chain reports /elsewhere and makes a link this tool created
 * look unmanaged. Only the first hop tells us who owns the link.
 */
export function immediateTarget(linkPath: string): string | null {
  let raw: string;
  try {
    raw = fs.readlinkSync(linkPath);
  } catch {
    return null;
  }
  const abs = path.isAbsolute(raw) ? raw : path.resolve(path.dirname(linkPath), raw);
  const parentReal = resolveSafe(path.dirname(abs));
  return parentReal === null ? abs : path.join(parentReal, path.basename(abs));
}

/**
 * Creates a symlink or junction. On Windows, uses 'junction' for better compatibility
 * when Developer Mode is unavailable; on POSIX systems uses 'dir'-style symlinks.
 * Target is resolved to absolute path before linking to ensure junctions point correctly.
 *
 * Wraps EPERM/EACCES failures with actionable guidance (mention Developer Mode on Windows).
 */
export function linkDir(target: string, linkPath: string): void {
  // Resolve target to absolute path for consistency (especially important for junctions on Windows).
  const absTarget = path.isAbsolute(target) ? target : path.resolve(target);

  const type = process.platform === "win32" ? "junction" : "dir";
  try {
    fs.symlinkSync(absTarget, linkPath, type);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EPERM" || e.code === "EACCES") {
      throw new Error(
        `Failed to create link "${linkPath}": permission denied. ` +
          (process.platform === "win32"
            ? "On Windows, either enable Developer Mode (Settings > Privacy & Security > Developer Mode) or run as Administrator."
            : "Try running with elevated privileges or check directory permissions.")
      );
    }
    throw err;
  }
}
