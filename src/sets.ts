import fs from "node:fs";
import { SETS_FILE, SKILLSETS_DIR } from "./paths.js";
import type { SetsFile } from "./types.js";

export function loadSets(): SetsFile {
  fs.mkdirSync(SKILLSETS_DIR, { recursive: true });
  if (!fs.existsSync(SETS_FILE)) return {};

  try {
    const raw = fs.readFileSync(SETS_FILE, "utf8");
    return JSON.parse(raw) as SetsFile;
  } catch {
    return {};
  }
}

export function saveSets(sets: SetsFile): void {
  fs.mkdirSync(SKILLSETS_DIR, { recursive: true });
  fs.writeFileSync(SETS_FILE, JSON.stringify(sets, null, 2) + "\n", "utf8");
}
