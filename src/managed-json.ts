import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Ledger, type LedgerEntry } from "./ledger.js";

/**
 * Entry to set in a JSON file
 */
export interface SetEntry {
  /** Path to the value: array ["root", "nested"] or dotted "root.nested" */
  jsonPath: string | string[];
  /** Value to set */
  value: unknown;
}

/**
 * Conflict detected when trying to write a foreign-edited key
 */
export interface Conflict {
  /** File path */
  file: string;
  /** Path to the value */
  jsonPath: string | string[];
  /** Current hash in the file */
  currentHash: string;
  /** Hash we expected from ledger */
  expectedHash: string;
}

/**
 * Result of a setEntries operation
 */
export interface SetResult {
  /** Number of entries set */
  count: number;
  /** Conflicts detected (key was foreign-edited, not overwritten) */
  conflicts: Conflict[];
}

/**
 * Manages JSON files with ownership tracking via ledger.
 * Implements atomic writes, foreign-edit detection, and safe removal.
 */
export class ManagedJson {
  private ledger: Ledger;
  private root: string;
  private backupsDir: string;
  private backedUpFiles: Set<string> = new Set();

  constructor(ledgerPath: string, backupsDir: string) {
    this.ledger = new Ledger(ledgerPath);
    this.root = path.dirname(ledgerPath);
    this.backupsDir = backupsDir;
  }

  /**
   * Check if ledger is corrupted (read-only mode)
   */
  isReadOnly(): boolean {
    return this.ledger.isCorrupted();
  }

  /**
   * Set entries in a JSON file. Detects foreign edits, preserves unmapped keys.
   * @param file File path (absolute or relative to root)
   * @param entries Array of {jsonPath, value} to set
   * @param suit Suit name performing this operation
   * @returns {count, conflicts}
   * @throws If ledger is corrupted or file operation fails
   */
  setEntries(file: string, entries: SetEntry[], suit: string): SetResult {
    if (this.ledger.isCorrupted()) {
      throw new Error(
        `Ledger is corrupted (${path.join(this.root, "ledger.json")}); read-only mode active. Cannot write.`
      );
    }

    const absPath = this.resolvePath(file);
    let current: unknown = {};

    // Re-read file before writing
    if (fs.existsSync(absPath)) {
      try {
        const content = fs.readFileSync(absPath, "utf-8");
        current = JSON.parse(content);
      } catch {
        current = {};
      }
    }

    const conflicts: Conflict[] = [];
    const updates: Map<string, { value: unknown; pathArray: string[] }> = new Map();

    // Check for foreign edits and collect updates
    for (const { jsonPath, value } of entries) {
      const pathArray = this.normalizePath(jsonPath);
      const ledgerEntry = this.ledger.get(absPath, pathArray);

      // If we own this key, check if it's been foreign-edited
      if (ledgerEntry) {
        const currentValue = this.getNestedValue(current, pathArray);
        const currentHash = hashValue(currentValue);
        if (currentHash !== ledgerEntry.valueHash) {
          conflicts.push({
            file: absPath,
            jsonPath: pathArray,
            currentHash,
            expectedHash: ledgerEntry.valueHash,
          });
          continue; // Don't overwrite foreign-edited key
        }
      }

      updates.set(this.pathKey(pathArray), { value, pathArray });
    }

    if (conflicts.length > 0 && updates.size === 0) {
      return { count: 0, conflicts };
    }

    // Create backup on first touch
    this.ensureBackup(absPath);

    // Apply updates to current
    for (const update of updates.values()) {
      this.setNestedValue(current, update.pathArray, update.value);
    }

    // Atomic write
    this.atomicWrite(absPath, current);

    // Record in ledger
    for (const update of updates.values()) {
      this.ledger.record(absPath, update.pathArray, update.value, suit, false);
    }
    this.ledger.save();

    return { count: updates.size, conflicts };
  }

  /**
   * Remove entries from a JSON file. Prunes empty parents only if agentsuit created them.
   * @param file File path
   * @param jsonPaths Array of paths to remove
   * @throws If ledger is corrupted
   */
  removeEntries(file: string, jsonPaths: (string | string[])[]): void {
    if (this.ledger.isCorrupted()) {
      throw new Error(
        `Ledger is corrupted (${path.join(this.root, "ledger.json")}); read-only mode active. Cannot write.`
      );
    }

    const absPath = this.resolvePath(file);
    if (!fs.existsSync(absPath)) {
      return;
    }

    let current: unknown;
    try {
      const content = fs.readFileSync(absPath, "utf-8");
      current = JSON.parse(content);
    } catch {
      return;
    }

    // Check for foreign edits
    const toRemove: string[][] = [];
    for (const jsonPath of jsonPaths) {
      const pathArray = this.normalizePath(jsonPath);
      const ledgerEntry = this.ledger.get(absPath, pathArray);

      if (ledgerEntry) {
        const currentValue = this.getNestedValue(current, pathArray);
        const currentHash = hashValue(currentValue);
        if (currentHash !== ledgerEntry.valueHash) {
          // Foreign-edited; don't remove
          continue;
        }
      }

      toRemove.push(pathArray);
    }

    // Remove entries and prune empty parents
    for (const pathArray of toRemove) {
      this.removeNestedValue(current, pathArray);

      // Prune empty parents only if agentsuit created them
      const ledgerEntry = this.ledger.get(absPath, pathArray);
      if (ledgerEntry?.createdParent) {
        this.pruneEmptyParents(current, pathArray);
      }

      this.ledger.remove(absPath, pathArray);
    }

    // Atomic write
    this.atomicWrite(absPath, current);
    this.ledger.save();
  }

  /**
   * Get ledger entries for a file
   */
  getLedgerEntries(file: string): LedgerEntry[] {
    const absPath = this.resolvePath(file);
    return this.ledger.getForFile(absPath);
  }

  // Private helpers

  private resolvePath(file: string): string {
    if (path.isAbsolute(file)) return file;
    return path.join(this.root, file);
  }

  private normalizePath(jsonPath: string | string[]): string[] {
    if (typeof jsonPath === "string") {
      return jsonPath.split(".");
    }
    return jsonPath;
  }

  private pathKey(pathArray: string[]): string {
    return pathArray.join(".");
  }

  private getNestedValue(obj: unknown, pathArray: string[]): unknown {
    let current = obj;
    for (const key of pathArray) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private setNestedValue(obj: unknown, pathArray: string[], value: unknown): void {
    if (typeof obj !== "object" || obj === null) return;

    let current = obj as Record<string, unknown>;
    for (let i = 0; i < pathArray.length - 1; i++) {
      const key = pathArray[i];
      if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[pathArray[pathArray.length - 1]] = value;
  }

  private removeNestedValue(obj: unknown, pathArray: string[]): void {
    if (typeof obj !== "object" || obj === null || pathArray.length === 0) return;

    let current = obj as Record<string, unknown>;
    for (let i = 0; i < pathArray.length - 1; i++) {
      const key = pathArray[i];
      if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
        return;
      }
      current = current[key] as Record<string, unknown>;
    }

    delete current[pathArray[pathArray.length - 1]];
  }

  private pruneEmptyParents(obj: unknown, pathArray: string[]): void {
    if (pathArray.length === 0 || typeof obj !== "object" || obj === null) return;

    // Walk from root to each parent, removing if empty
    for (let i = pathArray.length - 1; i > 0; i--) {
      let current = obj as Record<string, unknown>;
      for (let j = 0; j < i - 1; j++) {
        const key = pathArray[j];
        if (!(key in current) || typeof current[key] !== "object") return;
        current = current[key] as Record<string, unknown>;
      }

      const parentKey = pathArray[i - 1];
      if (!(parentKey in current) || typeof current[parentKey] !== "object") return;

      const parent = current[parentKey] as Record<string, unknown>;
      if (Object.keys(parent).length === 0) {
        delete current[parentKey];
      } else {
        return; // Stop pruning if we hit a non-empty object
      }
    }
  }

  private ensureBackup(filePath: string): void {
    if (this.backedUpFiles.has(filePath)) return;
    if (!fs.existsSync(filePath)) {
      this.backedUpFiles.add(filePath);
      return;
    }

    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(this.backupsDir, `${fileName}.${timestamp}.json`);

    fs.mkdirSync(this.backupsDir, { recursive: true });
    fs.copyFileSync(filePath, backupPath);
    this.backedUpFiles.add(filePath);
  }

  private atomicWrite(filePath: string, obj: unknown): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${filePath}.tmp`;
    const content = JSON.stringify(obj, null, 2);
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, filePath);
  }
}

/** SHA256 hash of canonical JSON representation */
function hashValue(value: unknown): string {
  const canonical = JSON.stringify(value, null, 0);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
