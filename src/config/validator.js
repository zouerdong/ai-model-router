export const PROFILE_ENV_KEYS = Object.freeze([
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "ENABLE_TOOL_SEARCH",
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "API_TIMEOUT_MS"
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
  "entitlementRef",
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

export const ENTITLEMENT_KEYS = Object.freeze([
  "id",
  "displayName",
  "billingType",
  "quotaNotice",
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

function assertExactValue(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid`);
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

export function validateProfile(profile, providerIds, { pricingIds, entitlementIds } = {}) {
  assertObject(profile, "profile");
  assertExactKeys(profile, PROFILE_KEYS, "profile");
  assertRequiredKeys(profile, PROFILE_KEYS.filter((key) => key !== "pricingRef" && key !== "entitlementRef"), "profile");
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
  if (!["high", "standard", "payg", "subscription"].includes(profile.costNotice)) {
    fail("profile.costNotice must be high, standard, payg or subscription");
  }
  const hasPricingRef = Object.hasOwn(profile, "pricingRef");
  const hasEntitlementRef = Object.hasOwn(profile, "entitlementRef");
  if (hasPricingRef === hasEntitlementRef) {
    fail("profile must contain exactly one of pricingRef or entitlementRef");
  }
  if (hasPricingRef) {
    assertString(profile.pricingRef, "profile.pricingRef");
    if (pricingIds && !pricingIds.has(profile.pricingRef)) fail(`profile.pricingRef is unknown: ${profile.pricingRef}`);
  }
  if (hasEntitlementRef) {
    assertString(profile.entitlementRef, "profile.entitlementRef");
    if (entitlementIds && !entitlementIds.has(profile.entitlementRef)) {
      fail(`profile.entitlementRef is unknown: ${profile.entitlementRef}`);
    }
  }
  if (profile.costNotice === "subscription" && !hasEntitlementRef) {
    fail("subscription profile must use entitlementRef");
  }
  if (hasEntitlementRef && profile.costNotice !== "subscription") {
    fail("profile with entitlementRef must use subscription cost notice");
  }
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
  if (pricing.id === "glm-5.2") {
    if (pricing.model !== "glm-5.2" || pricing.currency !== "CNY" || pricing.unit !== "per_million_tokens"
      || pricing.contextWindowTokens !== 1_000_000) {
      fail("glm-5.2 pricing metadata is invalid");
    }
    assertExactPriceKeys(pricing.prices, ["inputCacheHit", "inputCacheMiss", "output"], "pricing.prices");
    if (pricing.prices.inputCacheHit !== 2 || pricing.prices.inputCacheMiss !== 8 || pricing.prices.output !== 28) {
      fail("glm-5.2 pricing values are invalid");
    }
  }
  assertDate(pricing.verifiedOn, "pricing.verifiedOn", now);
  assertUrl(pricing.sourceUrl, "pricing.sourceUrl");
  return pricing;
}

export function validateEntitlement(entitlement, { now = new Date() } = {}) {
  assertObject(entitlement, "entitlement");
  assertExactKeys(entitlement, ENTITLEMENT_KEYS, "entitlement");
  assertRequiredKeys(entitlement, ENTITLEMENT_KEYS, "entitlement");
  assertString(entitlement.id, "entitlement.id");
  assertString(entitlement.displayName, "entitlement.displayName");
  if (entitlement.billingType !== "subscription-quota") {
    fail("entitlement.billingType must be subscription-quota");
  }
  if (typeof entitlement.quotaNotice !== "string" || entitlement.quotaNotice.trim().length === 0) {
    fail("entitlement.quotaNotice must be a non-empty string");
  }
  assertDate(entitlement.verifiedOn, "entitlement.verifiedOn", now);
  assertUrl(entitlement.sourceUrl, "entitlement.sourceUrl");
  return entitlement;
}

export function validateConfigSet({ providers, profiles, pricing, entitlements = [], now = new Date() }) {
  if (!Array.isArray(providers) || !Array.isArray(profiles) || !Array.isArray(pricing) || !Array.isArray(entitlements)) {
    fail("configuration collections must be arrays");
  }
  const providerIds = new Set();
  for (const provider of providers) {
    validateProvider(provider, { now });
    if (providerIds.has(provider.id)) fail(`duplicate provider id: ${provider.id}`);
    providerIds.add(provider.id);
  }
  const pricingIds = new Set();
  for (const item of pricing) {
    validatePricing(item, { now });
    if (pricingIds.has(item.id)) fail(`duplicate pricing id: ${item.id}`);
    pricingIds.add(item.id);
  }
  const entitlementIds = new Set();
  for (const item of entitlements) {
    validateEntitlement(item, { now });
    if (entitlementIds.has(item.id)) fail(`duplicate entitlement id: ${item.id}`);
    entitlementIds.add(item.id);
  }
  const profileIds = new Set();
  const aliases = new Set();
  for (const profile of profiles) {
    validateProfile(profile, providerIds, { pricingIds, entitlementIds });
    if (profileIds.has(profile.id)) fail(`duplicate profile id: ${profile.id}`);
    if (CMR_RESERVED_COMMANDS.includes(profile.id)) fail(`profile id collides with reserved command: ${profile.id}`);
    profileIds.add(profile.id);
    for (const alias of profile.aliases) {
      if (aliases.has(alias)) fail(`duplicate profile alias: ${alias}`);
      if (CMR_RESERVED_COMMANDS.includes(alias)) fail(`profile alias collides with reserved command: ${alias}`);
      aliases.add(alias);
    }
  }
  const requiredProfiles = ["kimi", "deepseek", "deepseek-vision", "glm", "glm-api", "kimi-code", "kimi-code-k3-256k", "kimi-code-k3"];
  const requiredProviders = ["kimi", "deepseek", "glm", "glm-api", "kimi-code"];
  const requiredPricing = ["kimi-k3", "deepseek-v4", "glm-5.2"];
  const requiredEntitlements = ["kimi-code-membership", "glm-coding-plan-membership"];
  if (!requiredProfiles.every((id) => profileIds.has(id))) {
    fail("configuration is missing one or more formal profiles");
  }
  if (!requiredProviders.every((id) => providerIds.has(id))) {
    fail("configuration is missing one or more formal providers");
  }
  if (!requiredPricing.every((id) => pricingIds.has(id))) {
    fail("configuration is missing one or more formal pricing records");
  }
  if (!requiredEntitlements.every((id) => entitlementIds.has(id))) {
    fail("configuration is missing one or more formal entitlement records");
  }
  for (const alias of aliases) {
    if (profileIds.has(alias)) fail(`profile alias collides with profile id: ${alias}`);
  }
  const kimi = profiles.find((profile) => profile.id === "kimi");
  const deepseek = profiles.find((profile) => profile.id === "deepseek");
  const deepseekVision = profiles.find((profile) => profile.id === "deepseek-vision");
  const glm = profiles.find((profile) => profile.id === "glm");
  const glmApi = profiles.find((profile) => profile.id === "glm-api");
  const kimiCode = profiles.find((profile) => profile.id === "kimi-code");
  const kimiCodeK3_256k = profiles.find((profile) => profile.id === "kimi-code-k3-256k");
  const kimiCodeK3 = profiles.find((profile) => profile.id === "kimi-code-k3");
  const kimiProvider = providers.find((provider) => provider.id === "kimi");
  const glmProvider = providers.find((provider) => provider.id === "glm");
  const glmApiProvider = providers.find((provider) => provider.id === "glm-api");
  const kimiCodeProvider = providers.find((provider) => provider.id === "kimi-code");
  const kimiCodeEntitlement = entitlements.find((item) => item.id === "kimi-code-membership");
  const glmEntitlement = entitlements.find((item) => item.id === "glm-coding-plan-membership");
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
  if (deepseekVision.aliases.length !== 1 || deepseekVision.aliases[0] !== "deepseek-flash-vision") {
    fail("deepseek-vision profile must contain exactly the deepseek-flash-vision alias");
  }
  if (deepseekVision.provider !== "deepseek"
    || deepseekVision.pricingRef !== "deepseek-v4"
    || deepseekVision.costNotice !== "standard") {
    fail("deepseek-vision profile must reference the deepseek provider, deepseek-v4 pricing and standard cost notice");
  }
  const expectedDeepseekEnvironment = {
    ANTHROPIC_MODEL: "deepseek-v4-pro[1m]",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro[1m]",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash-vision-exp",
    CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash-vision-exp",
    CLAUDE_CODE_EFFORT_LEVEL: "max"
  };
  const expectedDeepseekVisionEnvironment = {
    ANTHROPIC_MODEL: "deepseek-v4-flash-vision-exp",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-flash-vision-exp",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-flash-vision-exp",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash-vision-exp",
    CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash-vision-exp",
    CLAUDE_CODE_EFFORT_LEVEL: "max"
  };
  if (JSON.stringify(deepseek.environment) !== JSON.stringify(expectedDeepseekEnvironment)
    || JSON.stringify(deepseek.requiredEnvironment) !== JSON.stringify(Object.keys(expectedDeepseekEnvironment))) {
    fail("deepseek profile environment mapping is invalid");
  }
  if (JSON.stringify(deepseekVision.environment) !== JSON.stringify(expectedDeepseekVisionEnvironment)
    || JSON.stringify(deepseekVision.requiredEnvironment) !== JSON.stringify(Object.keys(expectedDeepseekVisionEnvironment))) {
    fail("deepseek-vision profile environment mapping is invalid");
  }
  if (kimiProvider.displayName !== "Kimi"
    || kimiProvider.baseUrl !== "https://api.moonshot.cn/anthropic"
    || kimiProvider.apiKeyUrl !== "https://platform.kimi.com/console/api-keys"
    || kimiProvider.authVariable !== "ANTHROPIC_AUTH_TOKEN"
    || kimiProvider.secretId !== "kimi"
    || kimiProvider.sourceUrl !== "https://platform.kimi.com/docs/guide/claude-code-kimi") {
    fail("kimi open-platform provider contract is invalid");
  }
  if (glm.aliases.length !== 3
    || !glm.aliases.includes("glm-5.3")
    || !glm.aliases.includes("glm-5.2")
    || !glm.aliases.includes("glm-plan")) {
    fail("glm profile must include exactly glm-5.3, glm-5.2 and glm-plan aliases");
  }
  if (glm.provider !== "glm"
    || glm.costNotice !== "subscription"
    || glm.entitlementRef !== "glm-coding-plan-membership") {
    fail("glm profile must reference the glm provider and Coding Plan subscription entitlement");
  }
  if (glmProvider.authVariable !== "ANTHROPIC_AUTH_TOKEN" || glmProvider.secretId !== "glm") {
    fail("glm provider authentication boundary is invalid");
  }
  if (glmApi.aliases.length !== 1 || glmApi.aliases[0] !== "glm-payg") {
    fail("glm-api profile must contain exactly the glm-payg alias");
  }
  if (glmApi.provider !== "glm-api" || glmApi.pricingRef !== "glm-5.2" || glmApi.costNotice !== "payg") {
    fail("glm-api profile must reference the glm-api provider, glm-5.2 pricing and payg cost notice");
  }
  if (glmApiProvider.baseUrl !== "https://open.bigmodel.cn/api/anthropic"
    || glmApiProvider.apiKeyUrl !== "https://bigmodel.cn/usercenter/proj-mgmt/apikeys"
    || glmApiProvider.authVariable !== "ANTHROPIC_API_KEY"
    || glmApiProvider.secretId !== "glm-api"
    || glmApiProvider.sourceUrl !== "https://docs.bigmodel.cn/cn/guide/develop/claude/introduction") {
    fail("glm-api provider contract is invalid");
  }
  if (glmProvider.secretId === glmApiProvider.secretId) {
    fail("glm and glm-api providers must use distinct secret IDs");
  }
  if (glmEntitlement.displayName !== "GLM Coding Plan"
    || glmEntitlement.billingType !== "subscription-quota"
    || glmEntitlement.quotaNotice !== "Consumes GLM Coding Plan subscription quota; quota availability and any additional usage charges follow the active subscription and official policy."
    || glmEntitlement.sourceUrl !== "https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3") {
    fail("glm Coding Plan entitlement contract is invalid");
  }
  if (kimiCodeProvider.displayName !== "Kimi Code Membership"
    || kimiCodeProvider.baseUrl !== "https://api.kimi.com/coding/"
    || kimiCodeProvider.apiKeyUrl !== "https://www.kimi.com/code/console"
    || kimiCodeProvider.authVariable !== "ANTHROPIC_API_KEY"
    || kimiCodeProvider.secretId !== "kimi-code"
    || kimiCodeProvider.sourceUrl !== "https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html") {
    fail("kimi-code provider contract is invalid");
  }
  if (kimiProvider.secretId === kimiCodeProvider.secretId) {
    fail("kimi and kimi-code providers must use distinct secret IDs");
  }
  if (kimiCodeEntitlement.displayName !== "Kimi Code Membership"
    || kimiCodeEntitlement.billingType !== "subscription-quota"
    || kimiCodeEntitlement.quotaNotice !== "Consumes Kimi Code membership quota; Extra Usage may incur additional charges when enabled."
    || kimiCodeEntitlement.sourceUrl !== "https://www.kimi.com/code/docs/en/kimi-code/membership.html") {
    fail("kimi-code membership entitlement contract is invalid");
  }
  const expectedGlmEnvironment = {
    ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.3[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.3[1m]",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.7",
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    API_TIMEOUT_MS: "3000000"
  };
  const expectedGlmApiEnvironment = {
    ...expectedGlmEnvironment,
    ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.2[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.2[1m]"
  };
  if (JSON.stringify(glm.environment) !== JSON.stringify(expectedGlmEnvironment)
    || JSON.stringify(glm.requiredEnvironment) !== JSON.stringify(Object.keys(expectedGlmEnvironment))) {
    fail("glm profile environment mapping is invalid");
  }
  if (JSON.stringify(glmApi.environment) !== JSON.stringify(expectedGlmApiEnvironment)
    || JSON.stringify(glmApi.requiredEnvironment) !== JSON.stringify(Object.keys(expectedGlmApiEnvironment))) {
    fail("glm-api profile environment mapping is invalid");
  }
  const expectedKimiCodeProfiles = [
    {
      profile: kimiCode,
      aliases: ["kimi-membership"],
      environment: {
        ANTHROPIC_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_FABLE_MODEL: "kimi-for-coding",
        CLAUDE_CODE_SUBAGENT_MODEL: "kimi-for-coding",
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: "262144",
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: "262144"
      }
    },
    {
      profile: kimiCodeK3_256k,
      aliases: ["kimi-membership-k3-256k"],
      environment: {
        ANTHROPIC_MODEL: "k3-256k",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "k3-256k",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "k3-256k",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "k3-256k",
        ANTHROPIC_DEFAULT_FABLE_MODEL: "k3-256k",
        CLAUDE_CODE_SUBAGENT_MODEL: "k3-256k",
        CLAUDE_CODE_EFFORT_LEVEL: "high",
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: "262144",
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: "262144"
      }
    },
    {
      profile: kimiCodeK3,
      aliases: ["kimi-membership-k3"],
      environment: {
        ANTHROPIC_MODEL: "k3[1m]",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "k3[1m]",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "k3[1m]",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "k3[1m]",
        ANTHROPIC_DEFAULT_FABLE_MODEL: "k3[1m]",
        CLAUDE_CODE_SUBAGENT_MODEL: "k3[1m]",
        CLAUDE_CODE_EFFORT_LEVEL: "high",
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1048576",
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: "1048576"
      }
    }
  ];
  for (const { profile, aliases, environment } of expectedKimiCodeProfiles) {
    if (profile.provider !== "kimi-code"
      || profile.costNotice !== "subscription"
      || profile.entitlementRef !== "kimi-code-membership") {
      fail(`${profile.id} profile contract is invalid`);
    }
    assertExactValue(profile.aliases, aliases, `${profile.id} aliases`);
    assertExactValue(profile.environment, environment, `${profile.id} environment`);
    assertExactValue(profile.requiredEnvironment, Object.keys(environment), `${profile.id} required environment`);
  }
  return { providers, profiles, pricing, entitlements };
}
