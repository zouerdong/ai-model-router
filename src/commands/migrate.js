import { copyFile, chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { ROUTER_MANAGED_ENV_VARS } from "../environment.js";
import { getHomeDir } from "../platform.js";

export const MIGRATION_REMOVE_ENV_VARS = Object.freeze([
  ...ROUTER_MANAGED_ENV_VARS
]);

const MIGRATION_REMOVE_SHELL_KEYS = Object.freeze([
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY"
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function removeRouterSettings(data) {
  const beforePreserved = structuredClone(data);
  const removedEnvKeys = [];
  if (data.env && typeof data.env === "object" && !Array.isArray(data.env)) {
    for (const key of MIGRATION_REMOVE_ENV_VARS) {
      if (Object.hasOwn(data.env, key)) {
        delete data.env[key];
        removedEnvKeys.push(key);
      }
    }
  }
  const removedTopLevelModel = Object.hasOwn(data, "model");
  if (removedTopLevelModel) delete data.model;
  for (const key of ["env", "model"]) {
    if (key === "env" && beforePreserved.env && typeof beforePreserved.env === "object") {
      for (const envKey of MIGRATION_REMOVE_ENV_VARS) delete beforePreserved.env[envKey];
    }
    if (key === "model") delete beforePreserved.model;
  }
  return {
    data,
    removedEnvKeys: removedEnvKeys.sort(),
    removedTopLevelModel,
    preservedDigestBefore: digest(beforePreserved),
    preservedDigestAfter: digest(data)
  };
}

function removeRouterShellExports(text) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = text.endsWith(newline);
  const removed = [];
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line, index) => {
    const normalized = line.replace(/\r$/, "");
    if (/^\s*#/.test(normalized)) return true;
    const match = normalized.match(/^\s*export\s+(ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY)\s*=/);
    if (!match) return true;
    removed.push({ line: index + 1, key: match[1] });
    return false;
  });
  let output = kept.join(newline);
  if (hadTrailingNewline && !output.endsWith(newline)) output += newline;
  return { text: output, removed };
}

async function writeTemporary(file, content) {
  const temporary = `${file}.cmr-${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(temporary, 0o600);
  return temporary;
}

async function removeIfPresent(file) {
  if (!file) return;
  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function makeBackup(sourceFiles, backupRoot) {
  const parent = path.dirname(backupRoot);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  await mkdir(backupRoot, { recursive: false, mode: 0o700 });
  await chmod(backupRoot, 0o700);
  for (const [source, name] of sourceFiles) {
    await copyFile(source, path.join(backupRoot, name));
    await chmod(path.join(backupRoot, name), 0o600);
  }
}

export async function migrateLocalConfig(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") throw new Error("phase-1 local migration only supports macOS");
  const homeDir = options.homeDir ?? getHomeDir({ platform, env: options.env ?? process.env, homedir: os.homedir() });
  const settingsPath = options.settingsPath ?? path.join(homeDir, ".claude", "settings.json");
  const shellPath = options.shellPath ?? path.join(homeDir, ".zshrc");
  const backupRoot = options.backupRoot ?? path.join(homeDir, "Library", "Application Support", "ClaudeModelRouter", "backups", "phase-1-20260718-before-migration");

  const originalSettings = await readFile(settingsPath, "utf8");
  const originalShell = await readFile(shellPath, "utf8");
  let settingsData;
  try {
    settingsData = JSON.parse(originalSettings);
  } catch {
    throw new Error("settings.json is not valid JSON; migration stopped before backup");
  }
  const settingsResult = removeRouterSettings(settingsData);
  const shellResult = removeRouterShellExports(originalShell);
  if (settingsResult.preservedDigestBefore !== settingsResult.preservedDigestAfter) {
    throw new Error("migration would change non-router settings; migration stopped before backup");
  }

  await makeBackup([[settingsPath, "settings.json"], [shellPath, ".zshrc"]], backupRoot);
  const backupSettings = await readFile(path.join(backupRoot, "settings.json"), "utf8");
  const backupShell = await readFile(path.join(backupRoot, ".zshrc"), "utf8");
  if (backupSettings !== originalSettings || backupShell !== originalShell) {
    throw new Error("backup verification failed; migration stopped before touching user files");
  }

  const settingsTemporary = await writeTemporary(settingsPath, `${JSON.stringify(settingsData, null, 2)}\n`);
  const shellTemporary = await writeTemporary(shellPath, shellResult.text);
  let settingsReplaced = false;
  let shellReplaced = false;
  try {
    const syntaxCheck = spawnSync("/bin/zsh", ["-n", shellTemporary], { stdio: "ignore" });
    if (syntaxCheck.status !== 0) throw new Error("migrated .zshrc failed syntax validation");
    JSON.parse(await readFile(settingsTemporary, "utf8"));
    await rename(settingsTemporary, settingsPath);
    settingsReplaced = true;
    await rename(shellTemporary, shellPath);
    shellReplaced = true;
    await chmod(settingsPath, 0o600);
    await chmod(shellPath, 0o600);
  } catch (error) {
    await removeIfPresent(settingsTemporary);
    await removeIfPresent(shellTemporary);
    const rollbackErrors = [];
    if (settingsReplaced) {
      try {
        await copyFile(path.join(backupRoot, "settings.json"), settingsPath);
        await chmod(settingsPath, 0o600);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (shellReplaced) {
      try {
        await copyFile(path.join(backupRoot, ".zshrc"), shellPath);
        await chmod(shellPath, 0o600);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "migration failed and automatic rollback was incomplete");
    }
    throw error;
  }

  const settingsMode = (await stat(settingsPath)).mode & 0o777;
  const shellMode = (await stat(shellPath)).mode & 0o777;
  return {
    settingsPath,
    shellPath,
    backupRoot,
    removedEnvKeys: settingsResult.removedEnvKeys,
    removedTopLevelModel: settingsResult.removedTopLevelModel,
    removedShellExports: shellResult.removed,
    preservedNonRouterSettings: settingsResult.preservedDigestBefore === settingsResult.preservedDigestAfter,
    settingsMode,
    shellMode
  };
}
