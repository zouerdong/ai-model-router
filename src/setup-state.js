import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSetupStatePath } from "./platform.js";

const STATE_VERSION = 1;
// Mirrors the config loader's ID_PATTERN (src/config/loader.js): dots are valid provider IDs,
// and a stricter pattern here would wedge the first-run loop for every dotted provider.
const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export class SetupStateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SetupStateError";
    this.code = code;
  }
}

function validateProviderIds(providerIds, label = "provider IDs") {
  if (!Array.isArray(providerIds)) throw new SetupStateError("CMR_SETUP_STATE_INPUT", `${label} must be an array`);
  const seen = new Set();
  for (const id of providerIds) {
    if (typeof id !== "string" || !PROVIDER_ID_PATTERN.test(id)) {
      throw new SetupStateError("CMR_SETUP_STATE_INPUT", `${label} contain invalid IDs`);
    }
    if (seen.has(id)) throw new SetupStateError("CMR_SETUP_STATE_INPUT", `${label} contain duplicates`);
    seen.add(id);
  }
  return [...seen];
}

function parseState(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SetupStateError("CMR_SETUP_STATE_CORRUPT", "setup state is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 2
    || !Object.hasOwn(value, "version")
    || !Object.hasOwn(value, "seenProviderIds")
    || value.version !== STATE_VERSION) {
    throw new SetupStateError("CMR_SETUP_STATE_CORRUPT", "setup state has an invalid schema");
  }
  if (!Array.isArray(value.seenProviderIds) || value.seenProviderIds.length === 0) {
    throw new SetupStateError("CMR_SETUP_STATE_CORRUPT", "setup state has an invalid provider list");
  }
  try {
    validateProviderIds(value.seenProviderIds, "setup state provider IDs");
  } catch {
    throw new SetupStateError("CMR_SETUP_STATE_CORRUPT", "setup state has an invalid provider list");
  }
  const sorted = [...value.seenProviderIds].sort();
  if (sorted.some((id, index) => id !== value.seenProviderIds[index])
    || new Set(value.seenProviderIds).size !== value.seenProviderIds.length) {
    throw new SetupStateError("CMR_SETUP_STATE_CORRUPT", "setup state provider IDs are not sorted and unique");
  }
  return { exists: true, version: STATE_VERSION, seenProviderIds: [...value.seenProviderIds] };
}

export class SetupStateStore {
  constructor(options = {}) {
    this.filePath = options.filePath ?? getSetupStatePath(options);
    this.platform = options.platform ?? process.platform;
    this.fs = options.fs ?? { mkdir, readFile, writeFile, rename, chmod, unlink };
  }

  async read() {
    let raw;
    try {
      raw = await this.fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { exists: false, version: STATE_VERSION, seenProviderIds: [] };
      throw new SetupStateError("CMR_SETUP_STATE_READ", "cannot read setup state");
    }
    return parseState(raw);
  }

  async getUnseenProviderIds(currentProviderIds) {
    const current = validateProviderIds(currentProviderIds, "current provider IDs");
    const state = await this.read();
    return current.filter((id) => !state.seenProviderIds.includes(id));
  }

  async markSeen(currentProviderIds, { rebuildCorrupt = false } = {}) {
    const current = validateProviderIds(currentProviderIds, "current provider IDs");
    let state;
    try {
      state = await this.read();
    } catch (error) {
      if (!rebuildCorrupt || error.code !== "CMR_SETUP_STATE_CORRUPT") throw error;
      state = { exists: false, seenProviderIds: [] };
    }
    const seenProviderIds = [...new Set([...state.seenProviderIds, ...current])].sort();
    if (seenProviderIds.length === 0) throw new SetupStateError("CMR_SETUP_STATE_INPUT", "current provider IDs cannot be empty");
    const value = { version: STATE_VERSION, seenProviderIds };
    await this.write(value);
    return { exists: true, ...value };
  }

  async write(value) {
    const directory = path.dirname(this.filePath);
    try {
      await this.fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await this.fs.chmod(directory, 0o700);
    } catch (error) {
      if (this.platform !== "win32" || error.code !== "EPERM") {
        throw new SetupStateError("CMR_SETUP_STATE_WRITE", "cannot secure setup state directory");
      }
    }
    const temporaryPath = path.join(directory, `.state-${randomUUID()}.tmp`);
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    try {
      await this.fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      try {
        await this.fs.chmod(temporaryPath, 0o600);
      } catch (error) {
        if (this.platform !== "win32") throw error;
      }
      await this.fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      try {
        await this.fs.unlink(temporaryPath);
      } catch {
        // Preserve the stable error category without exposing paths or file contents.
      }
      throw new SetupStateError("CMR_SETUP_STATE_WRITE", "cannot write setup state");
    }
  }
}

export function isSetupStateCorrupt(error) {
  return error?.code === "CMR_SETUP_STATE_CORRUPT";
}
