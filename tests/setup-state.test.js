import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getApplicationDataDir, getSecretStorePath, getSetupStatePath } from "../src/platform.js";
import { SetupStateStore, isSetupStateCorrupt } from "../src/setup-state.js";

async function temporaryDirectory(t, prefix = "cmr-state-test-") {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("CMR secret and setup state paths share one application data directory", () => {
  const env = { HOME: "/tmp/cmr-home", APPDATA: "/tmp/cmr-appdata" };
  assert.equal(
    getSecretStorePath({ platform: "darwin", env }),
    path.join(getApplicationDataDir({ platform: "darwin", env }), "secrets.json")
  );
  assert.equal(
    getSetupStatePath({ platform: "darwin", env }),
    path.join(getApplicationDataDir({ platform: "darwin", env }), "state.json")
  );
  assert.equal(getApplicationDataDir({ platform: "win32", env }), path.join(env.APPDATA, "ClaudeModelRouter"));
  assert.equal(getSetupStatePath({ platform: "win32", env }), path.join(env.APPDATA, "ClaudeModelRouter", "state.json"));
});

test("missing state reports every current provider as unseen, without fixed provider count", async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new SetupStateStore({ filePath: path.join(directory, "state.json") });
  assert.deepEqual(await store.read(), { exists: false, version: 1, seenProviderIds: [] });
  assert.deepEqual(await store.getUnseenProviderIds(["kimi", "deepseek", "third-provider"]), ["kimi", "deepseek", "third-provider"]);
});

test("state compares current IDs, preserves historical IDs, and writes sorted union atomically", async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, "nested", "state.json");
  const store = new SetupStateStore({ filePath });
  await store.markSeen(["deepseek", "kimi"]);
  assert.deepEqual(await store.getUnseenProviderIds(["kimi", "deepseek"]), []);
  assert.deepEqual(await store.getUnseenProviderIds(["kimi", "deepseek", "third-provider"]), ["third-provider"]);
  const result = await store.markSeen(["third-provider"]);
  assert.deepEqual(result.seenProviderIds, ["deepseek", "kimi", "third-provider"]);
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), {
    version: 1,
    seenProviderIds: ["deepseek", "kimi", "third-provider"]
  });
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.equal((await stat(path.dirname(filePath))).mode & 0o777, 0o700);
  assert.equal((await readdir(path.dirname(filePath))).some((name) => name.endsWith(".tmp")), false);
  await store.markSeen(["kimi"]);
  assert.deepEqual((await store.read()).seenProviderIds, ["deepseek", "kimi", "third-provider"]);
});

test("state rejects duplicate, unsorted, unknown-field, wrong-version and empty schemas", async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, "state.json");
  const invalidValues = [
    { version: 1, seenProviderIds: ["kimi", "kimi"] },
    { version: 1, seenProviderIds: ["kimi", "deepseek"] },
    { version: 1, seenProviderIds: ["kimi"], extra: "no" },
    { version: 2, seenProviderIds: ["kimi"] },
    { version: 1, seenProviderIds: [] },
    { version: 1, seenProviderIds: ["bad/id"] }
  ];
  for (const value of invalidValues) {
    await writeFile(filePath, JSON.stringify(value));
    await assert.rejects(() => new SetupStateStore({ filePath }).read(), (error) => isSetupStateCorrupt(error));
  }
});

test("corrupt state is unchanged until an explicit rebuild", async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, "state.json");
  const corrupt = "not-json-without-secrets";
  await writeFile(filePath, corrupt);
  const store = new SetupStateStore({ filePath });
  await assert.rejects(() => store.read(), (error) => isSetupStateCorrupt(error));
  assert.equal(await readFile(filePath, "utf8"), corrupt);
  await store.markSeen(["kimi", "deepseek"], { rebuildCorrupt: true });
  assert.deepEqual((await store.read()).seenProviderIds, ["deepseek", "kimi"]);
});

test("state write failures do not report a new completed state or leave temp files", async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, "state.json");
  let renameCalls = 0;
  const failingFs = {
    mkdir: async (target, options) => (await import("node:fs/promises")).mkdir(target, options),
    chmod: async (target, mode) => (await import("node:fs/promises")).chmod(target, mode),
    readFile: async () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; },
    writeFile: async (target, content, options) => (await import("node:fs/promises")).writeFile(target, content, options),
    rename: async () => { renameCalls += 1; throw new Error("rename failed"); },
    unlink: async (target) => (await import("node:fs/promises")).unlink(target)
  };
  await assert.rejects(
    () => new SetupStateStore({ filePath, fs: failingFs }).markSeen(["kimi"]),
    (error) => error.code === "CMR_SETUP_STATE_WRITE"
  );
  assert.equal(renameCalls, 1);
  assert.equal((await readdir(directory)).length, 0);
});
