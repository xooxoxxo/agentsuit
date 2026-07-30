import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Entry in the ownership ledger. Records every key strongsuit has written.
 */
export interface LedgerEntry {
  /** Relative or absolute file path */
  file: string;
  /** Path to value: array form ["root", "nested", "key"] or dotted "root.nested.key" */
  jsonPath: string | string[];
  /** SHA256 of the canonical JSON value written */
  valueHash: string;
  /** Suit name that wrote this entry */
  suit: string;
  /** ISO timestamp when written */
  writtenAt: string;
  /** True if this entry created its parent object (for pruning on removal) */
  createdParent?: boolean;
}

/**
 * Persistent ledger tracking all JSON edits made by strongsuit.
 * Stored at <root>/ledger.json.
 */
export class Ledger {
  private entries: Map<string, LedgerEntry> = new Map();
  private path: string;
  private corrupted: boolean = false;

  constructor(ledgerPath: string) {
    this.path = ledgerPath;
    this.load();
  }

  /** Load ledger from disk. Corruption is silently recorded; writes will refuse. */
  private load(): void {
    if (!fs.existsSync(this.path)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.path, "utf-8");
      const data = JSON.parse(content);
      if (!Array.isArray(data)) {
        this.corrupted = true;
        return;
      }
      for (const entry of data) {
        const key = this.entryKey(entry.file, entry.jsonPath);
        this.entries.set(key, entry as LedgerEntry);
      }
    } catch {
      this.corrupted = true;
    }
  }

  /** True if ledger failed to parse — all writes must be refused */
  isCorrupted(): boolean {
    return this.corrupted;
  }

  /**
   * Add or update an entry.
   * @param file File path the entry is for
   * @param jsonPath Path to the value (array or dotted string)
   * @param value The canonical value being written
   * @param suit Name of the suit writing this
   * @param createdParent True if this entry created its parent object
   */
  record(
    file: string,
    jsonPath: string | string[],
    value: unknown,
    suit: string,
    createdParent: boolean = false
  ): void {
    const key = this.entryKey(file, jsonPath);
    const valueHash = Ledger.hashValue(value);

    const entry: LedgerEntry = {
      file,
      jsonPath,
      valueHash,
      suit,
      writtenAt: new Date().toISOString(),
      createdParent,
    };

    this.entries.set(key, entry);
  }

  /** Get an entry by file and jsonPath */
  get(file: string, jsonPath: string | string[]): LedgerEntry | undefined {
    const key = this.entryKey(file, jsonPath);
    return this.entries.get(key);
  }

  /** Get all entries for a file */
  getForFile(file: string): LedgerEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.file === file);
  }

  /** Remove an entry */
  remove(file: string, jsonPath: string | string[]): void {
    const key = this.entryKey(file, jsonPath);
    this.entries.delete(key);
  }

  /** Save ledger to disk as JSON array */
  save(): void {
    const content = JSON.stringify(Array.from(this.entries.values()), null, 2);
    const dir = path.dirname(this.path);
    fs.mkdirSync(dir, { recursive: true });

    // Atomic write: temp file + rename
    const tempPath = `${this.path}.tmp`;
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, this.path);
  }

  /** SHA256 hash of canonical JSON representation */
  private static hashValue(value: unknown): string {
    const canonical = JSON.stringify(value, null, 0);
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  /** Compute a unique key for an entry */
  private entryKey(file: string, jsonPath: string | string[]): string {
    const pathStr = Array.isArray(jsonPath) ? jsonPath.join(".") : jsonPath;
    return `${file}#${pathStr}`;
  }
}
