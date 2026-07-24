import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runDoctor } from "../src/commands/doctor.js";
import { getDefaultConfigRoot } from "../src/config/loader.js";

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

test("doctor finds redacted settings, shell and environment conflicts without writing", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "cmr-doctor-home-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "cmr-doctor-project-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });
  const settingsPath = path.join(home, ".claude", "settings.json");
  const shellPath = path.join(home, ".zshrc");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({
    model: "kimi-k3",
    env: {
      ANTHROPIC_MODEL: "kimi-k3",
      ANTHROPIC_AUTH_TOKEN: "test-settings-secret",
      TAVILY_API_KEY: "test-tavily-key"
    },
    statusLine: { type: "command", command: "keep-status" }
  }));
  await writeFile(shellPath, "export ANTHROPIC_BASE_URL=https://example.invalid\nexport ANTHROPIC_API_KEY=test-shell-secret\n");
  const beforeSettings = await digest(settingsPath);
  const beforeShell = await digest(shellPath);
  const result = await runDoctor({
    platform: "darwin",
    homeDir: home,
    cwd,
    env: {
      HOME: home,
      PATH: "",
      ANTHROPIC_API_KEY: "test-process-key",
      ANTHROPIC_AUTH_TOKEN: "test-process-token",
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "legacy"
    },
    claudeExecutable: null,
    configRoot: getDefaultConfigRoot()
  });
  const afterSettings = await digest(settingsPath);
  const afterShell = await digest(shellPath);
  assert.equal(beforeSettings, afterSettings);
  assert.equal(beforeShell, afterShell);
  assert.match(result.text, /ANTHROPIC_MODEL/);
  assert.match(result.text, /ANTHROPIC_API_KEY/);
  assert.match(result.text, /legacy\/unverified/);
  assert.doesNotMatch(result.text, /test-settings-secret|test-shell-secret|test-process-key|test-process-token/);
  assert.match(result.text, /deepseek secret: missing/);
});

test("doctor invokes Windows cmd shims through cmd.exe without shell mode", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "cmr-doctor-win-home-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "cmr-doctor-win-project-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });
  let call;
  const executable = "C:\\Program Files\\Claude\\claude.cmd";
  const comspec = "C:\\Windows\\System32\\cmd.exe";
  const result = await runDoctor({
    platform: "win32",
    homeDir: home,
    cwd,
    env: { PATH: "", ComSpec: comspec },
    claudeExecutable: executable,
    configRoot: getDefaultConfigRoot(),
    spawnSyncImpl(command, args, options) {
      call = { command, args, options };
      return { status: 0, stdout: "2.1.214 (Claude Code)\r\n", stderr: "" };
    }
  });
  assert.equal(call.command, comspec);
  assert.deepEqual(call.args, ["/d", "/c", executable, "--version"]);
  assert.equal(call.options.shell, false);
  assert.match(result.text, /Claude Code 2\.1\.214/);
});

test("doctor does not apply POSIX settings permission warnings on Windows", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "cmr-doctor-win-permissions-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "cmr-doctor-win-project-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });
  const settingsPath = path.join(home, ".claude", "settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ env: {} }), { mode: 0o644 });

  const result = await runDoctor({
    platform: "win32",
    homeDir: home,
    cwd,
    env: {
      USERPROFILE: home,
      APPDATA: path.join(home, "AppData", "Roaming"),
      Path: ""
    },
    claudeExecutable: null,
    configRoot: getDefaultConfigRoot()
  });

  assert.doesNotMatch(result.text, /user settings permissions are/);
});
