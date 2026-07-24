export const PROFILE_ENV_KEYS = Object.freeze([
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "ENABLE_TOOL_SEARCH",
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
  "CLAUDE_CODE_EFFORT_LEVEL"
]);

export const PROVIDER_KEYS = Object.freeze([
  "id",
  "displayName",
  "baseUrl",
  "apiKeyUrl",
  "authVariable",
  "secretId",
  "verifiedOn",
  "sourceUrl"
]);

export const PROFILE_KEYS = Object.freeze([
  "id",
  "aliases",
  "displayName",
  "provider",
  "purpose",
  "costNotice",
  "pricingRef",
  "requiredEnvironment",
  "environment"
]);

export const PRICING_KEYS = Object.freeze([
  "id",
  "displayName",
  "model",
  "currency",
  "unit",
  "prices",
  "contextWindowTokens",
  "verifiedOn",
  "sourceUrl"
]);

export const CMR_RESERVED_COMMANDS = Object.freeze([
  "help",
  "--help",
  "version",
  "list",
  "doctor",
  "config",
  "secret",
  "setup",
  "update"
]);

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

function fail(message) {
  throw new ValidationError(message);
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function assertExactKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${label} contains unknown field: ${key}`);
  }
}

function assertRequiredKeys(value, required, label) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing required field: ${key}`);
  }
}

function assertDate(value, label, now = new Date()) {
  assertString(value, label);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) fail(`${label} must use YYYY-MM-DD`);
  const [, year, month, day] = match;
  const parsedDay = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(parsedDay);
  if (Number.isNaN(parsedDay)
    || parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)) {
    fail(`${label} is not a valid date`);
  }
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) fail("validation clock is invalid");
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (parsedDay > currentDay) fail(`${label} cannot be in the future`);
  const ageDays = (currentDay - parsedDay) / 86_400_000;
  if (ageDays > 180) fail(`${label} is expired; re-verify the official source`);
}

function assertUrl(value, label) {
  assertString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must use HTTPS`);
}

function assertApiKeyUrl(value, label) {
  assertString(value, label);
  if (value !== value.trim() || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`${label} must not contain surrounding whitespace or control characters`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must use HTTPS`);
  if (parsed.username || parsed.password) fail(`${label} must not contain credentials`);
  if (parsed.hash) fail(`${label} must not contain a fragment`);
}

function assertPriceTree(value, label) {
  assertObject(value, label);
  if (Object.keys(value).length === 0) fail(`${label} cannot be empty`);
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "number") {
      if (!Number.isFinite(child) || child < 0) fail(`${label}.${key} must be a non-negative number`);
    } else {
      assertPriceTree(child, `${label}.${key}`);
    }
  }
}

function assertExactPriceKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    fail(`${label} must contain exactly: ${required.join(", ")}`);
  }
}

export function validateProvider(provider, { now = new Date() } = {}) {
  assertObject(provider, "provider");
  assertExactKeys(provider, PROVIDER_KEYS, "provider");
  assertRequiredKeys(provider, PROVIDER_KEYS, "provider");
  assertString(provider.id, "provider.id");
  assertString(provider.displayName, "provider.displayName");
  assertUrl(provider.baseUrl, "provider.baseUrl");
  assertApiKeyUrl(provider.apiKeyUrl, "provider.apiKeyUrl");
  assertString(provider.authVariable, "provider.authVariable");
  if (!["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"].includes(provider.authVariable)) {
    fail(`provider.authVariable is not allowed: ${provider.authVariable}`);
  }
  assertString(provider.secretId, "provider.secretId");
  if (provider.secretId !== provider.id) fail("provider.secretId must equal provider.id");
  assertDate(provider.verifiedOn, "provider.verifiedOn", now);
  assertUrl(provider.sourceUrl, "provider.sourceUrl");
  return provider;
}

export function validateProfile(profile, providerIds) {
  assertObject(profile, "profile");
  assertExactKeys(profile, PROFILE_KEYS, "profile");
  assertRequiredKeys(profile, PROFILE_KEYS, "profile");
  assertString(profile.id, "profile.id");
  if (!Array.isArray(profile.aliases) || profile.aliases.length === 0) fail("profile.aliases must be a non-empty array");
  const aliases = new Set();
  for (const alias of profile.aliases) {
    assertString(alias, "profile.aliases entry");
    if (aliases.has(alias)) fail(`profile.aliases contains duplicate: ${alias}`);
    aliases.add(alias);
  }
  assertString(profile.displayName, "profile.displayName");
  assertString(profile.provider, "profile.provider");
  if (!providerIds.has(profile.provider)) fail(`profile.provider is unknown: ${profile.provider}`);
  assertString(profile.purpose, "profile.purpose");
  if (!["high", "standard"].includes(profile.costNotice)) fail("profile.costNotice must be high or standard");
  assertString(profile.pricingRef, "profile.pricingRef");
  if (!Array.isArray(profile.requiredEnvironment) || profile.requiredEnvironment.length === 0) {
    fail("profile.requiredEnvironment must be a non-empty array");
  }
  const requiredVariables = new Set();
  for (const key of profile.requiredEnvironment) {
    if (!PROFILE_ENV_KEYS.includes(key)) fail(`profile.requiredEnvironment contains unknown variable: ${key}`);
    if (requiredVariables.has(key)) fail(`profile.requiredEnvironment contains duplicate: ${key}`);
    requiredVariables.add(key);
  }
  assertObject(profile.environment, "profile.environment");
  for (const key of Object.keys(profile.environment)) {
    if (!PROFILE_ENV_KEYS.includes(key)) fail(`profile.environment contains unknown variable: ${key}`);
    assertString(profile.environment[key], `profile.environment.${key}`);
  }
  for (const key of profile.requiredEnvironment) {
    if (!Object.hasOwn(profile.environment, key)) fail(`profile.environment is missing required variable: ${key}`);
  }
  return profile;
}

export function validatePricing(pricing, { now = new Date() } = {}) {
  assertObject(pricing, "pricing");
  assertExactKeys(pricing, PRICING_KEYS, "pricing");
  assertRequiredKeys(pricing, PRICING_KEYS, "pricing");
  assertString(pricing.id, "pricing.id");
  assertString(pricing.displayName, "pricing.displayName");
  assertString(pricing.model, "pricing.model");
  assertString(pricing.currency, "pricing.currency");
  assertString(pricing.unit, "pricing.unit");
  assertPriceTree(pricing.prices, "pricing.prices");
  if (!Number.isInteger(pricing.contextWindowTokens) || pricing.contextWindowTokens <= 0) {
    fail("pricing.contextWindowTokens must be a positive integer");
  }
  if (pricing.id === "kimi-k3") {
    if (pricing.model !== "kimi-k3" || pricing.currency !== "CNY" || pricing.unit !== "per_million_tokens") {
      fail("kimi-k3 pricing metadata is invalid");
    }
    assertExactPriceKeys(pricing.prices, ["inputCacheHit", "inputCacheMiss", "output"], "pricing.prices");
  }
  if (pricing.id === "deepseek-v4") {
    if (pricing.model !== "deepseek-v4" || pricing.currency !== "USD" || pricing.unit !== "per_million_tokens") {
      fail("deepseek-v4 pricing metadata is invalid");
    }
    assertExactPriceKeys(pricing.prices, ["deepseek-v4-pro", "deepseek-v4-flash"], "pricing.prices");
    for (const model of ["deepseek-v4-pro", "deepseek-v4-flash"]) {
      assertExactPriceKeys(pricing.prices[model], ["inputCacheHit", "inputCacheMiss", "output"], `pricing.prices.${model}`);
    }
  }
  assertDate(pricing.verifiedOn, "pricing.verifiedOn", now);
  assertUrl(pricing.sourceUrl, "pricing.sourceUrl");
  return pricing;
}

export function validateConfigSet({ providers, profiles, pricing, now = new Date() }) {
  if (!Array.isArray(providers) || !Array.isArray(profiles) || !Array.isArray(pricing)) {
    fail("configuration collections must be arrays");
  }
  const providerIds = new Set();
  for (const provider of providers) {
    validateProvider(provider, { now });
    if (providerIds.has(provider.id)) fail(`duplicate provider id: ${provider.id}`);
    providerIds.add(provider.id);
  }
  const profileIds = new Set();
  const aliases = new Set();
  for (const profile of profiles) {
    validateProfile(profile, providerIds);
    if (profileIds.has(profile.id)) fail(`duplicate profile id: ${profile.id}`);
    if (CMR_RESERVED_COMMANDS.includes(profile.id)) fail(`profile id collides with reserved command: ${profile.id}`);
    profileIds.add(profile.id);
    for (const alias of profile.aliases) {
      if (aliases.has(alias)) fail(`duplicate profile alias: ${alias}`);
      if (CMR_RESERVED_COMMANDS.includes(alias)) fail(`profile alias collides with reserved command: ${alias}`);
      aliases.add(alias);
    }
  }
  const pricingIds = new Set();
  for (const item of pricing) {
    validatePricing(item, { now });
    if (pricingIds.has(item.id)) fail(`duplicate pricing id: ${item.id}`);
    pricingIds.add(item.id);
  }
  if (profileIds.size !== 2 || !profileIds.has("kimi") || !profileIds.has("deepseek")) {
    fail("V2 must contain exactly the kimi and deepseek profiles");
  }
  if (providerIds.size !== 2 || !providerIds.has("kimi") || !providerIds.has("deepseek")) {
    fail("V2 must contain exactly the kimi and deepseek providers");
  }
  if (pricingIds.size !== 2 || !pricingIds.has("kimi-k3") || !pricingIds.has("deepseek-v4")) {
    fail("V2 must contain exactly the kimi-k3 and deepseek-v4 pricing records");
  }
  for (const alias of aliases) {
    if (profileIds.has(alias)) fail(`profile alias collides with profile id: ${alias}`);
  }
  const kimi = profiles.find((profile) => profile.id === "kimi");
  const deepseek = profiles.find((profile) => profile.id === "deepseek");
  if (!kimi.aliases.includes("plan") || !kimi.aliases.includes("kimi-k3")) {
    fail("kimi profile must include plan and kimi-k3 aliases");
  }
  if (!deepseek.aliases.includes("build") || !deepseek.aliases.includes("deepseek-auto")) {
    fail("deepseek profile must include build and deepseek-auto aliases");
  }
  if (kimi.provider !== "kimi" || kimi.pricingRef !== "kimi-k3") {
    fail("kimi profile must reference the kimi provider and kimi-k3 pricing");
  }
  if (deepseek.provider !== "deepseek" || deepseek.pricingRef !== "deepseek-v4") {
    fail("deepseek profile must reference the deepseek provider and deepseek-v4 pricing");
  }
  for (const profile of profiles) {
    if (!pricingIds.has(profile.pricingRef)) fail(`profile.pricingRef is unknown: ${profile.pricingRef}`);
  }
  return { providers, profiles, pricing };
}
