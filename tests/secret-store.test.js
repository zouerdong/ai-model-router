import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmod, cp, mkdtemp, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readHiddenSecret, SecretStore } from "../src/secret-store.js";
import { getDefaultConfigRoot } from "../src/config/loader.js";

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
  assert.deepEqual(await store.status(), { deepseek: true, glm: false, "glm-api": false, "kimi-code": false, kimi: true });
  assert.equal(await store.get("deepseek"), "test-deepseek-key");
  const details = await stat(filePath);
  if (process.platform !== "win32") assert.equal(details.mode & 0o777, 0o600);
  const raw = await readFile(filePath, "utf8");
  assert.match(raw, /test-deepseek-key/);
  assert.equal((await readdir(path.dirname(filePath))).some((name) => name.endsWith(".tmp")), false);
});

test("secret store reads the old four-provider 1.4.0 v1 schema and atomically adds the Kimi Code secret", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-glm-upgrade-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  await writeFile(filePath, JSON.stringify({
    version: 1,
    providers: {
      kimi: "test-kimi-key",
      deepseek: "test-deepseek-key",
      glm: "test-glm-key",
      "glm-api": "test-glm-api-key"
    }
  }, null, 2));
  const store = new SecretStore({ filePath });
  assert.deepEqual(await store.status(), { deepseek: true, glm: true, "glm-api": true, "kimi-code": false, kimi: true });
  assert.deepEqual(await store.readAll(), {
    version: 1,
    providers: {
      kimi: "test-kimi-key",
      deepseek: "test-deepseek-key",
      glm: "test-glm-key",
      "glm-api": "test-glm-api-key"
    }
  });
  assert.equal(await store.get("glm"), "test-glm-key");
  assert.equal(await store.get("glm-api"), "test-glm-api-key");

  await store.set("kimi-code", "test-kimi-code-key");
  assert.deepEqual(await store.readAll(), {
    version: 1,
    providers: {
      kimi: "test-kimi-key",
      deepseek: "test-deepseek-key",
      glm: "test-glm-key",
      "glm-api": "test-glm-api-key",
      "kimi-code": "test-kimi-code-key"
    }
  });

  const beforeFailure = await readFile(filePath, "utf8");
  const failingStore = new SecretStore({
    filePath,
    fs: {
      readFile: (target, encoding) => import("node:fs/promises").then((fs) => fs.readFile(target, encoding)),
      mkdir: (target, options) => import("node:fs/promises").then((fs) => fs.mkdir(target, options)),
      writeFile: (target, content, options) => import("node:fs/promises").then((fs) => fs.writeFile(target, content, options)),
      rename: async () => { const error = new Error("rename failed"); error.code = "EIO"; throw error; },
      chmod,
      unlink
    }
  });
  await assert.rejects(() => failingStore.set("kimi-code", "test-kimi-code-replacement"), /cannot write secret store/);
  assert.equal(await readFile(filePath, "utf8"), beforeFailure);
});

test("an older provider set reads a newer-version store, ignores unknown keys, and preserves them on rewrite", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-forward-compat-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  await writeFile(filePath, JSON.stringify({
    version: 1,
    providers: {
      kimi: "test-kimi-key",
      deepseek: "test-deepseek-key",
      glm: "test-glm-key",
      "glm-api": "test-glm-api-key",
      "kimi-code": "test-kimi-code-key"
    }
  }, null, 2));
  const legacyStore = new SecretStore({ filePath, providerIds: ["kimi", "deepseek", "glm", "glm-api"] });
  assert.deepEqual(await legacyStore.readAll(), {
    version: 1,
    providers: {
      kimi: "test-kimi-key",
      deepseek: "test-deepseek-key",
      glm: "test-glm-key",
      "glm-api": "test-glm-api-key",
      "kimi-code": "test-kimi-code-key"
    }
  });
  assert.equal(await legacyStore.get("kimi"), "test-kimi-key");
  assert.deepEqual(await legacyStore.status(), { deepseek: true, glm: true, "glm-api": true, kimi: true });
  await assert.rejects(() => legacyStore.get("kimi-code"), /unknown provider: kimi-code/);

  await legacyStore.set("kimi", "test-kimi-rotated");
  assert.deepEqual((await legacyStore.readAll()).providers, {
    kimi: "test-kimi-rotated",
    deepseek: "test-deepseek-key",
    glm: "test-glm-key",
    "glm-api": "test-glm-api-key",
    "kimi-code": "test-kimi-code-key"
  });
  const upgradedStore = new SecretStore({ filePath });
  assert.equal(await upgradedStore.get("kimi-code"), "test-kimi-code-key");
});

test("unknown provider secrets stay in the redaction set and malformed unknown values do not fail the read", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-opaque-unknown-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  await writeFile(filePath, JSON.stringify({
    version: 1,
    providers: {
      kimi: "test-kimi-key",
      "kimi-code": "line1\nline2"
    }
  }, null, 2));
  const legacyStore = new SecretStore({ filePath, providerIds: ["kimi", "deepseek", "glm", "glm-api"] });
  assert.equal(await legacyStore.get("kimi"), "test-kimi-key");
  const redaction = await legacyStore.readSecretsForRedaction();
  assert.deepEqual([...redaction].sort(), ["line1\nline2", "test-kimi-key"].sort());

  await legacyStore.set("kimi", "test-kimi-new");
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(raw.providers["kimi-code"], "line1\nline2");
  assert.equal(raw.providers.kimi, "test-kimi-new");
});

test("known provider values and the top-level schema remain strict for the older provider set", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-strict-known-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const corruptValuePath = path.join(directory, "secrets.json");
  await writeFile(corruptValuePath, JSON.stringify({ version: 1, providers: { kimi: "line1\nline2" } }));
  const legacyIds = ["kimi", "deepseek", "glm", "glm-api"];
  await assert.rejects(() => new SecretStore({ filePath: corruptValuePath, providerIds: legacyIds }).get("kimi"), /invalid secret/);

  const corruptSchemaPath = path.join(directory, "schema.json");
  await writeFile(corruptSchemaPath, JSON.stringify({ version: 2, providers: {} }));
  await assert.rejects(() => new SecretStore({ filePath: corruptSchemaPath, providerIds: legacyIds }).get("kimi"), /invalid schema/);
});

test("SecretStore derives accepted Provider IDs from the loaded configuration when not injected", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-secret-dynamic-config-"));
  await cp(getDefaultConfigRoot(), root, { recursive: true });
  await writeFile(path.join(root, "providers", "third-provider.json"), JSON.stringify({
    id: "third-provider",
    displayName: "Third Provider",
    baseUrl: "https://third.example.com/anthropic",
    apiKeyUrl: "https://third.example.com/api-keys",
    authVariable: "ANTHROPIC_AUTH_TOKEN",
    secretId: "third-provider",
    verifiedOn: "2026-08-12",
    sourceUrl: "https://third.example.com/docs"
  }));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const store = new SecretStore({
    filePath: path.join(root, "secrets.json"),
    configRoot: root
  });
  await store.set("third-provider", "test-third-provider-key");
  const status = await store.status();
  assert.equal(status["third-provider"], true);
  assert.equal(await store.get("third-provider"), "test-third-provider-key");
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

test("GLM API secrets reject hostile input without creating a store", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-glm-hostile-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  const store = new SecretStore({ filePath });
  for (const value of ["", " test-glm-api-key", "line1\nline2", "value\0with-null", "x".repeat(16_385)]) {
    await assert.rejects(() => store.set("glm-api", value));
  }
  await assert.rejects(() => readFile(filePath, "utf8"), { code: "ENOENT" });
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

test("secret replacement keeps the old file when write, chmod or rename fails", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-secret-replace-fail-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "secrets.json");
  const stableFs = { readFile: (target, encoding) => import("node:fs/promises").then((fs) => fs.readFile(target, encoding)), mkdir: (target, options) => import("node:fs/promises").then((fs) => fs.mkdir(target, options)), writeFile: (target, content, options) => import("node:fs/promises").then((fs) => fs.writeFile(target, content, options)), rename, chmod, unlink };
  const initial = new SecretStore({ filePath, fs: stableFs });
  await initial.set("kimi", "test-kimi-old");
  const failWrite = new SecretStore({
    filePath,
    fs: { ...stableFs, writeFile: async () => { const error = new Error("write failed"); error.code = "EIO"; throw error; } }
  });
  await assert.rejects(() => failWrite.set("kimi", "test-kimi-new"), /cannot write secret store/);
  assert.equal(await initial.get("kimi"), "test-kimi-old");
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
