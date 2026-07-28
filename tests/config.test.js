import assert from "node:assert/strict";
import test from "node:test";
import { getConfigPath, loadConfigSet, resolveProfile } from "../src/config/loader.js";
import { validateConfigSet, validatePricing, validateProfile, validateProvider } from "../src/config/validator.js";

test("loads exactly the kimi, deepseek, glm and glm-api profiles", async () => {
  const config = await loadConfigSet();
  assert.deepEqual(config.profiles.map((profile) => profile.id), ["kimi", "deepseek", "glm", "glm-api"]);
  assert.deepEqual(config.providers.map((provider) => provider.id), ["kimi", "deepseek", "glm", "glm-api"]);
  assert.deepEqual(config.pricing.map((pricing) => pricing.id), ["kimi-k3", "deepseek-v4", "glm-5.2"]);
});

test("resolves profile IDs and aliases without fuzzy matching", async () => {
  const { profiles } = await loadConfigSet();
  assert.equal(resolveProfile(profiles, "kimi").id, "kimi");
  assert.equal(resolveProfile(profiles, "plan").id, "kimi");
  assert.equal(resolveProfile(profiles, "kimi-k3").id, "kimi");
  assert.equal(resolveProfile(profiles, "deepseek").id, "deepseek");
  assert.equal(resolveProfile(profiles, "build").id, "deepseek");
  assert.equal(resolveProfile(profiles, "glm").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-5.2").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-plan").id, "glm");
  assert.equal(resolveProfile(profiles, "glm-api").id, "glm-api");
  assert.equal(resolveProfile(profiles, "glm-payg").id, "glm-api");
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

test("DeepSeek profile stays on the official Auto Pro/Flash mapping", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "deepseek");
  assert.equal(profile.environment.ANTHROPIC_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_OPUS_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_SONNET_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(profile.environment.ANTHROPIC_DEFAULT_HAIKU_MODEL, "deepseek-v4-flash");
  assert.equal(profile.environment.CLAUDE_CODE_SUBAGENT_MODEL, "deepseek-v4-flash");
  assert.equal(Object.hasOwn(profile.environment, "ANTHROPIC_DEFAULT_FABLE_MODEL"), false);
  assert.equal(Object.hasOwn(profile.environment, "CLAUDE_CODE_AUTO_COMPACT_WINDOW"), false);
});

test("GLM profile contains the exact Coding Plan mapping and no unverified variables", async () => {
  const config = await loadConfigSet();
  const profile = config.profiles.find((item) => item.id === "glm");
  assert.deepEqual(profile.environment, {
    ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.2[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.2[1m]",
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
  const glmProvider = config.providers.find((item) => item.id === "glm");
  const glmApiProvider = config.providers.find((item) => item.id === "glm-api");
  assert.deepEqual(glmApi.aliases, ["glm-payg"]);
  assert.equal(glmApi.provider, "glm-api");
  assert.equal(glmApi.pricingRef, "glm-5.2");
  assert.equal(glmApi.costNotice, "payg");
  assert.deepEqual(glmApi.environment, glm.environment);
  assert.deepEqual(glmApi.requiredEnvironment, glm.requiredEnvironment);
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
  assert.throws(() => validateConfigSet(unknownCostNotice), /profile.costNotice must be high, standard or payg/);
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
  assert.throws(() => validateProvider(config.providers[0], { now: new Date("2027-02-01T00:00:00Z") }), /expired/);
  assert.throws(
    () => validateProvider({ ...config.providers[0], verifiedOn: "2026-02-31" }, { now: new Date("2026-07-19T00:00:00Z") }),
    /not a valid date/
  );
  assert.doesNotThrow(
    () => validateProvider({ ...config.providers[0], verifiedOn: "2026-07-19" }, { now: new Date(2026, 6, 19, 0, 1) })
  );
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
