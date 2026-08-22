import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getConfigPath, getDefaultConfigRoot, loadConfigSet, loadEntitlement, resolveProfile } from "../src/config/loader.js";
import {
  validateConfigSet,
  validateEntitlement,
  validatePricing,
  validateProfile,
  validateProvider
} from "../src/config/validator.js";

test("loads exactly the five providers, eight profiles, three pricing records and two entitlements", async () => {
  const config = await loadConfigSet();
  assert.deepEqual(config.profiles.map((profile) => profile.id), [
    "kimi",
    "deepseek",
    "deepseek-vision",
    "glm",
    "glm-api",
    "kimi-code",
    "kimi-code-k3-256k",
    "kimi-code-k3"
  ]);
  assert.deepEqual(config.providers.map((provider) => provider.id), ["kimi", "deepseek", "glm", "glm-api", "kimi-code"]);
  assert.deepEqual(config.pricing.map((pricing) => pricing.id), ["kimi-k3", "deepseek-v4", "glm-5.2"]);
  assert.deepEqual(config.entitlements.map((entitlement) => entitlement.id), ["kimi-code-membership", "glm-coding-plan-membership"]);
});

test("derives the Provider collection from configuration files and appends a new Provider without code changes", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-dynamic-provider-config-"));
  await cp(getDefaultConfigRoot(), root, { recursive: true });
  await writeFile(path.join(root, "providers", "third-provider.json"), JSON.stringify({
    id: "third-provider",
    displayName: "Third Provider",
    baseUrl: "https://third.example.com/anthropic",
    apiKeyUrl: "https://third.example.com/api-keys",
    authVariable: "ANTHROPIC_AUTH_TOKEN",
    secretId: "third-provider",
    verifiedOn: "2026-08-12",
    sourceUrl: "https://third.example.com/docs"
  }));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = await loadConfigSet({ configRoot: root, now: new Date("2026-08-21T00:00:00Z") });
  assert.equal(config.providers.at(-1).id, "third-provider");
  assert.equal(config.providers.length, 6);
});

test("loads and validates a generic entitlement without adding a formal Provider or Profile", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-entitlement-config-"));
  const entitlement = {
    id: "test-membership",
    displayName: "Test Membership",
    billingType: "subscription-quota",
    quotaNotice: "Consumes subscription quota; extra usage may incur charges.",
    verifiedOn: "2026-08-12",
    sourceUrl: "https://example.com/membership"
  };
  await mkdir(path.join(root, "entitlements"), { recursive: true });
  await writeFile(path.join(root, "entitlements", "test-membership.json"), JSON.stringify(entitlement));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(
    await loadEntitlement("test-membership", { configRoot: root, now: new Date("2026-08-12T00:00:00Z") }),
    entitlement
  );
});

test("resolves profile IDs and aliases without fuzzy matching", async () => {
  const { profiles } = await loadConfigSet();
  assert.equal(resolveProfile(profiles, "kimi").id, "kimi");
  assert.equal(resolveProfile(profiles, "plan").id, "kimi");
  assert.equal(resolveProfile(profiles, "kimi-k3").id, "kimi");
  assert.equal(resolveProfile(profiles, "deepseek").id, "deepseek");
  assert.equal(resolveProfile(profiles, "build").id, "deepseek");
  assert.equal(resolveProfile(profiles, "deepseek-vision").id, "deepseek-vision");
  assert.equal(resolveProfile(profiles, "deepseek-flash-vision").id, "deepseek-vision");
  assert.equal(resolveProfile(profiles, "glm").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-5.3").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-5.2").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-plan").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-api").id, "glm-api");
  assert.equal(resolveProfile(profiles, "glm-payg").id, "glm-api");
  assert.equal(resolveProfile(profiles, "kimi-code").id, "kimi-code");
  assert.equal(resolveProfile(profiles, "kimi-membership").id, "kimi-code");
  assert.equal(resolveProfile(profiles, "kimi-membership-k3-256k").id, "kimi-code-k3-256k");
  assert.equal(resolveProfile(profiles, "kimi-membership-k3").id, "kimi-code-k3");
  assert.equal(resolveProfile(profiles, "KIMI"), null);
  assert.equal(resolveProfile(profiles, "GLM-API"), null);
  assert.equal(resolveProfile(profiles, "glm_api"), null);
  assert.equal(resolveProfile(profiles, "zhipu-api"), null);
  assert.equal(resolveProfile(profiles, "unknown"), null);
});

test("Kimi profile contains the complete K3 mapping", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "kimi");
  assert.equal(profile.environment.ANTHROPIC_MODEL, "kimi-k3[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_OPUS_MODEL, "kimi-k3[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_SONNET_MODEL, "kimi-k3[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_HAIKU_MODEL, "kimi-k3[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_FABLE_MODEL, "kimi-k3[1m]");
  assert.equal(profile.environment.CLAUDE_CODE_SUBAGENT_MODEL, "kimi-k3[1m]");
  assert.equal(profile.environment.ENABLE_TOOL_SEARCH, "false");
  assert.equal(profile.environment.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "1048576");
  assert.equal(profile.environment.CLAUDE_CODE_EFFORT_LEVEL, "max");
});

test("keeps the Claude 1M selector separate from the Kimi upstream model ID", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "kimi");
  const pricing = config.pricing.find((item) => item.id === profile.pricingRef);
  assert.equal(profile.environment.ANTHROPIC_MODEL, "kimi-k3[1m]");
  assert.equal(pricing.model, "kimi-k3");
  assert.equal(profile.environment.ANTHROPIC_MODEL, `${pricing.model}[1m]`);
});

test("Kimi Code profiles contain exact complete model and context mappings", async () => {
  const config = await loadConfigSet();
  const expected = {
    "kimi-code": {
      model: "kimi-for-coding",
      context: "262144",
      effort: undefined
    },
    "kimi-code-k3-256k": {
      model: "k3-256k",
      context: "262144",
      effort: "high"
    },
    "kimi-code-k3": {
      model: "k3[1m]",
      context: "1048576",
      effort: "high"
    }
  };
  for (const [id, values] of Object.entries(expected)) {
    const profile = config.profiles.find((item) => item.id === id);
    assert.equal(profile.provider, "kimi-code");
    assert.equal(profile.entitlementRef, "kimi-code-membership");
    assert.equal(profile.costNotice, "subscription");
    for (const key of [
      "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "ANTHROPIC_DEFAULT_FABLE_MODEL",
      "CLAUDE_CODE_SUBAGENT_MODEL"
    ]) assert.equal(profile.environment[key], values.model, `${id}.${key}`);
    assert.equal(profile.environment.CLAUDE_CODE_AUTO_COMPACT_WINDOW, values.context);
    assert.equal(profile.environment.CLAUDE_CODE_MAX_CONTEXT_TOKENS, values.context);
    assert.equal(profile.environment.CLAUDE_CODE_EFFORT_LEVEL, values.effort ?? undefined);
    assert.equal(Object.hasOwn(profile.environment, "ENABLE_TOOL_SEARCH"), false, id);
  }
  assert.equal(config.profiles.find((item) => item.id === "kimi-code-k3").environment.ANTHROPIC_MODEL, "k3[1m]");
});

test("DeepSeek profile stays on the official Auto Pro mapping with vision Flash slots", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "deepseek");
  assert.equal(profile.environment.ANTHROPIC_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_OPUS_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_SONNET_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_HAIKU_MODEL, "deepseek-v4-flash-vision-exp");
  assert.equal(profile.environment.CLAUDE_CODE_SUBAGENT_MODEL, "deepseek-v4-flash-vision-exp");
  assert.equal(Object.hasOwn(profile.environment, "ANTHROPIC_DEFAULT_FABLE_MODEL"), false);
  assert.equal(Object.hasOwn(profile.environment, "CLAUDE_CODE_AUTO_COMPACT_WINDOW"), false);
});

test("DeepSeek Vision profile maps every slot to the multimodal vision model", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "deepseek-vision");
  assert.deepEqual(profile.aliases, ["deepseek-flash-vision"]);
  assert.equal(profile.provider, "deepseek");
  assert.equal(profile.pricingRef, "deepseek-v4");
  assert.equal(profile.costNotice, "standard");
  assert.deepEqual(profile.environment, {
    ANTHROPIC_MODEL: "deepseek-v4-flash-vision-exp",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-flash-vision-exp",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-flash-vision-exp",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash-vision-exp",
    CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash-vision-exp",
    CLAUDE_CODE_EFFORT_LEVEL: "max"
  });
  assert.deepEqual(profile.requiredEnvironment, Object.keys(profile.environment));
});

test("GLM profile contains the exact Coding Plan mapping and no unverified variables", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "glm");
  assert.deepEqual(profile.environment, {
    ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.3[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.3[1m]",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.7",
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    API_TIMEOUT_MS: "3000000"
  });
  for (const key of [
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL",
    "ENABLE_TOOL_SEARCH"
  ]) {
    assert.equal(Object.hasOwn(profile.environment, key), false, key);
  }
});

test("GLM standard API profile has an isolated credential boundary and exact mapping", async () => {
  const config = await loadConfigSet();
  const glm = config.profiles.find((item) => item.id === "glm");
  const glmApi = config.profiles.find((item) => item.id === "glm-api");
  const kimiProvider = config.providers.find((item) => item.id === "kimi");
  const glmProvider = config.providers.find((item) => item.id === "glm");
  const kimiCodeProvider = config.providers.find((item) => item.id === "kimi-code");
  const kimiCodeEntitlement = config.entitlements.find((item) => item.id === "kimi-code-membership");
  const glmApiProvider = config.providers.find((item) => item.id === "glm-api");
  const glmEntitlement = config.entitlements.find((item) => item.id === "glm-coding-plan-membership");
  assert.deepEqual(glm.aliases, ["glm-5.3", "glm-5.2", "glm-plan"]);
  assert.deepEqual(glmApi.aliases, ["glm-payg"]);
  assert.equal(glmApi.provider, "glm-api");
  assert.equal(glmApi.pricingRef, "glm-5.2");
  assert.equal(glmApi.costNotice, "payg");
  assert.equal(glm.costNotice, "subscription");
  assert.equal(glm.entitlementRef, "glm-coding-plan-membership");
  assert.equal(glm.pricingRef, undefined);
  assert.equal(glmEntitlement.billingType, "subscription-quota");
  assert.match(glmEntitlement.quotaNotice, /GLM Coding Plan subscription quota/);
  assert.equal(glm.environment.ANTHROPIC_DEFAULT_OPUS_MODEL, "glm-5.3[1m]");
  assert.equal(glm.environment.ANTHROPIC_DEFAULT_SONNET_MODEL, "glm-5.3[1m]");
  assert.equal(glmApi.environment.ANTHROPIC_DEFAULT_OPUS_MODEL, "glm-5.2[1m]");
  assert.equal(glmApi.environment.ANTHROPIC_DEFAULT_SONNET_MODEL, "glm-5.2[1m]");
  assert.equal(glmApi.environment.ANTHROPIC_DEFAULT_HAIKU_MODEL, "glm-4.7");
  assert.equal(glmApi.environment.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "1000000");
  assert.equal(glmApi.environment.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
  assert.equal(glmApi.environment.API_TIMEOUT_MS, "3000000");
  assert.deepEqual(glmApi.requiredEnvironment, [
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
    "API_TIMEOUT_MS"
  ]);
  assert.deepEqual(
    {
      baseUrl: glmApiProvider.baseUrl,
      apiKeyUrl: glmApiProvider.apiKeyUrl,
      authVariable: glmApiProvider.authVariable,
      secretId: glmApiProvider.secretId,
      sourceUrl: glmApiProvider.sourceUrl
    },
    {
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      apiKeyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
      authVariable: "ANTHROPIC_API_KEY",
      secretId: "glm-api",
      sourceUrl: "https://docs.bigmodel.cn/cn/guide/develop/claude/introduction"
    }
  );
  assert.deepEqual(
    {
      baseUrl: kimiCodeProvider.baseUrl,
      apiKeyUrl: kimiCodeProvider.apiKeyUrl,
      authVariable: kimiCodeProvider.authVariable,
      secretId: kimiCodeProvider.secretId,
      sourceUrl: kimiCodeProvider.sourceUrl
    },
    {
      baseUrl: "https://api.kimi.com/coding/",
      apiKeyUrl: "https://www.kimi.com/code/console",
      authVariable: "ANTHROPIC_API_KEY",
      secretId: "kimi-code",
      sourceUrl: "https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html"
    }
  );
  assert.deepEqual(kimiCodeEntitlement, {
    id: "kimi-code-membership",
    displayName: "Kimi Code Membership",
    billingType: "subscription-quota",
    quotaNotice: "Consumes Kimi Code membership quota; Extra Usage may incur additional charges when enabled.",
    verifiedOn: "2026-08-12",
    sourceUrl: "https://www.kimi.com/code/docs/en/kimi-code/membership.html"
  });
  assert.equal(kimiProvider.authVariable, "ANTHROPIC_AUTH_TOKEN");
  assert.equal(kimiProvider.secretId, "kimi");
  assert.equal(glmProvider.authVariable, "ANTHROPIC_AUTH_TOKEN");
  assert.equal(glmProvider.secretId, "glm");

  const apiUsesToken = structuredClone(config);
  apiUsesToken.providers.find((item) => item.id === "glm-api").authVariable = "ANTHROPIC_AUTH_TOKEN";
  assert.throws(() => validateConfigSet(apiUsesToken), /glm-api provider contract/);

  const planUsesApiKey = structuredClone(config);
  planUsesApiKey.providers.find((item) => item.id === "glm").authVariable = "ANTHROPIC_API_KEY";
  assert.throws(() => validateConfigSet(planUsesApiKey), /glm provider authentication boundary/);

  const sharedSecret = structuredClone(config);
  sharedSecret.providers.find((item) => item.id === "glm-api").secretId = "glm";
  assert.throws(() => validateConfigSet(sharedSecret), /provider.secretId must equal provider.id/);

  const nonStandardKeyPage = structuredClone(config);
  nonStandardKeyPage.providers.find((item) => item.id === "glm-api").apiKeyUrl = "https://docs.bigmodel.cn/cn/coding-plan/quick-start";
  assert.throws(() => validateConfigSet(nonStandardKeyPage), /glm-api provider contract/);

  for (const [field, value] of Object.entries({
    baseUrl: "https://api.kimi.com/coding/",
    apiKeyUrl: "https://www.kimi.com/code/console",
    authVariable: "ANTHROPIC_API_KEY",
    sourceUrl: "https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html"
  })) {
    const crossWiredKimi = structuredClone(config);
    crossWiredKimi.providers.find((item) => item.id === "kimi")[field] = value;
    assert.throws(() => validateConfigSet(crossWiredKimi), /kimi open-platform provider contract/, field);
  }

  for (const [key, value] of Object.entries({
    ANTHROPIC_MODEL: "glm-5.2",
    ANTHROPIC_DEFAULT_FABLE_MODEL: "glm-5.2",
    CLAUDE_CODE_SUBAGENT_MODEL: "glm-4.7",
    CLAUDE_CODE_EFFORT_LEVEL: "max",
    ENABLE_TOOL_SEARCH: "false"
  })) {
    const extraEnvironment = structuredClone(config);
    extraEnvironment.profiles.find((item) => item.id === "glm-api").environment[key] = value;
    assert.throws(() => validateConfigSet(extraEnvironment), /glm-api profile environment mapping/, key);
  }

  const unknownCostNotice = structuredClone(config);
  unknownCostNotice.profiles.find((item) => item.id === "glm-api").costNotice = "metered";
  assert.throws(() => validateConfigSet(unknownCostNotice), /profile.costNotice must be high, standard, payg or subscription/);
});

test("provider endpoints, authentication and pricing records match the verified facts", async () => {
  const config = await loadConfigSet();
  const kimiProvider = config.providers.find((item) => item.id === "kimi");
  const deepseekProvider = config.providers.find((item) => item.id === "deepseek");
  const glmProvider = config.providers.find((item) => item.id === "glm");
  assert.deepEqual(
    { baseUrl: kimiProvider.baseUrl, authVariable: kimiProvider.authVariable, apiKeyUrl: kimiProvider.apiKeyUrl },
    {
      baseUrl: "https://api.moonshot.cn/anthropic",
      authVariable: "ANTHROPIC_AUTH_TOKEN",
      apiKeyUrl: "https://platform.kimi.com/console/api-keys"
    }
  );
  assert.deepEqual(
    { baseUrl: glmProvider.baseUrl, authVariable: glmProvider.authVariable, apiKeyUrl: glmProvider.apiKeyUrl, secretId: glmProvider.secretId },
    {
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      authVariable: "ANTHROPIC_AUTH_TOKEN",
      apiKeyUrl: "https://docs.bigmodel.cn/cn/coding-plan/quick-start",
      secretId: "glm"
    }
  );
  assert.deepEqual(
    { baseUrl: deepseekProvider.baseUrl, authVariable: deepseekProvider.authVariable, apiKeyUrl: deepseekProvider.apiKeyUrl },
    {
      baseUrl: "https://api.deepseek.com/anthropic",
      authVariable: "ANTHROPIC_AUTH_TOKEN",
      apiKeyUrl: "https://platform.deepseek.com/api_keys"
    }
  );
  const kimiPricing = config.pricing.find((item) => item.id === "kimi-k3");
  assert.deepEqual(kimiPricing.prices, { inputCacheHit: 2, inputCacheMiss: 20, output: 100 });
  const deepseekPricing = config.pricing.find((item) => item.id === "deepseek-v4");
  assert.deepEqual(deepseekPricing.prices, {
    "deepseek-v4-pro": { inputCacheHit: 0.003625, inputCacheMiss: 0.435, output: 0.87 },
    "deepseek-v4-flash": { inputCacheHit: 0.0028, inputCacheMiss: 0.14, output: 0.28 }
  });
  const glmPricing = config.pricing.find((item) => item.id === "glm-5.2");
  assert.equal(glmPricing.displayName, "GLM-5.2 standard API reference");
  assert.equal(glmPricing.model, "glm-5.2");
  assert.equal(glmPricing.contextWindowTokens, 1_000_000);
  assert.deepEqual(glmPricing.prices, { inputCacheHit: 2, inputCacheMiss: 8, output: 28 });

  const glmUsesPricing = structuredClone(config);
  const glmUsesPricingProfile = glmUsesPricing.profiles.find((item) => item.id === "glm");
  delete glmUsesPricingProfile.entitlementRef;
  glmUsesPricingProfile.pricingRef = "glm-5.2";
  glmUsesPricingProfile.costNotice = "payg";
  assert.throws(
    () => validateConfigSet(glmUsesPricing, { now: new Date("2026-08-21T00:00:00Z") }),
    /glm profile must reference the glm provider and Coding Plan subscription entitlement/
  );

  const malformedPricing = structuredClone(kimiPricing);
  delete malformedPricing.prices.output;
  assert.throws(() => validatePricing(malformedPricing), /must contain exactly/);
  const malformedGlmPricing = structuredClone(glmPricing);
  malformedGlmPricing.prices.output = 27;
  assert.throws(() => validatePricing(malformedGlmPricing), /pricing values are invalid/);
  malformedGlmPricing.prices.output = 28;
  malformedGlmPricing.prices.extra = 1;
  assert.throws(() => validatePricing(malformedGlmPricing), /must contain exactly/);
});

test("validator rejects unknown fields, missing required variables, and expired facts", async () => {
  const config = await loadConfigSet();
  const provider = { ...config.providers[0], unexpected: true };
  assert.throws(() => validateProvider(provider), /unknown field/);
  const profile = { ...config.profiles[0], environment: { ...config.profiles[0].environment, ANTHROPIC_MODEL: "kimi-k3" } };
  assert.doesNotThrow(() => validateProfile(profile, new Set(["kimi", "deepseek"])));
  const invalidProfile = { ...profile, environment: { ...profile.environment, unknown: "value" } };
  assert.throws(() => validateProfile(invalidProfile, new Set(["kimi", "deepseek"])), /unknown variable/);
  const missingProfile = {
    ...config.profiles[0],
    environment: Object.fromEntries(Object.entries(config.profiles[0].environment).filter(([key]) => key !== "ANTHROPIC_DEFAULT_FABLE_MODEL"))
  };
  assert.throws(() => validateProfile(missingProfile, new Set(["kimi", "deepseek"])), /missing required variable/);
  // Stale facts warn instead of failing (docs/21 SC-5): every command keeps working.
  const staleWarnings = [];
  assert.doesNotThrow(() => validateProvider(config.providers[0], { now: new Date("2027-02-01T00:00:00Z"), warnings: staleWarnings }));
  assert.equal(staleWarnings.length, 1);
  assert.match(staleWarnings[0], /is stale/);
  assert.throws(
    () => validateProvider({ ...config.providers[0], verifiedOn: "2026-02-31" }, { now: new Date("2026-07-19T00:00:00Z") }),
    /not a valid date/
  );
  assert.doesNotThrow(
    () => validateProvider({ ...config.providers[0], verifiedOn: "2026-07-19" }, { now: new Date(2026, 6, 19, 0, 1) })
  );
  const farFuture = await loadConfigSet({ now: new Date("2027-03-01T00:00:00Z") });
  assert.ok(farFuture.profiles.length > 0);
  assert.ok((farFuture.warnings ?? []).length >= farFuture.providers.length + farFuture.pricing.length);
});

test("profile commercial metadata uses exactly one pricing or entitlement reference", async () => {
  const config = await loadConfigSet();
  const profile = structuredClone(config.profiles[0]);
  const providerIds = new Set(config.providers.map((provider) => provider.id));
  const pricingIds = new Set(config.pricing.map((pricing) => pricing.id));
  const entitlementIds = new Set(["test-membership"]);
  const options = { pricingIds, entitlementIds };

  const withoutRefs = structuredClone(profile);
  delete withoutRefs.pricingRef;
  assert.throws(
    () => validateProfile(withoutRefs, providerIds, options),
    /profile must contain exactly one of pricingRef or entitlementRef/
  );

  const withBothRefs = { ...profile, entitlementRef: "test-membership" };
  assert.throws(
    () => validateProfile(withBothRefs, providerIds, options),
    /profile must contain exactly one of pricingRef or entitlementRef/
  );

  const unknownPricing = { ...profile, pricingRef: "unknown-pricing" };
  assert.throws(
    () => validateProfile(unknownPricing, providerIds, options),
    /profile.pricingRef is unknown: unknown-pricing/
  );

  const subscriptionProfile = { ...profile, costNotice: "subscription" };
  assert.throws(() => validateProfile(subscriptionProfile, providerIds, options), /subscription profile must use entitlementRef/);

  const entitlementProfile = { ...withoutRefs, entitlementRef: "test-membership", costNotice: "subscription" };
  assert.doesNotThrow(() => validateProfile(entitlementProfile, providerIds, options));

  const unknownEntitlement = { ...entitlementProfile, entitlementRef: "unknown-membership" };
  assert.throws(
    () => validateProfile(unknownEntitlement, providerIds, options),
    /profile.entitlementRef is unknown: unknown-membership/
  );

  const nonSubscriptionEntitlement = { ...entitlementProfile, costNotice: "standard" };
  assert.throws(
    () => validateProfile(nonSubscriptionEntitlement, providerIds, options),
    /profile with entitlementRef must use subscription cost notice/
  );
});

test("entitlement validation rejects unknown, insecure, stale and empty metadata", () => {
  const valid = {
    id: "test-membership",
    displayName: "Test Membership",
    billingType: "subscription-quota",
    quotaNotice: "Consumes subscription quota.",
    verifiedOn: "2026-08-12",
    sourceUrl: "https://example.com/membership"
  };
  const now = new Date("2026-08-12T00:00:00Z");
  assert.doesNotThrow(() => validateEntitlement(valid, { now }));
  assert.throws(() => validateEntitlement({ ...valid, unexpected: true }, { now }), /unknown field/);
  assert.throws(() => validateEntitlement({ ...valid, sourceUrl: "http://example.com/membership" }, { now }), /must use HTTPS/);
  assert.throws(() => validateEntitlement({ ...valid, verifiedOn: "2026-08-13" }, { now }), /cannot be in the future/);
  const staleWarnings = [];
  assert.doesNotThrow(() => validateEntitlement({ ...valid, verifiedOn: "2026-01-01" }, { now, warnings: staleWarnings }));
  assert.equal(staleWarnings.length, 1);
  assert.match(staleWarnings[0], /is stale/);
  assert.throws(() => validateEntitlement({ ...valid, quotaNotice: "" }, { now }), /quotaNotice must be a non-empty string/);
  assert.throws(() => validateEntitlement({ ...valid, quotaNotice: "   " }, { now }), /quotaNotice must be a non-empty string/);
});

test("validator enforces safe HTTPS API key URLs", async () => {
  const { providers } = await loadConfigSet();
  const provider = providers[0];
  for (const [label, value, pattern] of [
    ["missing", undefined, /missing required field/],
    ["http", "http://example.com/keys", /must use HTTPS/],
    ["relative", "/keys", /valid URL/],
    ["credentials", "https://user:pass@example.com/keys", /credentials/],
    ["fragment", "https://example.com/keys#fragment", /fragment/],
    ["leading whitespace", " https://example.com/keys", /surrounding whitespace/],
    ["trailing whitespace", "https://example.com/keys ", /surrounding whitespace/],
    ["control character", "https://example.com/keys\u0000", /control characters/]
  ]) {
    const candidate = structuredClone(provider);
    if (label === "missing") delete candidate.apiKeyUrl;
    else candidate.apiKeyUrl = value;
    assert.throws(() => validateProvider(candidate), pattern, label);
  }
});

test("validator rejects profile ID, alias, and reserved-command collisions", async () => {
  const config = await loadConfigSet();
  const aliasMatchesId = structuredClone(config);
  aliasMatchesId.profiles[0].aliases = ["deepseek", "kimi-k3"];
  assert.throws(() => validateConfigSet(aliasMatchesId), /profile alias collides with profile id/);

  const aliasMatchesReservedCommand = structuredClone(config);
  aliasMatchesReservedCommand.profiles[0].aliases = ["list", "kimi-k3"];
  assert.throws(() => validateConfigSet(aliasMatchesReservedCommand), /reserved command/);

  const aliasMatchesSetupCommand = structuredClone(config);
  aliasMatchesSetupCommand.profiles[0].aliases.push("setup");
  assert.throws(() => validateConfigSet(aliasMatchesSetupCommand), /reserved command/);

  const aliasMatchesUpdateCommand = structuredClone(config);
  aliasMatchesUpdateCommand.profiles[0].aliases.push("update");
  assert.throws(() => validateConfigSet(aliasMatchesUpdateCommand), /reserved command/);

  const duplicateAlias = structuredClone(config);
  duplicateAlias.profiles[1].aliases = ["plan", "deepseek-auto"];
  assert.throws(() => validateConfigSet(duplicateAlias), /duplicate profile alias/);

  const crossWiredProfile = structuredClone(config);
  crossWiredProfile.profiles[0].provider = "deepseek";
  crossWiredProfile.profiles[0].pricingRef = "deepseek-v4";
  assert.throws(() => validateConfigSet(crossWiredProfile), /kimi profile must reference/);
});

test("loader rejects traversal-like configuration IDs", () => {
  assert.throws(() => getConfigPath("profiles", "../secret"), /invalid/);
});
