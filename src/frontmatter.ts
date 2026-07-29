import fs from "node:fs";
import { parse as parseYaml } from "yaml";

export interface Frontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function readFrontmatter(skillMdPath: string): Frontmatter {
  const raw = fs.readFileSync(skillMdPath, "utf8");
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return {};

  try {
    const parsed: unknown = parseYaml(match[1]);
    return typeof parsed === "object" && parsed !== null ? (parsed as Frontmatter) : {};
  } catch {
    return {};
  }
}

export function fileBytes(filePath: string): number {
  return fs.statSync(filePath).size;
}
