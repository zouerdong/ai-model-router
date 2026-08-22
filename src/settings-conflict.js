import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isRouterManagedEnvironmentVariable } from "./environment.js";
import { getManagedSettingsPaths, getProjectSettingsPaths, getUserSettingsPath } from "./platform.js";

// Claude Code applies the `env` map from its settings files on top of the environment a wrapper
// injects (official env-vars documentation: the settings-file value replaces the inherited value,
// including empty-string cancellation), so any router-managed key silently redirects a CMR
// session to another endpoint or credential. Provider switchers such as CC Switch persist
// exactly these keys into ~/.claude/settings.json. apiKeyHelper is NOT a conflict: CMR always
// injects ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY, both of which outrank apiKeyHelper in
// Claude Code's authentication precedence.
export function getClaudeUserSettingsPath({ platform = process.platform, env = process.env, homedir } = {}) {
  // CLAUDE_CONFIG_DIR and the home directory are host-runtime paths (host == target platform in
  // real use), so they join with the host path API; only managed system paths are cross-host fixed.
  const configDir = env?.CLAUDE_CONFIG_DIR;
  if (typeof configDir === "string" && configDir.length > 0) {
    return path.join(configDir, "settings.json");
  }
  return getUserSettingsPath({ platform, env, homedir });
}

function settingsCandidates({ platform = process.platform, env = process.env, cwd = process.cwd(), homedir } = {}) {
  return [
    { file: getClaudeUserSettingsPath({ platform, env, homedir }), source: "user", pathApi: path },
    ...getProjectSettingsPaths(cwd).map((file, index) => ({ file, source: index === 0 ? "project" : "local", pathApi: path })),
    ...getManagedSettingsPaths({ platform }).map((file) => ({
      file,
      source: "managed",
      // Managed paths use the target platform's separators (getManagedSettingsPaths); drop-in
      // children must join with the same API even on a host whose native separator differs.
      pathApi: platform === "win32" ? path.win32 : path.posix
    }))
  ];
}

async function readSettingsObject(file, fs) {
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value;
  } catch {
    // Unreadable settings are a doctor concern; the preflight only blocks on detectable conflicts.
    return null;
  }
}

function conflictsInSettings(data) {
  const envKeys = [];
  if (data.env && typeof data.env === "object" && !Array.isArray(data.env)) {
    for (const key of Object.keys(data.env)) {
      if (isRouterManagedEnvironmentVariable(key)) envKeys.push(key);
    }
  }
  // An empty-string settings value also cancels the injected variable, so presence is enough.
  if (envKeys.length === 0) return null;
  return { envKeys: [...new Set(envKeys)].sort() };
}

export async function collectSettingsConflicts({
  platform = process.platform,
  env = process.env,
  cwd = process.cwd(),
  homedir,
  fs = { readFile, readdir, stat }
} = {}) {
  const conflicts = [];
  for (const { file, source, pathApi } of settingsCandidates({ platform, env, cwd, homedir })) {
    let metadata;
    try {
      metadata = await fs.stat(file);
    } catch {
      continue;
    }
    if (metadata.isDirectory()) {
      let entries;
      try {
        entries = await fs.readdir(file);
      } catch {
        continue;
      }
      for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
        const childFile = pathApi.join(file, entry);
        const data = await readSettingsObject(childFile, fs);
        const found = data && conflictsInSettings(data);
        if (found) conflicts.push({ file: childFile, sources: [`${source}/${entry}`], ...found });
      }
      continue;
    }
    const data = await readSettingsObject(file, fs);
    const found = data && conflictsInSettings(data);
    if (found) conflicts.push({ file, sources: [source], ...found });
  }
  // The same file can appear in several roles (e.g. cwd == HOME); report it once.
  const byFile = new Map();
  for (const conflict of conflicts) {
    const existing = byFile.get(conflict.file);
    if (!existing) {
      byFile.set(conflict.file, conflict);
      continue;
    }
    existing.sources = [...new Set([...existing.sources, ...conflict.sources])];
    existing.envKeys = [...new Set([...existing.envKeys, ...conflict.envKeys])].sort();
  }
  return [...byFile.values()];
}

export function formatSettingsConflicts(conflicts) {
  const parts = [];
  for (const conflict of conflicts) {
    if (conflict.envKeys.length === 0) continue;
    parts.push(`${conflict.file} (${conflict.sources.join(", ")}) env keys: ${conflict.envKeys.join(", ")}`);
  }
  if (parts.length === 0) return null;
  return [
    "Claude Code settings override this CMR profile:",
    ...parts.map((part) => `- ${part}`),
    "Claude Code applies settings env on top of the CMR environment, so the session would not use the selected provider.",
    "Provider switchers such as CC Switch write these keys into Claude Code settings; remove them (or switch providers through CMR), then rerun cmr. cmr doctor lists every conflict."
  ].join("\n");
}

export async function assertNoSettingsConflicts(rest) {
  const message = formatSettingsConflicts(await collectSettingsConflicts(rest));
  if (message) throw new Error(message);
}
