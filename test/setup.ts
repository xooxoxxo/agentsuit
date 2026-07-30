import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * G2: Setup isolation guard — before any module loads, if AGENTSUIT_HOME
 * is not set, create a fresh temp directory and point to it.
 * This safety net catches any module that forgets the env override
 * and tries to use os.homedir() directly.
 */
if (!process.env.AGENTSUIT_HOME) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentsuit-test-"));
  process.env.AGENTSUIT_HOME = tempHome;
}
