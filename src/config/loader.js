import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfigSet, validatePricing, validateProfile, validateProvider } from "./validator.js";

const DEFAULT_CONFIG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config");
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertKnownId(id, label) {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new Error(`${label} is invalid`);
}

function resolveConfigFile(configRoot, category, id) {
  assertKnownId(id, `${category} id`);
  const root = path.resolve(configRoot);
  const file = path.resolve(root, category, `${id}.json`);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error("configuration path escaped config root");
  return file;
}

async function readJson(configRoot, category, id) {
  const file = resolveConfigFile(configRoot, category, id);
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${category} configuration ${id}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${category} configuration ${id} is not valid JSON`);
  }
}

export async function loadProvider(id, options = {}) {
  const provider = await readJson(options.configRoot ?? DEFAULT_CONFIG_ROOT, "providers", id);
  return validateProvider(provider, options);
}

export async function loadProfile(id, options = {}) {
  const providerIds = new Set(options.providerIds ?? ["kimi", "deepseek"]);
  const profile = await readJson(options.configRoot ?? DEFAULT_CONFIG_ROOT, "profiles", id);
  return validateProfile(profile, providerIds);
}

export function resolveProfile(profiles, selector) {
  return profiles.find((profile) => profile.id === selector)
    ?? profiles.find((profile) => profile.aliases.includes(selector))
    ?? null;
}

export async function loadPricing(id, options = {}) {
  const pricing = await readJson(options.configRoot ?? DEFAULT_CONFIG_ROOT, "pricing", id);
  return validatePricing(pricing, options);
}

export async function loadConfigSet(options = {}) {
  const configRoot = options.configRoot ?? DEFAULT_CONFIG_ROOT;
  const providerIds = ["kimi", "deepseek"];
  const profileIds = ["kimi", "deepseek"];
  const pricingIds = ["kimi-k3", "deepseek-v4"];
  const [providers, profiles, pricing] = await Promise.all([
    Promise.all(providerIds.map((id) => loadProvider(id, { ...options, configRoot }))),
    Promise.all(profileIds.map((id) => loadProfile(id, { ...options, configRoot, providerIds }))),
    Promise.all(pricingIds.map((id) => loadPricing(id, { ...options, configRoot })))
  ]);
  validateConfigSet({ providers, profiles, pricing, now: options.now });
  return { providers, profiles, pricing };
}

export function getDefaultConfigRoot() {
  return DEFAULT_CONFIG_ROOT;
}

export function getConfigPath(category, id, configRoot = DEFAULT_CONFIG_ROOT) {
  return resolveConfigFile(configRoot, category, id);
}
