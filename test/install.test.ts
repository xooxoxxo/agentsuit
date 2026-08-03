import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempHome, loadModules } from "./helpers.js";

/**
 * suit install. The invariant every case circles: nothing from a remote
 * exists outside quarantine until it has been reviewed and approved, and an
 * abort at any point leaves zero trace.
 */
describe("suit install", () => {
  let tempHome: string;
  let fixture: string;

  beforeEach(() => {
    vi.resetModules();
    tempHome = makeTempHome();
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), "remote-suit-"));
    writeFixture(fixture);
  });

  afterEach(() => {
    vi.resetModules();
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  /** A remote suit: one skill, one command, one MCP server, one hook. */
  function writeFixture(dir: string): void {
    fs.writeFileSync(
      path.join(dir, "suit.yaml"),
      [
        "name: remote-coding",
        "components:",
        "  skills:",
        "    - api-tester",
        "  commands:",
        "    - deploy-check",
        "  mcp:",
        "    - name: search",
        "      command: search-mcp",
        "  hooks:",
        "    - event: Stop",
        "      command: notify.sh",
        "",
      ].join("\n")
    );
    fs.mkdirSync(path.join(dir, "skills", "api-tester"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "skills", "api-tester", "SKILL.md"),
      "---\nname: api-tester\n---\nHit the API and compare responses.\n"
    );
    fs.mkdirSync(path.join(dir, "commands", "deploy-check"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "commands", "deploy-check", "COMMAND.md"),
      "---\nname: deploy-check\n---\nCheck the deploy.\n"
    );
  }

  async function load() {
    const modules = await loadModules(tempHome);
    const install = await import("../src/install.js");
    const cmd = await import("../src/commands/install.js");
    const review = await import("../src/review.js");
    const suits = await import("../src/suits.js");
    return { ...modules, install, cmd, review, suits };
  }

  /** Everything currently under the managed root, for zero-trace assertions. */
  function managedTree(): string[] {
    const root = path.join(tempHome, "strongsuit");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        return entry.isDirectory() ? [rel, ...walk(full)] : [rel];
      });
    return fs.existsSync(root) ? walk(root).sort() : [];
  }

  async function runQuietly(fn: () => Promise<void>): Promise<void> {
    const prior = process.exitCode;
    await fn();
    process.exitCode = prior;
  }

  describe("i1: source parsing", () => {
    it("recognises a local directory", async () => {
      const { install } = await load();
      const parsed = install.parseSource(fixture);
      expect(parsed.kind).toBe("path");
      expect(parsed.suggestedName).toBe(path.basename(fixture));
    });

    it("expands owner/repo shorthand to a GitHub URL", async () => {
      const { install } = await load();
      const parsed = install.parseSource("acme/coding-suit");
      expect(parsed).toMatchObject({
        kind: "git",
        location: "https://github.com/acme/coding-suit.git",
        suggestedName: "coding-suit",
      });
      expect(parsed.ref).toBeUndefined();
    });

    it("carries @ref through the shorthand", async () => {
      const { install } = await load();
      expect(install.parseSource("acme/coding-suit@v2.1").ref).toBe("v2.1");
    });

    it("passes a full URL to git verbatim", async () => {
      const { install } = await load();
      const parsed = install.parseSource("https://gitlab.com/acme/suit.git");
      expect(parsed.kind).toBe("git");
      expect(parsed.location).toBe("https://gitlab.com/acme/suit.git");
    });

    it("rejects a source it cannot understand", async () => {
      const { install } = await load();
      expect(() => install.parseSource("не-репо")).toThrow(/Cannot understand source/);
    });
  });

  describe("i2: quarantine", () => {
    it("fetches a local source into the quarantine root and nowhere else", async () => {
      const { install } = await load();
      const dir = install.fetchToQuarantine(install.parseSource(fixture));
      expect(dir.startsWith(install.quarantineRoot())).toBe(true);
      expect(fs.existsSync(path.join(dir, "suit.yaml"))).toBe(true);
      // Library and suits untouched by the fetch.
      expect(managedTree().filter((p) => !p.startsWith("quarantine") && !p.startsWith("library"))).toEqual([]);
    });

    it("shallow-clones git sources through the runner", async () => {
      const { install } = await load();
      const calls: string[][] = [];
      install.setGitRunner((args) => {
        calls.push(args);
        // Simulate a clone by writing the fixture into the destination.
        fs.cpSync(fixture, args[args.length - 1], { recursive: true });
        return { status: 0, stdout: "" };
      });

      install.fetchToQuarantine(install.parseSource("acme/coding-suit@v1"));

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("--depth");
      expect(calls[0]).toContain("--branch");
      expect(calls[0]).toContain("https://github.com/acme/coding-suit.git");
      install.setGitRunner(null);
    });

    it("reports a failed clone and leaves nothing behind", async () => {
      const { install } = await load();
      install.setGitRunner(() => ({ status: 128, stdout: "fatal: repository not found" }));

      expect(() => install.fetchToQuarantine(install.parseSource("acme/nope"))).toThrow(
        /git clone failed \(exit 128\)/
      );
      expect(fs.readdirSync(install.quarantineRoot())).toEqual([]);
      install.setGitRunner(null);
    });

    it("rejects a manifest that references content the repo does not contain", async () => {
      const { install } = await load();
      fs.rmSync(path.join(fixture, "skills", "api-tester"), { recursive: true });
      const dir = install.fetchToQuarantine(install.parseSource(fixture));
      expect(() => install.loadRemoteSuit(dir)).toThrow(/skills\/api-tester/);
    });
  });

  describe("i3: the install gate", () => {
    it("lands only approved components; the hook needs its own flag", async () => {
      const { cmd, suits, paths } = await load();

      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "remote-coding", yes: true }));

      const suit = suits.loadSuit("remote-coding");
      expect(suit.components?.skills).toEqual(["api-tester"]);
      expect(suit.components?.mcp).toHaveLength(1);
      // RED is not approved by --yes; the hook must not be in the registered suit.
      expect(suit.components?.hooks ?? []).toEqual([]);

      expect(
        fs.readFileSync(path.join(paths.LIBRARY_DIR, "api-tester", "SKILL.md"), "utf-8")
      ).toContain("Hit the API");
    });

    it("registers the hook too under --approve-code-execution", async () => {
      const { cmd, suits } = await load();
      await runQuietly(() =>
        cmd.runInstall(fixture, "user", { as: "remote-coding", yes: true, approveCodeExecution: true })
      );
      expect(suits.loadSuit("remote-coding").components?.hooks).toHaveLength(1);
    });

    it("reviews quarantine content, not library content", async () => {
      const { cmd } = await load();
      const printed: string[] = [];
      const origLog = console.log;
      console.log = (line?: unknown) => printed.push(String(line ?? ""));
      try {
        await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc", yes: true }));
      } finally {
        console.log = origLog;
      }
      // The skill's actual instructions were shown at review time — content
      // that at that moment existed only in quarantine.
      expect(printed.join("\n")).toContain("Hit the API and compare responses.");
    });

    it("never lets unreviewed bytes reach the library — checked at prompt time", async () => {
      const { cmd, review, paths } = await load();
      const seen: string[] = [];
      const spy = vi.spyOn(review, "reviewComponents");
      // reviewComponents is called by runInstall; intercept the moment it
      // runs and record what exists outside quarantine right then.
      spy.mockImplementation(async (items) => {
        expect(fs.existsSync(path.join(paths.LIBRARY_DIR, "api-tester"))).toBe(false);
        seen.push("review-ran");
        return items.map((item) => ({ item, approved: false }));
      });

      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc" }));

      expect(seen).toEqual(["review-ran"]);
      spy.mockRestore();
    });

    it("an install where nothing is approved registers nothing and leaves zero trace", async () => {
      const { cmd, suits } = await load();
      const before = managedTree();

      // No TTY, no --yes: the review gate itself refuses.
      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc" }));

      expect(suits.suitExists("rc")).toBe(false);
      expect(managedTree()).toEqual(before);
    });

    it("a malformed manifest aborts with a clear error and zero trace", async () => {
      const { cmd, suits } = await load();
      fs.writeFileSync(path.join(fixture, "suit.yaml"), "name: [broken\n");
      const before = managedTree();

      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc", yes: true }));

      expect(suits.suitExists("rc")).toBe(false);
      expect(managedTree()).toEqual(before);
    });

    it("refuses to install over an existing suit", async () => {
      const { cmd, suits } = await load();
      suits.saveSuit({ name: "rc", components: {} });
      const before = managedTree();

      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc", yes: true }));

      // Untouched: same suit, no quarantine leftovers.
      expect(managedTree()).toEqual(before);
    });

    it("a library name clash with different content excludes the component, local copy wins", async () => {
      const { cmd, suits, paths } = await load();
      // A local skill already exists under the same name with other content.
      const local = path.join(paths.LIBRARY_DIR, "api-tester");
      fs.mkdirSync(local, { recursive: true });
      fs.writeFileSync(path.join(local, "SKILL.md"), "---\nname: api-tester\n---\nMine. Local.\n");

      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc", yes: true }));

      // Local content survives byte for byte.
      expect(fs.readFileSync(path.join(local, "SKILL.md"), "utf-8")).toContain("Mine. Local.");
      // The suit does not reference a skill whose content was not reviewed.
      expect(suits.loadSuit("rc").components?.skills ?? []).toEqual([]);
      // The command component was unaffected by the clash.
      expect(suits.loadSuit("rc").components?.commands).toEqual(["deploy-check"]);
    });

    it("quarantine is gone after success and after abort", async () => {
      const { cmd, install } = await load();
      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "ok", yes: true }));
      expect(fs.existsSync(install.quarantineRoot())).toBe(false);

      fs.writeFileSync(path.join(fixture, "suit.yaml"), "name: [broken\n");
      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "bad", yes: true }));
      expect(fs.existsSync(install.quarantineRoot())).toBe(false);
    });

    it("records review decisions for the installed suit", async () => {
      const { cmd, review } = await load();
      await runQuietly(() => cmd.runInstall(fixture, "user", { as: "rc", yes: true }));

      const records = review.readDecisions("rc");
      expect(records.find((r) => r.type === "skills")?.approved).toBe(true);
      expect(records.find((r) => r.type === "hooks")?.approved).toBe(false);
    });
  });
});
