import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeTempHome, loadModules } from "./helpers.js";

describe("claudemd — managed marker block", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("c1: migrates a legacy agentsuit block instead of appending a second one", async () => {
    const { claudemd, paths } = await loadModules(tempHome);
    const claudeMd = path.join(paths.CLAUDE_HOME, "CLAUDE.md");

    // A machine written by the agentsuit-era build.
    const before =
      "# my notes\n\n" +
      "<!-- agentsuit:begin (do not edit inside) -->\n" +
      "@/old/frag.md\n" +
      "<!-- agentsuit:end -->\n";
    fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
    fs.writeFileSync(claudeMd, before);

    claudemd.setFragments(["frag"], "user", path.join(paths.LIBRARY_DIR, "claudemd"));

    const after = fs.readFileSync(claudeMd, "utf-8");
    expect(after).toContain("strongsuit:begin");
    expect(after).not.toContain("agentsuit:begin");
    // Exactly one managed block, not two.
    expect(after.match(/strongsuit:begin/g)).toHaveLength(1);
    // User content outside the block is untouched.
    expect(after).toContain("# my notes");
  });

  it("c2: leaves content outside the block byte-identical", async () => {
    const { claudemd, paths } = await loadModules(tempHome);
    const claudeMd = path.join(paths.CLAUDE_HOME, "CLAUDE.md");
    const head = "# top\nsome prose\n\n";
    const tail = "\n## after\ntrailing prose\n";
    fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
    fs.writeFileSync(claudeMd, head + tail);

    claudemd.setFragments(["a"], "user", path.join(paths.LIBRARY_DIR, "claudemd"));
    claudemd.setFragments(["a", "b"], "user", path.join(paths.LIBRARY_DIR, "claudemd"));
    claudemd.clearFragments("user");

    const after = fs.readFileSync(claudeMd, "utf-8");
    expect(after).toContain("# top");
    expect(after).toContain("trailing prose");
    expect(after).not.toContain("strongsuit:begin");
  });
});
