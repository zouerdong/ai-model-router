import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateConfigSet,
  validateEntitlement,
  validatePricing,
  validateProfile,
  validateProvider
} from "./validator.js";

const DEFAULT_CONFIG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config");
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const CATALOG_FILE = "catalog.json";

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

async function readCatalog(configRoot) {
  let raw;
  try {
    raw = await readFile(path.join(configRoot, CATALOG_FILE), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`cannot read configuration catalog: ${error.code ?? error.message}`);
  }
  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch {
    throw new Error("configuration catalog is not valid JSON");
  }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("configuration catalog has an invalid schema");
  }
  for (const [category, ids] of Object.entries(catalog)) {
    if (!["providers", "profiles", "pricing", "entitlements"].includes(category)
      || !Array.isArray(ids)
      || ids.some((id) => typeof id !== "string" || !ID_PATTERN.test(id))
      || new Set(ids).size !== ids.length) {
      throw new Error("configuration catalog has an invalid schema");
    }
  }
  return catalog;
}

async function discoverConfigIds(configRoot, category) {
  let entries;
  try {
    entries = await readdir(path.join(configRoot, category), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" && category === "entitlements") return [];
    throw new Error(`cannot read ${category} configuration directory: ${error.code ?? error.message}`);
  }
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5));
  for (const id of ids) assertKnownId(id, `${category} id`);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate ${category} configuration ID`);
  return ids;
}

function orderConfigIds(ids, preferredIds = []) {
  const available = new Set(ids);
  for (const id of preferredIds) {
    if (!available.has(id)) throw new Error(`configuration catalog references missing item: ${id}`);
  }
  return [
    ...preferredIds,
    ...ids.filter((id) => !preferredIds.includes(id)).sort()
  ];
}

async function discoverOrderedConfigIds(configRoot, category, catalog) {
  const ids = await discoverConfigIds(configRoot, category);
  const preferred = (catalog ?? await readCatalog(configRoot))[category] ?? [];
  return orderConfigIds(ids, preferred);
}

export async function loadProvider(id, options = {}) {
  const provider = await readJson(options.configRoot ?? DEFAULT_CONFIG_ROOT, "providers", id);
  return validateProvider(provider, options);
}

export async function loadProfile(id, options = {}) {
  const configRoot = options.configRoot ?? DEFAULT_CONFIG_ROOT;
  const catalog = options.catalog ?? await readCatalog(configRoot);
  const [providerIds, pricingIds, entitlementIds] = await Promise.all([
    options.providerIds ?? discoverOrderedConfigIds(configRoot, "providers", catalog),
    options.pricingIds ?? discoverOrderedConfigIds(configRoot, "pricing", catalog),
    options.entitlementIds ?? discoverOrderedConfigIds(configRoot, "entitlements", catalog)
  ]);
  const profile = await readJson(configRoot, "profiles", id);
  return validateProfile(profile, new Set(providerIds), {
    pricingIds: new Set(pricingIds),
    entitlementIds: new Set(entitlementIds)
  });
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

export async function loadEntitlement(id, options = {}) {
  const entitlement = await readJson(options.configRoot ?? DEFAULT_CONFIG_ROOT, "entitlements", id);
  return validateEntitlement(entitlement, options);
}

export async function loadConfigSet(options = {}) {
  const configRoot = options.configRoot ?? DEFAULT_CONFIG_ROOT;
  const catalog = await readCatalog(configRoot);
  const [providerIds, profileIds, pricingIds, entitlementIds] = await Promise.all([
    options.providerIds ?? discoverOrderedConfigIds(configRoot, "providers", catalog),
    options.profileIds ?? discoverOrderedConfigIds(configRoot, "profiles", catalog),
    options.pricingIds ?? discoverOrderedConfigIds(configRoot, "pricing", catalog),
    options.entitlementIds ?? discoverOrderedConfigIds(configRoot, "entitlements", catalog)
  ]);
  const [providers, profiles, pricing, entitlements] = await Promise.all([
    Promise.all(providerIds.map((id) => loadProvider(id, { ...options, configRoot }))),
    Promise.all(profileIds.map((id) => loadProfile(id, {
      ...options,
      configRoot,
      providerIds,
      pricingIds,
      entitlementIds
    }))),
    Promise.all(pricingIds.map((id) => loadPricing(id, { ...options, configRoot }))),
    Promise.all(entitlementIds.map((id) => loadEntitlement(id, { ...options, configRoot })))
  ]);
  const validated = validateConfigSet({ providers, profiles, pricing, entitlements, now: options.now });
  // Staleness is advisory (validator warnings), never a launch blocker (docs/21 SC-5).
  return { providers, profiles, pricing, entitlements, warnings: validated.warnings };
}

export function getDefaultConfigRoot() {
  return DEFAULT_CONFIG_ROOT;
}

export function getConfigPath(category, id, configRoot = DEFAULT_CONFIG_ROOT) {
  return resolveConfigFile(configRoot, category, id);
}
