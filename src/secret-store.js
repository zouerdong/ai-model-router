import { chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfigSet } from "./config/loader.js";
import { getSecretStorePath } from "./platform.js";

const MAX_SECRET_LENGTH = 16_384;
const ESCAPE_SEQUENCE_LIMIT = 128;
const CANCEL_CHARACTER = "\u0003"; // Ctrl+C
const EOF_CHARACTER = "\u0004"; // Ctrl+D
const ESCAPE_CHARACTER = "\u001b";
const BEL_CHARACTER = "\u0007";

function isStrayControlCharacter(character) {
  const code = character.charCodeAt(0);
  // C0 controls (minus the handled keys), DEL, and C1 controls never belong in a stored key.
  return (code <= 0x1f && character !== "\b") || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}

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
    // Keys written by newer CMR versions are preserved as opaque data; only known providers are validated.
    if (!providerIds.has(key)) continue;
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
    this.configRoot = options.configRoot;
    this.providerIds = options.providerIds === undefined ? null : new Set(options.providerIds);
    this.fs = options.fs ?? { mkdir, readFile, writeFile, rename, chmod, unlink, readdir, stat };
  }

  async getProviderIds() {
    if (this.providerIds) return this.providerIds;
    const config = await loadConfigSet({ configRoot: this.configRoot });
    this.providerIds = new Set(config.providers.map((provider) => provider.secretId));
    return this.providerIds;
  }

  async readAll() {
    let raw;
    try {
      raw = await this.fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, providers: {} };
      throw new Error(`cannot read secret store: ${error.code ?? error.message}`);
    }
    return parseStore(raw, await this.getProviderIds());
  }

  async get(provider) {
    assertProvider(provider, await this.getProviderIds());
    const store = await this.readAll();
    return store.providers[provider] ?? null;
  }

  async status() {
    const providerIds = await this.getProviderIds();
    const store = await this.readAll();
    return Object.fromEntries([...providerIds].sort().map((provider) => [provider, Boolean(store.providers[provider])]));
  }

  async set(provider, secret) {
    assertProvider(provider, await this.getProviderIds());
    assertSecret(secret);
    const store = await this.readAll();
    store.providers[provider] = secret;
    const directory = path.dirname(this.filePath);
    try {
      await this.fs.mkdir(directory, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw new Error(`cannot prepare secret store directory: ${error.code ?? error.message}`);
    }
    await this.sweepTemporaryFiles(directory);
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

  // A crash between writeFile and rename leaves a full-copy .secrets-<uuid>.tmp behind forever;
  // only files older than maxAgeMs are removed so a concurrent writer is never disturbed.
  async sweepTemporaryFiles(directory, { maxAgeMs = 10 * 60 * 1000, now = Date.now() } = {}) {
    if (typeof this.fs.readdir !== "function" || typeof this.fs.stat !== "function" || typeof this.fs.unlink !== "function") {
      return;
    }
    let entries;
    try {
      entries = await this.fs.readdir(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (typeof entry !== "string" || !entry.startsWith(".secrets-") || !entry.endsWith(".tmp")) continue;
      let details;
      try {
        details = await this.fs.stat(path.join(directory, entry));
      } catch {
        continue;
      }
      if (!details || typeof details.mtimeMs !== "number" || now - details.mtimeMs < maxAgeMs) continue;
      try {
        await this.fs.unlink(path.join(directory, entry));
      } catch {
        // A concurrent writer may have replaced it; a later run sweeps again.
      }
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
    // Raw mode delivers editing keys as escape sequences (CSI/SS3/OSC); their bytes must never
    // fold into the stored secret, even when a sequence is split across separate reads.
    let escapeState = null;
    let escapeRun = 0;
    const consumeEscapeCharacter = (character) => {
      escapeRun += 1;
      if (escapeRun > ESCAPE_SEQUENCE_LIMIT) {
        escapeState = null;
        return;
      }
      if (escapeState === "escape") {
        if (character === "[" || character === "O") escapeState = "sequence";
        else if (character === "]" || character === "P" || character === "X" || character === "^" || character === "_") escapeState = "string";
        else escapeState = null; // A lone ESC plus one key is an Alt binding; the key belongs to the sequence.
        return;
      }
      if (escapeState === "sequence") {
        // Parameter/intermediate bytes (0x20-0x3F) continue a CSI/SS3 sequence; a final byte (0x40-0x7E) ends it.
        if (character >= "@" && character <= "~") escapeState = null;
        else if (!(character >= " " && character <= "?")) escapeState = null;
        return;
      }
      // "string" (OSC/DCS payload) ends at BEL; ESC is accepted as a simplified string terminator.
      if (character === BEL_CHARACTER || character === ESCAPE_CHARACTER) escapeState = null;
    };
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
        if (character === CANCEL_CHARACTER || character === EOF_CHARACTER) {
          finish(inputError("secret input cancelled", "CMR_CANCELLED"));
          return;
        }
        if (escapeState !== null) {
          consumeEscapeCharacter(character);
          continue;
        }
        if (character === ESCAPE_CHARACTER) {
          escapeState = "escape";
          escapeRun = 1;
          continue;
        }
        if (character === "\r" || character === "\n") {
          const isCrLf = character === "\r" && text[index + 1] === "\n";
          const trailingIndex = index + (isCrLf ? 2 : 1);
          if (trailingIndex < text.length) {
            rejectMultiline();
            return;
          }
          scheduleSubmission(isCrLf ? "\r\n" : character);
          return;
        } else if (character === "\u007f" || character === "\b") {
          // Remove a full code point: slice(0, -1) would split a surrogate pair pasted as one glyph.
          value = Array.from(value).slice(0, -1).join("");
        } else if (isStrayControlCharacter(character)) {
          continue;
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
