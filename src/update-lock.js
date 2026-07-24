import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const UPDATE_LOCK_SCHEMA_VERSION = 1;
export const UPDATE_LOCK_STALE_MS = 10 * 60 * 1000;

export class UpdateLockError extends Error {
  constructor(message, code = "lock-unavailable") {
    super(message);
    this.name = "UpdateLockError";
    this.code = code;
  }
}

function makeOwnerToken(randomToken = () => randomBytes(16).toString("hex")) {
  const token = randomToken();
  if (typeof token !== "string" || token.length < 16 || /[^A-Za-z0-9_-]/.test(token)) {
    throw new TypeError("lock owner token is invalid");
  }
  return token;
}

function parseLock(text) {
  try {
    const value = JSON.parse(text);
    if (value?.version !== UPDATE_LOCK_SCHEMA_VERSION
      || !Number.isInteger(value.pid)
      || value.pid <= 0
      || typeof value.startedAt !== "string"
      || typeof value.ownerToken !== "string") return null;
    const startedAt = Date.parse(value.startedAt);
    if (!Number.isFinite(startedAt)) return null;
    return { ...value, startedAtMs: startedAt };
  } catch {
    return null;
  }
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

export async function acquireUpdateLock({
  lockPath,
  fs: fsApi = { mkdir, open, readFile, stat, unlink },
  pid = process.pid,
  now = () => Date.now(),
  staleMs = UPDATE_LOCK_STALE_MS,
  randomToken,
  isProcessAlive = defaultIsProcessAlive
} = {}) {
  if (typeof lockPath !== "string" || lockPath.length === 0) throw new TypeError("lockPath is required");
  await fsApi.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ownerToken = makeOwnerToken(randomToken);
    const record = {
      version: UPDATE_LOCK_SCHEMA_VERSION,
      pid,
      startedAt: new Date(now()).toISOString(),
      ownerToken
    };
    let handle;
    try {
      handle = await fsApi.open(lockPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify(record));
      await handle.close();
      return {
        lockPath,
        ownerToken,
        async release() {
          let current;
          try {
            current = parseLock(await fsApi.readFile(lockPath, "utf8"));
          } catch (error) {
            if (error?.code === "ENOENT") return false;
            return false;
          }
          if (!current || current.ownerToken !== ownerToken) return false;
          try {
            await fsApi.unlink(lockPath);
            return true;
          } catch (error) {
            if (error?.code === "ENOENT") return false;
            throw error;
          }
        }
      };
    } catch (error) {
      try {
        await handle?.close();
      } catch {
        // The original lock error is more useful than a close error.
      }
      if (handle && error?.code !== "EEXIST") {
        try {
          await fsApi.unlink(lockPath);
        } catch {
          // Preserve the original lock creation error.
        }
      }
      if (error?.code !== "EEXIST") throw new UpdateLockError("could not create the update lock");

      let existingText;
      try {
        existingText = await fsApi.readFile(lockPath, "utf8");
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        throw new UpdateLockError("another update is using this installation", "concurrent-update");
      }
      const observedAt = now();
      const existing = parseLock(existingText);
      if (existing) {
        if (observedAt - existing.startedAtMs <= staleMs || await isProcessAlive(existing.pid)) {
          throw new UpdateLockError("another update is using this installation", "concurrent-update");
        }
      } else {
        let lockStat;
        try {
          lockStat = await fsApi.stat(lockPath);
        } catch (statError) {
          if (statError?.code === "ENOENT") continue;
          throw new UpdateLockError("another update is using this installation", "concurrent-update");
        }
        const modifiedAt = Number(lockStat?.mtimeMs);
        if (!Number.isFinite(modifiedAt) || observedAt - modifiedAt <= staleMs) {
          throw new UpdateLockError("another update is using this installation", "concurrent-update");
        }
      }
      try {
        await fsApi.unlink(lockPath);
      } catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") throw new UpdateLockError("stale update lock could not be cleared");
      }
    }
  }
  throw new UpdateLockError("another update is using this installation", "concurrent-update");
}
