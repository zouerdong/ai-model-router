import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { launchProfile } from "../src/commands/launch.js";
import {
  collectSettingsConflicts,
  formatSettingsConflicts,
  getClaudeUserSettingsPath
} from "../src/settings-conflict.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-claude.js", import.meta.url));

function outputCapture() {
  let text = "";
  return { stream: { isTTY: false, write: (chunk) => { text += chunk; } }, get text() { return text; } };
}

async function tempHome(t, prefix) {
  const home = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
  });
  return home;
}

test("collectSettingsConflicts detects managed keys and honors CLAUDE_CONFIG_DIR", async (t) => {
  const home = await tempHome(t, "cmr-conflict-home-");
  const configDir = path.join(home, "claude-config");
  const settingsPath = path.join(configDir, "settings.json");
  await mkdir(configDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: "https://cc-switch.example/",
      aNtHrOpIc_AuTh_ToKeN: "cc-switch-token",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
    }
  }));
  const conflicts = await collectSettingsConflicts({
    platform: "darwin",
    env: { HOME: home, CLAUDE_CONFIG_DIR: configDir },
    cwd: path.join(home, "project")
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].file, settingsPath);
  assert.deepEqual(conflicts[0].envKeys, ["ANTHROPIC_BASE_URL", "aNtHrOpIc_AuTh_ToKeN"]);

  const cleanConflicts = await collectSettingsConflicts({
    platform: "darwin",
    env: { HOME: home },
    cwd: path.join(home, "project")
  });
  assert.equal(cleanConflicts.length, 0, "settings live in CLAUDE_CONFIG_DIR, not HOME/.claude");
});

test("collectSettingsConflicts reports project/local env keys but not apiKeyHelper alone", async (t) => {
  const home = await tempHome(t, "cmr-conflict-project-");
  const project = path.join(home, "project");
  await mkdir(path.join(project, ".claude"), { recursive: true });
  await writeFile(path.join(project, ".claude", "settings.json"), JSON.stringify({
    apiKeyHelper: "/usr/local/bin/fetch-key"
  }));
  await writeFile(path.join(project, ".claude", "settings.local.json"), JSON.stringify({
    env: { API_TIMEOUT_MS: "1" }
  }));
  const conflicts = await collectSettingsConflicts({ platform: "darwin", env: { HOME: home }, cwd: project });
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].sources, ["local"]);
  assert.deepEqual(conflicts[0].envKeys, ["API_TIMEOUT_MS"]);
  // apiKeyHelper alone cannot hijack a CMR session (CMR injects an outranking auth variable),
  // so it must not block launches; doctor reports it as a diagnostic warning instead.
  assert.equal(conflicts[0].file, path.join(project, ".claude", "settings.local.json"));
  assert.doesNotMatch(formatSettingsConflicts(conflicts), /apiKeyHelper/);
});

test("collectSettingsConflicts scans managed settings directories via injected fs", async () => {
  const files = new Map();
  files.set("/Library/Application Support/ClaudeCode/managed-settings.json", "{ not json");
  files.set("/Library/Application Support/ClaudeCode/managed-settings.d/10-proxy.json", JSON.stringify({
    env: { ANTHROPIC_BASE_URL: "https://proxy.example" }
  }));
  const fs = {
    readFile: async (file) => {
      if (!files.has(file)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return files.get(file);
    },
    stat: async (file) => {
      if (file.endsWith("managed-settings.d")) return { isDirectory: () => true };
      if (files.has(file)) return { isDirectory: () => false };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    readdir: async () => ["20-other.txt", "10-proxy.json"]
  };
  const conflicts = await collectSettingsConflicts({
    platform: "darwin",
    env: { HOME: "/tmp/cmr-none" },
    cwd: "/tmp/cmr-none-project",
    fs
  });
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].sources, ["managed/10-proxy.json"]);
  assert.deepEqual(conflicts[0].envKeys, ["ANTHROPIC_BASE_URL"]);
});

test("getClaudeUserSettingsPath prefers CLAUDE_CONFIG_DIR over the home directory", () => {
  assert.equal(
    getClaudeUserSettingsPath({ platform: "darwin", env: { HOME: "/home/a", CLAUDE_CONFIG_DIR: "/cfg" } }),
    path.join("/cfg", "settings.json")
  );
  assert.equal(
    getClaudeUserSettingsPath({ platform: "darwin", env: { HOME: "/home/a", CLAUDE_CONFIG_DIR: "" } }),
    path.join("/home/a", ".claude", "settings.json")
  );
});

test("launchProfile refuses to start when Claude settings would override the profile", async (t) => {
  const home = await tempHome(t, "cmr-conflict-launch-");
  await mkdir(path.join(home, ".claude"), { recursive: true });
  const settingsPath = path.join(home, ".claude", "settings.json");
  await writeFile(settingsPath, JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: "https://cc-switch.example/anthropic",
      ANTHROPIC_AUTH_TOKEN: "cc-switch-written-token"
    }
  }));
  let spawnCalls = 0;
  const output = outputCapture();
  await assert.rejects(
    launchProfile("kimi", [], {
      secret: "test-kimi-key",
      output: output.stream,
      errorOutput: output.stream,
      parentEnv: { PATH: process.env.PATH, HOME: home },
      cwd: home,
      executable: process.execPath,
      executableArgs: [fixture],
      spawnImpl: () => {
        spawnCalls += 1;
        throw new Error("spawn must not be reached");
      }
    }),
    (error) => {
      assert.match(error.message, /Claude Code settings override this CMR profile/);
      assert.match(error.message, /ANTHROPIC_BASE_URL/);
      assert.match(error.message, /ANTHROPIC_AUTH_TOKEN/);
      assert.match(error.message, /CC Switch/);
      assert.match(error.message, new RegExp(settingsPath.replace(/[/\\]/g, "\\$&")));
      return true;
    }
  );
  assert.equal(spawnCalls, 0);
});

test("launchProfile starts normally when settings contain only unrelated env keys", async (t) => {
  const home = await tempHome(t, "cmr-conflict-clean-");
  await mkdir(path.join(home, ".claude"), { recursive: true });
  await writeFile(path.join(home, ".claude", "settings.json"), JSON.stringify({
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1", TAVILY_API_KEY: "k" }
  }));
  const outputFile = path.join(home, "launched.json");
  const output = outputCapture();
  const code = await launchProfile("kimi", ["-p", "opaque"], {
    secret: "test-kimi-key",
    output: output.stream,
    parentEnv: { PATH: process.env.PATH, HOME: home, FAKE_OUTPUT_FILE: outputFile },
    cwd: home,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  assert.equal(code, 0);
  const snapshot = JSON.parse(await (await import("node:fs/promises")).readFile(outputFile, "utf8"));
  assert.equal(snapshot.baseUrl, "https://api.moonshot.cn/anthropic");
});
