import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSecretStorePath } from "./platform.js";

const DEFAULT_PROVIDER_IDS = Object.freeze(["kimi", "deepseek"]);
const MAX_SECRET_LENGTH = 16_384;

function assertProvider(provider, providerIds) {
  if (!providerIds.has(provider)) throw new Error(`unknown provider: ${provider}`);
}

function assertSecret(secret) {
  if (typeof secret !== "string" || secret.trim().length === 0) throw new Error("secret cannot be empty");
  if (secret !== secret.trim()) throw new Error("secret cannot start or end with whitespace");
  if (secret.includes("\n") || secret.includes("\r")) throw new Error("secret cannot contain a line break");
  if (secret.includes("\0")) throw new Error("secret cannot contain a null byte");
  if (secret.length > MAX_SECRET_LENGTH) throw new Error("secret is too long");
}

function parseStore(raw, providerIds) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("secret store is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || !value.providers || typeof value.providers !== "object") {
    throw new Error("secret store has an invalid schema");
  }
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, "version") || !Object.hasOwn(value, "providers")) {
    throw new Error("secret store has an invalid schema");
  }
  for (const key of Object.keys(value.providers)) {
    assertProvider(key, providerIds);
    try {
      assertSecret(value.providers[key]);
    } catch {
      throw new Error("secret store has an invalid secret");
    }
  }
  return value;
}

export class SecretStore {
  constructor(options = {}) {
    this.filePath = options.filePath ?? getSecretStorePath(options);
    this.platform = options.platform ?? process.platform;
    this.providerIds = new Set(options.providerIds ?? DEFAULT_PROVIDER_IDS);
    this.fs = options.fs ?? { mkdir, readFile, writeFile, rename, chmod, unlink };
  }

  async readAll() {
    let raw;
    try {
      raw = await this.fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, providers: {} };
      throw new Error(`cannot read secret store: ${error.code ?? error.message}`);
    }
    return parseStore(raw, this.providerIds);
  }

  async get(provider) {
    assertProvider(provider, this.providerIds);
    const store = await this.readAll();
    return store.providers[provider] ?? null;
  }

  async status() {
    const store = await this.readAll();
    return Object.fromEntries([...this.providerIds].sort().map((provider) => [provider, Boolean(store.providers[provider])]));
  }

  async set(provider, secret) {
    assertProvider(provider, this.providerIds);
    assertSecret(secret);
    const store = await this.readAll();
    store.providers[provider] = secret;
    const directory = path.dirname(this.filePath);
    try {
      await this.fs.mkdir(directory, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw new Error(`cannot prepare secret store directory: ${error.code ?? error.message}`);
    }
    try {
      await this.fs.chmod(directory, 0o700);
    } catch (error) {
      if (this.platform !== "win32") {
        throw new Error(`cannot secure secret store directory: ${error.code ?? error.message}`);
      }
      // Windows permissions are verified by the platform-specific implementation later.
    }
    const temporaryPath = path.join(directory, `.secrets-${randomUUID()}.tmp`);
    const serialized = `${JSON.stringify(store, null, 2)}\n`;
    try {
      await this.fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      try {
        await this.fs.chmod(temporaryPath, 0o600);
      } catch (error) {
        if (this.platform !== "win32") throw error;
        // chmod is not authoritative on Windows.
      }
      await this.fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      try {
        await this.fs.unlink(temporaryPath);
      } catch {
        // Preserve the original error without exposing a secret.
      }
      throw new Error(`cannot write secret store: ${error.code ?? error.message}`);
    }
  }

  async readSecretsForRedaction() {
    const store = await this.readAll();
    return Object.values(store.providers);
  }
}

function inputError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function readHiddenSecret({ input = process.stdin, output = process.stderr, label = "Secret" } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") throw new Error("interactive secret input requires a TTY");
  output.write(`${label} (input hidden): `);
  return new Promise((resolve, reject) => {
    let value = "";
    let rawModeEnabled = false;
    let settled = false;
    let submitHandle;
    let pendingTerminator = null;
    const cleanup = () => {
      if (submitHandle !== undefined) clearImmediate(submitHandle);
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("close", onEnd);
      input.removeListener("error", onError);
      if (rawModeEnabled) {
        try {
          input.setRawMode(false);
        } catch {
          // The terminal may already be closed.
        }
      }
      try {
        input.pause();
      } catch {
        // The input stream may already be closed.
      }
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const rejectMultiline = () => finish(new Error("secret input must be a single line"));
    const scheduleSubmission = (terminator) => {
      pendingTerminator = terminator;
      output.write("\n");
      submitHandle = setImmediate(() => finish());
    };
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      if (pendingTerminator !== null) {
        if (pendingTerminator === "\r" && text === "\n") {
          pendingTerminator = "\r\n";
          return;
        }
        if (text.length > 0) rejectMultiline();
        return;
      }
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === "\u0003") {
          finish(inputError("secret input cancelled", "CMR_CANCELLED"));
          return;
        } else if (character === "\r" || character === "\n") {
          const isCrLf = character === "\r" && text[index + 1] === "\n";
          const trailingIndex = index + (isCrLf ? 2 : 1);
          if (trailingIndex < text.length) {
            rejectMultiline();
            return;
          }
          scheduleSubmission(isCrLf ? "\r\n" : character);
          return;
        } else if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
          if (value.length > MAX_SECRET_LENGTH) {
            finish(new Error("secret input is too long"));
            return;
          }
        }
      }
    };
    const onEnd = () => finish(inputError("secret input ended before submission", "CMR_CANCELLED"));
    const onError = () => finish(inputError("secret input failed", "CMR_INPUT_ERROR"));
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("close", onEnd);
    input.once("error", onError);
    try {
      input.setEncoding("utf8");
      rawModeEnabled = true;
      input.setRawMode(true);
      input.resume();
    } catch {
      finish(new Error("secret input could not be initialized"));
    }
  });
}
