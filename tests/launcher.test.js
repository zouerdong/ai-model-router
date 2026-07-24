import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runClaude, installSignalForwarding } from "../src/launcher.js";
import { buildSpawnSpec } from "../src/platform.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-claude.js", import.meta.url));

async function canonicalPath(value) {
  const resolved = await realpath(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

test("fake Claude receives cwd, profile environment and returns its exit code", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr cwd space 中文-"));
  const outputFile = path.join(root, "snapshot.json");
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const code = await runClaude({
    executable: process.execPath,
    executableArgs: [fixture],
    env: {
      PATH: process.env.PATH,
      FAKE_OUTPUT_FILE: outputFile,
      FAKE_CLAUDE_EXIT_CODE: "7",
      ANTHROPIC_BASE_URL: "https://api.moonshot.cn/anthropic",
      ANTHROPIC_AUTH_TOKEN: "test-kimi-key",
      ANTHROPIC_MODEL: "kimi-k3[1m]"
    },
    cwd: root,
    stdio: "ignore"
  });
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(code, 7);
  assert.equal(await canonicalPath(snapshot.cwd), await canonicalPath(root));
  assert.equal(snapshot.baseUrl, "https://api.moonshot.cn/anthropic");
  assert.equal(snapshot.model, "kimi-k3[1m]");
  assert.equal(snapshot.hasAuthToken, true);
  assert.equal(snapshot.hasApiKey, false);
});

test("runClaude keeps executable args before opaque Claude args", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-argv-"));
  const outputFile = path.join(root, "snapshot.json");
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const claudeArgs = ["--future-claude-flag", "value with spaces", "--flag", "--value-that-starts-with-dashes"];
  const code = await runClaude({
    executable: process.execPath,
    executableArgs: [fixture],
    claudeArgs,
    env: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: outputFile },
    cwd: root,
    stdio: "ignore"
  });
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(code, 0);
  assert.deepEqual(snapshot.args, claudeArgs);
});

test("Windows cmd launch uses cmd.exe directly without shell mode", async () => {
  const executable = "C:\\Program Files\\Claude\\claude.cmd";
  const comspec = "C:\\Windows\\System32\\cmd.exe";
  const spec = buildSpawnSpec(executable, { platform: "win32", env: { ComSpec: comspec } });
  assert.equal(spec.command, comspec);
  assert.deepEqual(spec.args, ["/d", "/c", executable]);
  assert.equal(spec.options.shell, false);
  assert.equal(buildSpawnSpec("C:\\Program Files\\Claude\\claude.exe", { platform: "win32" }).options.shell, false);
  assert.equal(buildSpawnSpec("/usr/local/bin/claude", { platform: "darwin" }).options.shell, false);

  const fakeProcess = new EventEmitter();
  let spawnCall;
  const spawnImpl = (command, args, options) => {
    spawnCall = { command, args, options };
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => true;
    queueMicrotask(() => {
      child.exitCode = 0;
      child.emit("exit", 0, null);
    });
    return child;
  };
  const hostileArgs = ["-p", "literal & | < > %PATH% !value! 中文"];
  assert.equal(await runClaude({
    executable,
    claudeArgs: hostileArgs,
    platform: "win32",
    env: { ComSpec: comspec },
    spawnImpl,
    processLike: fakeProcess
  }), 0);
  assert.equal(spawnCall.command, comspec);
  assert.deepEqual(spawnCall.args, ["/d", "/c", executable, ...hostileArgs]);
  assert.equal(spawnCall.options.shell, false);
});

test("signal forwarding sends repeated signals until the child exits", () => {
  const fakeProcess = new EventEmitter();
  const signals = [];
  const child = {
    exitCode: null,
    signalCode: null,
    killed: false,
    kill(signal) {
      signals.push(signal);
      this.killed = true;
      return true;
    }
  };
  const cleanup = installSignalForwarding(child, fakeProcess);
  fakeProcess.emit("SIGINT");
  fakeProcess.emit("SIGINT");
  child.signalCode = "SIGINT";
  fakeProcess.emit("SIGTERM");
  cleanup();
  fakeProcess.emit("SIGHUP");
  assert.deepEqual(signals, ["SIGINT", "SIGINT"]);
});
