import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { allManagedPaths } from "../src/paths";

/**
 * G1: Homedir guard — only src/paths.ts may call os.homedir().
 * Scans all TypeScript files in src/ and fails if 'homedir' appears
 * outside paths.ts.
 */
describe("G1: homedir isolation guard", () => {
  it("only src/paths.ts contains homedir calls", () => {
    const srcDir = path.join(process.cwd(), "src");
    const violations: string[] = [];

    const walk = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (file.endsWith(".ts")) {
          const isPathsFile = fullPath.includes("src/paths.ts");
          const content = fs.readFileSync(fullPath, "utf-8");
          if (content.includes("homedir")) {
            if (!isPathsFile) {
              violations.push(
                `Found 'homedir' in ${fullPath.replace(process.cwd(), "")}`
              );
            }
          }
        }
      }
    };

    walk(srcDir);
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});

/**
 * G3: Path-containment guard — all managed paths must be inside AGENTSUIT_HOME.
 * Scans allManagedPaths() for user scope only and verifies
 * that every computed path is within the temp home root.
 * (Project scope paths are legitimately outside AGENTSUIT_HOME by design.)
 */
describe("G3: path-containment guard", () => {
  it("all user-scoped managed paths are contained within AGENTSUIT_HOME", () => {
    const tempHome = process.env.AGENTSUIT_HOME;
    expect(tempHome).toBeDefined();
    if (!tempHome) return;

    const realTempHome = path.resolve(tempHome);
    const violations: string[] = [];

    const paths = allManagedPaths("user");
    for (const p of paths) {
      const absPath = path.resolve(p);
      const normalized = path.normalize(absPath);
      if (!normalized.startsWith(realTempHome)) {
        violations.push(
          `user scope path ${p} resolves to ${normalized}, outside ${realTempHome}`
        );
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
