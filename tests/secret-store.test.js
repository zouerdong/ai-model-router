import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readHiddenSecret, SecretStore } from "../src/secret-store.js";

test("secret store writes owner-only JSON atomically and exposes status only", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-test-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "nested", "secrets.json");
  const store = new SecretStore({ filePath });
  await store.set("deepseek", "test-deepseek-key");
  await store.set("kimi", "test-kimi-key");
  assert.deepEqual(await store.status(), { deepseek: true, kimi: true });
  assert.equal(await store.get("deepseek"), "test-deepseek-key");
  const details = await stat(filePath);
  if (process.platform !== "win32") assert.equal(details.mode & 0o777, 0o600);
  const raw = await readFile(filePath, "utf8");
  assert.match(raw, /test-deepseek-key/);
  assert.equal((await readdir(path.dirname(filePath))).some((name) => name.endsWith(".tmp")), false);
});

test("secret store rejects blank and multiline values", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-test-"));
  const store = new SecretStore({ filePath: path.join(directory, "secrets.json") });
  await assert.rejects(() => store.set("kimi", ""), /cannot be empty/);
  await assert.rejects(() => store.set("kimi", "line1\nline2"), /line break/);
  await assert.rejects(() => store.set("kimi", " value-with-padding "), /whitespace/);
  await assert.rejects(() => store.set("kimi", "value\0with-null"), /null byte/);
  const { rm } = await import("node:fs/promises");
  await rm(directory, { recursive: true, force: true });
});

test("secret store rejects corrupted values and macOS permission setup failures", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-corrupt-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  await writeFile(filePath, JSON.stringify({ version: 1, providers: { kimi: "line1\nline2" } }));
  await assert.rejects(() => new SecretStore({ filePath }).get("kimi"), /invalid secret/);

  let wrote = false;
  const permissionFailureStore = new SecretStore({
    filePath: path.join(directory, "locked", "secrets.json"),
    platform: "darwin",
    fs: {
      readFile: async () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; },
      mkdir: async () => {},
      chmod: async () => { const error = new Error("denied"); error.code = "EACCES"; throw error; },
      writeFile: async () => { wrote = true; },
      rename: async () => {},
      unlink: async () => {}
    }
  });
  await assert.rejects(() => permissionFailureStore.set("kimi", "test-kimi-key"), /cannot secure secret store directory: EACCES/);
  assert.equal(wrote, false);
});

function fakeTtyInput() {
  const input = new EventEmitter();
  const rawModes = [];
  input.isTTY = true;
  input.setEncoding = () => {};
  input.setRawMode = (enabled) => rawModes.push(enabled);
  input.resume = () => {};
  input.pause = () => {};
  return { input, rawModes };
}

test("hidden secret input rejects EOF and stream errors without hanging", async () => {
  const output = { write: () => {} };
  for (const event of ["end", "error"]) {
    const { input, rawModes } = fakeTtyInput();
    const pending = readHiddenSecret({ input, output });
    if (event === "error") input.emit("error", new Error("simulated input failure"));
    else input.emit("end");
    await assert.rejects(pending, /secret input (?:ended|failed)/);
    assert.deepEqual(rawModes, [true, false]);
    assert.equal(input.listenerCount("data"), 0);
  }
});

test("hidden secret input restores raw mode for hostile terminal events and input boundaries", async () => {
  for (const event of ["ctrl-c", "end", "close", "error"]) {
    const { input, rawModes } = fakeTtyInput();
    const pending = readHiddenSecret({ input, output: { write: () => {} } });
    if (event === "ctrl-c") input.emit("data", "\u0003");
    else if (event === "error") input.emit("error", new Error("simulated input failure"));
    else input.emit(event);
    await assert.rejects(pending);
    assert.deepEqual(rawModes, [true, false], event);
    assert.equal(input.listenerCount("data"), 0, event);
    assert.equal(input.listenerCount("error"), 0, event);
  }

  const { input, rawModes } = fakeTtyInput();
  const pending = readHiddenSecret({ input, output: { write: () => {} } });
  input.emit("data", "a\b中文\u007f\n");
  assert.equal(await pending, "中");
  assert.deepEqual(rawModes, [true, false]);
});

test("hidden secret input rejects multiline paste instead of accepting a truncated first line", async () => {
  const { input, rawModes } = fakeTtyInput();
  const pending = readHiddenSecret({ input, output: { write: () => {} } });
  input.emit("data", "test-first-line\ntest-second-line");
  await assert.rejects(pending, /single line/);
  assert.deepEqual(rawModes, [true, false]);
  assert.equal(input.listenerCount("data"), 0);
});

test("hidden secret input cleans up when setEncoding or setRawMode initialization fails", async () => {
  const encodingInput = fakeTtyInput().input;
  encodingInput.setEncoding = () => { throw new Error("encoding failed"); };
  await assert.rejects(() => readHiddenSecret({ input: encodingInput, output: { write: () => {} } }), /could not be initialized/);
  assert.equal(encodingInput.listenerCount("data"), 0);

  const rawInput = fakeTtyInput().input;
  const rawModes = [];
  rawInput.setRawMode = (enabled) => {
    rawModes.push(enabled);
    if (enabled) throw new Error("raw mode failed");
  };
  await assert.rejects(() => readHiddenSecret({ input: rawInput, output: { write: () => {} } }), /could not be initialized/);
  assert.deepEqual(rawModes, [true, false]);
  assert.equal(rawInput.listenerCount("data"), 0);

  const longInput = fakeTtyInput().input;
  const longPending = readHiddenSecret({ input: longInput, output: { write: () => {} } });
  longInput.emit("data", `${"x".repeat(16_385)}\n`);
  await assert.rejects(longPending, /too long/);
  assert.deepEqual(longInput.listenerCount("data"), 0);
});

test("secret replacement keeps the old file when chmod or rename fails", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-replace-fail-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  const stableFs = { readFile: (target, encoding) => import("node:fs/promises").then((fs) => fs.readFile(target, encoding)), mkdir: (target, options) => import("node:fs/promises").then((fs) => fs.mkdir(target, options)), writeFile: (target, content, options) => import("node:fs/promises").then((fs) => fs.writeFile(target, content, options)), rename, chmod, unlink };
  const initial = new SecretStore({ filePath, fs: stableFs });
  await initial.set("kimi", "test-kimi-old");
  const failRename = new SecretStore({
    filePath,
    fs: { ...stableFs, rename: async () => { const error = new Error("rename failed"); error.code = "EIO"; throw error; } }
  });
  await assert.rejects(() => failRename.set("kimi", "test-kimi-new"), /cannot write secret store/);
  assert.equal(await initial.get("kimi"), "test-kimi-old");
  const failTempChmod = new SecretStore({
    filePath,
    platform: "darwin",
    fs: {
      ...stableFs,
      chmod: async (target, mode) => {
        if (target.includes(".secrets-")) { const error = new Error("chmod failed"); error.code = "EACCES"; throw error; }
        return chmod(target, mode);
      }
    }
  });
  await assert.rejects(() => failTempChmod.set("kimi", "test-kimi-new"), /cannot write secret store/);
  assert.equal(await initial.get("kimi"), "test-kimi-old");
});
