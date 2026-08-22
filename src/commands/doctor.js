import { spawnSync } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfigSet } from "../config/loader.js";
import { isRouterManagedEnvironmentVariable } from "../environment.js";
import { SecretStore } from "../secret-store.js";
import { getClaudeUserSettingsPath } from "../settings-conflict.js";
import {
  findClaudeExecutable,
  buildSpawnSpec,
  getManagedSettingsPaths,
  getProjectSettingsPaths,
  getSecretStorePath,
  getShellProfilePaths
} from "../platform.js";

function line(status, message) {
  return `${status.padEnd(5)} ${message}`;
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readSettingsSummary(file, source) {
  if (!(await fileExists(file))) return { lines: [], keys: [] };
  const metadata = await stat(file);
  if (metadata.isDirectory()) {
    const entries = (await readdir(file)).filter((entry) => entry.endsWith(".json")).sort();
    const summaries = await Promise.all(entries.map((entry) => readSettingsSummary(path.join(file, entry), `${source}/${entry}`)));
    return {
      lines: summaries.flatMap((summary) => summary.lines),
      keys: [...new Set(summaries.flatMap((summary) => summary.keys))].sort()
    };
  }
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { lines: [line("FAIL", `${source} settings are not valid JSON`)], keys: [] };
  }
  const keys = [];
  if (data.env && typeof data.env === "object" && !Array.isArray(data.env)) {
    for (const key of Object.keys(data.env)) {
      if (isRouterManagedEnvironmentVariable(key)) keys.push(key);
    }
  }
  if (typeof data.apiKeyHelper === "string" && data.apiKeyHelper.length > 0) keys.push("apiKeyHelper");
  if (Object.hasOwn(data, "model")) keys.push("model");
  const uniqueKeys = [...new Set(keys)].sort();
  const lines = uniqueKeys.length > 0
    ? [line("WARN", `${source} settings contain router-related keys: ${uniqueKeys.join(", ")}`)]
    : [];
  return { lines, keys: uniqueKeys };
}

async function readShellSummary(file, source) {
  if (!(await fileExists(file))) return { lines: [], keys: [] };
  const text = await readFile(file, "utf8");
  const keys = [];
  const pattern = /(?:export\s+)?([A-Za-z][A-Za-z0-9_]+)\s*=/g;
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    if (/^\s*#/.test(rawLine)) continue;
    let match;
    while ((match = pattern.exec(rawLine)) !== null) {
      const key = match[1];
      if (isRouterManagedEnvironmentVariable(key)) keys.push(`${key}@${index + 1}`);
    }
    pattern.lastIndex = 0;
  }
  return {
    lines: keys.length > 0 ? [line("WARN", `${source} contains router-related exports: ${keys.sort().join(", ")}`)] : [],
    keys
  };
}

function getClaudeVersion(executable, env, platform, spawnSyncImpl = spawnSync) {
  if (!executable) return null;
  try {
    const safeEnv = {};
    for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC"]) {
      if (Object.hasOwn(env, key)) safeEnv[key] = env[key];
    }
    const spec = buildSpawnSpec(executable, { platform, env: safeEnv });
    const result = spawnSyncImpl(spec.command, [...spec.args, "--version"], {
      ...spec.options,
      env: safeEnv,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.error || result.status !== 0) return null;
    return String(result.stdout ?? "").trim().split(/\r?\n/, 1)[0] || null;
  } catch {
    return null;
  }
}

async function getPermissions(file) {
  try {
    const details = await stat(file);
    return details.mode & 0o777;
  } catch {
    return null;
  }
}

export async function runDoctor(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? os.homedir();
  const lines = [];
  const details = { settings: [], shell: [], environment: [], secrets: {} };
  lines.push(line("PASS", `OS ${platform}/${os.arch()} detected`));
  lines.push(line("PASS", `Node ${process.version} detected`));
  lines.push(line("INFO", `current directory: ${cwd}`));

  const claude = options.claudeExecutable === undefined
    ? await findClaudeExecutable({ platform, env, homedir: homeDir })
    : options.claudeExecutable;
  if (claude) {
    const version = getClaudeVersion(claude, env, platform, options.spawnSyncImpl ?? spawnSync);
    lines.push(line("PASS", `Claude Code ${version ?? "detected"} at ${claude}`));
  } else {
    lines.push(line("WARN", "Claude Code executable not found on PATH"));
  }

  const currentKeys = Object.keys(env).filter(isRouterManagedEnvironmentVariable).sort();
  details.environment = currentKeys;
  if (currentKeys.length > 0) {
    const states = currentKeys.map((key) => `${key}=${env[key] === undefined ? "unset" : "set"}`);
    lines.push(line("WARN", `current process has router-related keys: ${states.join(", ")}`));
  }
  else lines.push(line("PASS", "current process has no router-related keys"));
  const authenticationNames = new Set(["anthropic_api_key", "anthropic_auth_token"]);
  const authKeys = Object.keys(env).filter((key) => authenticationNames.has(key.toLowerCase()) && env[key]);
  if (authKeys.length > 1) lines.push(line("WARN", "multiple non-empty Anthropic authentication variables are present"));

  const settingsFiles = [
    [getClaudeUserSettingsPath({ platform, env, homedir: homeDir }), "user"],
    ...getProjectSettingsPaths(cwd).map((file, index) => [file, index === 0 ? "project" : "local"]),
    ...getManagedSettingsPaths({ platform }).map((file) => [file, "managed"])
  ];
  for (const [file, source] of settingsFiles) {
    const summary = await readSettingsSummary(file, source);
    if (summary.lines.length > 0) lines.push(...summary.lines);
    details.settings.push({ file, source, keys: summary.keys });
  }
  const settingsWithRouterKeys = details.settings.filter((item) => item.keys.length > 0);
  if (settingsWithRouterKeys.length > 0) lines.push(line("WARN", "settings env values can override inherited shell variables"));
  const userSettings = details.settings.find((item) => item.source === "user");
  if (userSettings) {
    const mode = await getPermissions(userSettings.file);
    if (mode !== null && platform !== "win32" && (mode & 0o077) !== 0) {
      lines.push(line("WARN", `user settings permissions are ${mode.toString(8).padStart(3, "0")}; review sensitive configuration exposure`));
    }
  }

  for (const file of getShellProfilePaths({ platform, env, homedir: homeDir })) {
    const summary = await readShellSummary(file, file);
    if (summary.lines.length > 0) lines.push(...summary.lines);
    details.shell.push({ file, keys: summary.keys });
  }
  if (details.shell.some((item) => item.keys.length > 0)) lines.push(line("WARN", "shell profiles contain persistent Anthropic-related exports"));

  let config;
  try {
    config = options.config ?? await loadConfigSet({ configRoot: options.configRoot, now: options.now });
    lines.push(line("PASS", `validated ${config.profiles.length} profiles and ${config.providers.length} providers`));
    details.config = {
      profiles: config.profiles.map((profile) => profile.id),
      providers: config.providers.map((provider) => provider.id),
      verifiedOn: [...config.providers, ...config.pricing, ...config.entitlements].map((item) => item.verifiedOn),
      warnings: config.warnings ?? []
    };
    for (const warning of config.warnings ?? []) lines.push(line("WARN", warning));
    const subscriptionRefs = new Set(
      config.profiles.filter((profile) => profile.costNotice === "subscription").map((profile) => profile.entitlementRef)
    );
    for (const entitlement of config.entitlements.filter((item) => subscriptionRefs.has(item.id))) {
      lines.push(line("INFO", `${entitlement.displayName}: subscription/quota; verified ${entitlement.verifiedOn}; ${entitlement.quotaNotice}`));
    }
  } catch (error) {
    lines.push(line("FAIL", `configuration validation failed: ${error.message}`));
  }

  const secretPath = getSecretStorePath({ platform, env, homedir: homeDir });
  if (config) {
    const secretStore = new SecretStore({
      filePath: secretPath,
      providerIds: config.providers.map((provider) => provider.secretId)
    });
    try {
      details.secrets = await secretStore.status();
      for (const provider of config.providers) {
        lines.push(line("INFO", `${provider.id} secret: ${details.secrets[provider.secretId] ? "configured" : "missing"}`));
      }
      const mode = await getPermissions(secretPath);
      if (mode !== null && platform !== "win32" && (mode & 0o077) !== 0) {
        lines.push(line("WARN", `secret store permissions are ${mode.toString(8).padStart(3, "0")}; expected owner-only`));
      }
    } catch (error) {
      lines.push(line("WARN", `secret store status unavailable: ${error.message}`));
    }
  } else {
    lines.push(line("WARN", "secret store status skipped because configuration is invalid"));
  }

  const gitignorePath = path.join(cwd, ".gitignore");
  if (await fileExists(gitignorePath)) {
    const gitignore = await readFile(gitignorePath, "utf8");
    const missing = [".DS_Store", "node_modules/", "*.log", ".env", "secrets*.json"].filter((entry) => !gitignore.includes(entry));
    if (missing.length === 0) lines.push(line("PASS", ".gitignore covers local secrets, logs, dependencies and .DS_Store"));
    else lines.push(line("WARN", `.gitignore is missing coverage for: ${missing.join(", ")}`));
  } else {
    lines.push(line("WARN", ".gitignore is missing"));
  }

  return { lines, text: lines.join("\n"), details };
}
