import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireUpdateLock, UPDATE_LOCK_STALE_MS } from "../src/update-lock.js";

test("update lock is exclusive and only its owner can release it", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "app", "update.lock");
  const first = await acquireUpdateLock({ lockPath, pid: 101, randomToken: () => "owner-token-101-abcdefghijkl" });
  const lockText = await readFile(lockPath, "utf8");
  assert.doesNotMatch(lockText, /prefix|argv|path/i);
  await assert.rejects(
    () => acquireUpdateLock({ lockPath, pid: 202, randomToken: () => "owner-token-202-abcdefghijkl" }),
    (error) => error.code === "concurrent-update"
  );
  const current = JSON.parse(lockText);
  await writeFile(lockPath, JSON.stringify({ ...current, ownerToken: "different-owner-abcdefghijkl" }));
  assert.equal(await first.release(), false);
  await writeFile(lockPath, lockText);
  assert.equal(await first.release(), true);
});

test("stale lock is removed and reacquired with a fresh exclusive create", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-stale-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "update.lock");
  const now = Date.parse("2026-07-24T00:00:00.000Z");
  await writeFile(lockPath, JSON.stringify({
    version: 1,
    pid: 1,
    startedAt: new Date(now - UPDATE_LOCK_STALE_MS - 1).toISOString(),
    ownerToken: "stale-owner-abcdefghijkl"
  }));
  const lock = await acquireUpdateLock({
    lockPath,
    now: () => now,
    randomToken: () => "fresh-owner-abcdefghijkl",
    isProcessAlive: () => false
  });
  const content = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(content.ownerToken, "fresh-owner-abcdefghijkl");
  assert.equal(await lock.release(), true);
});

test("an old lock owned by a live process is never removed by age alone", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-live-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "update.lock");
  const now = Date.parse("2026-07-24T00:00:00.000Z");
  await writeFile(lockPath, JSON.stringify({
    version: 1,
    pid: 321,
    startedAt: new Date(now - UPDATE_LOCK_STALE_MS - 1).toISOString(),
    ownerToken: "live-owner-abcdefghijkl"
  }));
  await assert.rejects(
    () => acquireUpdateLock({
      lockPath,
      now: () => now,
      randomToken: () => "second-owner-abcdefghijkl",
      isProcessAlive: (pid) => pid === 321
    }),
    (error) => error.code === "concurrent-update"
  );
  assert.match(await readFile(lockPath, "utf8"), /live-owner/);
});

test("a fresh partially written lock is treated as active instead of stale", async () => {
  let unlinked = false;
  const now = Date.parse("2026-07-24T00:00:00.000Z");
  await assert.rejects(
    () => acquireUpdateLock({
      lockPath: "/tmp/cmr-fresh-partial-lock/update.lock",
      fs: {
        async mkdir() {},
        async open() {
          const error = new Error("exists");
          error.code = "EEXIST";
          throw error;
        },
        async readFile() { return ""; },
        async stat() { return { mtimeMs: now }; },
        async unlink() { unlinked = true; }
      },
      now: () => now,
      randomToken: () => "partial-race-owner-abcdefghijkl"
    }),
    (error) => error.code === "concurrent-update"
  );
  assert.equal(unlinked, false);
});

test("partial lock creation is cleaned up when writing the record fails", async () => {
  let unlinked = false;
  let closed = false;
  await assert.rejects(
    () => acquireUpdateLock({
      lockPath: "/tmp/cmr-partial-lock/update.lock",
      fs: {
        async mkdir() {},
        async open() {
          return {
            async writeFile() { throw new Error("disk full"); },
            async close() { closed = true; }
          };
        },
        async unlink() { unlinked = true; },
        async readFile() { throw new Error("unexpected read"); }
      },
      randomToken: () => "partial-owner-abcdefghijkl"
    }),
    /could not create the update lock/
  );
  assert.equal(closed, true);
  assert.equal(unlinked, true);
});
