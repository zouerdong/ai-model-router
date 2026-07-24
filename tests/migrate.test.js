import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateLocalConfig } from "../src/commands/migrate.js";

test("migration backs up files, removes only Router settings and tightens permissions", {
  skip: process.platform === "win32"
}, async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "cmr-migration-home-"));
  const settingsPath = path.join(home, ".claude", "settings.json");
  const shellPath = path.join(home, ".zshrc");
  const backupRoot = path.join(home, "Library", "Application Support", "ClaudeModelRouter", "backups", "phase-1-20260718-before-migration");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({
    model: "kimi-k3",
    env: {
      ANTHROPIC_BASE_URL: "https://api.moonshot.cn/anthropic",
      ANTHROPIC_MODEL: "kimi-k3",
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "legacy",
      TAVILY_API_KEY: "test-tavily-key"
    },
    enabledPlugins: { "keep-plugin": true },
    statusLine: { type: "command", command: "keep-status" }
  }, null, 2));
  await writeFile(shellPath, "export ANTHROPIC_BASE_URL=https://example.invalid\nexport ANTHROPIC_API_KEY=test-shell-key\nexport PATH=/usr/bin:$PATH\n");
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
  });

  const result = await migrateLocalConfig({ platform: "darwin", homeDir: home, settingsPath, shellPath, backupRoot });
  const migratedSettings = JSON.parse(await readFile(settingsPath, "utf8"));
  const migratedShell = await readFile(shellPath, "utf8");
  assert.equal(result.preservedNonRouterSettings, true);
  assert.equal(result.removedTopLevelModel, true);
  assert.deepEqual(result.removedEnvKeys, ["ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "CLAUDE_CODE_MAX_CONTEXT_TOKENS"]);
  assert.deepEqual(result.removedShellExports, [
    { line: 1, key: "ANTHROPIC_BASE_URL" },
    { line: 2, key: "ANTHROPIC_API_KEY" }
  ]);
  assert.equal(migratedSettings.env.TAVILY_API_KEY, "test-tavily-key");
  assert.equal(migratedSettings.enabledPlugins["keep-plugin"], true);
  assert.equal(migratedSettings.statusLine.command, "keep-status");
  assert.doesNotMatch(migratedShell, /ANTHROPIC_/);
  assert.match(migratedShell, /export PATH=/);
  assert.equal((await stat(settingsPath)).mode & 0o777, 0o600);
  assert.equal((await stat(shellPath)).mode & 0o777, 0o600);
  assert.equal((await stat(backupRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(backupRoot, "settings.json"))).mode & 0o777, 0o600);
  assert.match(await readFile(path.join(backupRoot, "settings.json"), "utf8"), /kimi-k3/);
});
