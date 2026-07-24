import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SUPPORTED_PLATFORMS = new Set(["darwin", "win32"]);

export function getHomeDir({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  if (platform === "win32") return env.USERPROFILE || homedir;
  return env.HOME || homedir;
}

export function getApplicationDataDir({ platform = process.platform, env = process.env, homedir } = {}) {
  const home = getHomeDir({ platform, env, homedir });
  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "ClaudeModelRouter");
  }
  return path.join(home, "Library", "Application Support", "ClaudeModelRouter");
}

export function getSecretStorePath({ platform = process.platform, env = process.env, homedir } = {}) {
  return path.join(getApplicationDataDir({ platform, env, homedir }), "secrets.json");
}

export function getSetupStatePath({ platform = process.platform, env = process.env, homedir } = {}) {
  return path.join(getApplicationDataDir({ platform, env, homedir }), "state.json");
}

export function getUserSettingsPath({ platform = process.platform, env = process.env, homedir } = {}) {
  return path.join(getHomeDir({ platform, env, homedir }), ".claude", "settings.json");
}

export function getShellProfilePaths({ platform = process.platform, env = process.env, homedir } = {}) {
  const home = getHomeDir({ platform, env, homedir });
  if (platform === "win32") {
    return [
      path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
      path.join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1")
    ];
  }
  return [
    path.join(home, ".zshrc"),
    path.join(home, ".zprofile"),
    path.join(home, ".bashrc"),
    path.join(home, ".bash_profile")
  ];
}

export function getManagedSettingsPaths({ platform = process.platform } = {}) {
  if (platform === "win32") {
    return [
      path.join("C:", "Program Files", "ClaudeCode", "managed-settings.json"),
      path.join("C:", "Program Files", "ClaudeCode", "managed-settings.d")
    ];
  }
  return [
    path.join("/", "Library", "Application Support", "ClaudeCode", "managed-settings.json"),
    path.join("/", "Library", "Application Support", "ClaudeCode", "managed-settings.d")
  ];
}

export function getProjectSettingsPaths(cwd = process.cwd()) {
  return [
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json")
  ];
}

export async function isExecutable(file) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findClaudeExecutable({ platform = process.platform, env = process.env, pathValue, fsAccess = isExecutable } = {}) {
  const pathApi = platform === "win32" ? path.win32 : path;
  pathValue = getPathValue({ platform, env, pathValue });
  const names = platform === "win32" ? ["claude.exe", "claude.cmd", "claude.bat", "claude"] : ["claude"];
  const directories = pathValue.split(pathApi.delimiter).filter(Boolean);

  if (platform === "win32") {
    const homeDir = env?.USERPROFILE ?? env?.HOME ?? os.homedir();
    const fallbackDirs = [
      pathApi.join(homeDir, ".local", "bin"),
    ];
    for (const dir of fallbackDirs) {
      if (!directories.includes(dir)) directories.push(dir);
    }
  }

  for (const directory of directories) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (await fsAccess(candidate)) return candidate;
    }
  }
  return null;
}

function getPathValue({ platform, env, pathValue }) {
  if (pathValue !== undefined) return pathValue;
  if (platform === "win32") {
    const pathKey = Object.keys(env ?? {}).find((key) => key.toLowerCase() === "path");
    return pathKey === undefined ? "" : env[pathKey];
  }
  return env?.PATH ?? "";
}

async function findOnPath({ platform, env, pathValue, names, fsAccess }) {
  const pathApi = platform === "win32" ? path.win32 : path;
  const directories = String(getPathValue({ platform, env, pathValue }) ?? "")
    .split(pathApi.delimiter)
    .filter(Boolean);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (await fsAccess(candidate)) return candidate;
    }
  }
  return null;
}

export async function findNpmExecutable({ platform = process.platform, env = process.env, pathValue, fsAccess = isExecutable } = {}) {
  const names = platform === "win32" ? ["npm.cmd", "npm.exe", "npm.bat", "npm"] : ["npm"];
  return findOnPath({ platform, env, pathValue, names, fsAccess });
}

export function buildCommandSpawnSpec(executable, { platform = process.platform, env = process.env, args = [] } = {}) {
  if (!Array.isArray(args)) throw new TypeError("command args must be an array");
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(executable)) {
    return {
      command: env.ComSpec || env.COMSPEC || "cmd.exe",
      args: ["/d", "/c", executable, ...args],
      options: { shell: false }
    };
  }
  return { command: executable, args: [...args], options: { shell: false } };
}

export function buildSpawnSpec(executable, { platform = process.platform, env = process.env } = {}) {
  return buildCommandSpawnSpec(executable, { platform, env, args: [] });
}
