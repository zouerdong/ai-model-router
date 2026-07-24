import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { removeRouterEnvironmentVariables, runCommand } from "../src/command-runner.js";

test("removes Router variables case-insensitively while preserving npm network environment", () => {
  const environment = removeRouterEnvironmentVariables({
    Path: "C:\\Node",
    ANTHROPIC_AUTH_TOKEN: "test-token",
    anthropic_model: "test-model",
    HTTPS_PROXY: "https://proxy.example",
    NODE_EXTRA_CA_CERTS: "C:\\ca.pem"
  }, ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL"]);
  assert.deepEqual(environment, {
    Path: "C:\\Node",
    HTTPS_PROXY: "https://proxy.example",
    NODE_EXTRA_CA_CERTS: "C:\\ca.pem"
  });
});

test("runs an injected command with exact argv and shell disabled", async () => {
  const calls = [];
  const processLike = new EventEmitter();
  const result = await runCommand({
    executable: "C:\\Program Files\\nodejs\\npm.cmd",
    args: ["pack", "C:\\Temp Path\\asset.tgz"],
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    cwd: "C:\\Temp Path\\work",
    processLike,
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit("data", "[]");
        child.stderr.emit("data", "ignored diagnostic");
        child.emit("exit", 0, null);
      });
      return child;
    }
  });
  assert.deepEqual(calls, [{
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/c", "C:\\Program Files\\nodejs\\npm.cmd", "pack", "C:\\Temp Path\\asset.tgz"],
    options: {
      shell: false,
      cwd: "C:\\Temp Path\\work",
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      stdio: ["ignore", "pipe", "pipe"]
    }
  }]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "[]");
  assert.equal(result.stderr, "ignored diagnostic");
});

test("preserves a forwarded SIGINT even when the child reports a normal failure code", async () => {
  const processLike = new EventEmitter();
  let child;
  const command = runCommand({
    executable: "/fake/npm",
    args: ["pack"],
    platform: "darwin",
    processLike,
    spawnImpl() {
      child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.exitCode = null;
      child.signalCode = null;
      child.kill = () => {
        queueMicrotask(() => {
          child.exitCode = 1;
          child.emit("exit", 1, null);
        });
        return true;
      };
      return child;
    }
  });
  processLike.emit("SIGINT");
  const result = await command;
  assert.equal(result.exitCode, 130);
  assert.equal(result.signal, "SIGINT");
});

test("stops capturing command output at the configured bound", async () => {
  const processLike = new EventEmitter();
  await assert.rejects(
    () => runCommand({
      executable: "/fake/npm",
      args: ["pack"],
      platform: "darwin",
      processLike,
      maxOutputBytes: 8,
      spawnImpl() {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.exitCode = null;
        child.signalCode = null;
        child.kill = () => {
          queueMicrotask(() => child.emit("exit", null, "SIGTERM"));
          return true;
        };
        queueMicrotask(() => child.stdout.emit("data", Buffer.alloc(9)));
        return child;
      }
    }),
    (error) => error.code === "output-limit"
  );
});

test("terminates a hung command at the configured timeout", async () => {
  const result = await runCommand({
    executable: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    platform: process.platform,
    timeoutMs: 50,
    maxOutputBytes: 1024
  });
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.signal, "SIGTERM");
});
