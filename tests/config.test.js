import assert from "node:assert/strict";
import test from "node:test";
import { getConfigPath, loadConfigSet, resolveProfile } from "../src/config/loader.js";
import { validateConfigSet, validatePricing, validateProfile, validateProvider } from "../src/config/validator.js";

test("loads exactly the kimi and deepseek profiles", async () => {
  const config = await loadConfigSet();
  assert.deepEqual(config.profiles.map((profile) => profile.id), ["kimi", "deepseek"]);
  assert.deepEqual(config.providers.map((provider) => provider.id), ["kimi", "deepseek"]);
});

test("resolves profile IDs and aliases without fuzzy matching", async () => {
  const { profiles } = await loadConfigSet();
  assert.equal(resolveProfile(profiles, "kimi").id, "kimi");
  assert.equal(resolveProfile(profiles, "plan").id, "kimi");
  assert.equal(resolveProfile(profiles, "kimi-k3").id, "kimi");
  assert.equal(resolveProfile(profiles, "deepseek").id, "deepseek");
  assert.equal(resolveProfile(profiles, "build").id, "deepseek");
  assert.equal(resolveProfile(profiles, "KIMI"), null);
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

test("provider endpoints, authentication and pricing records match the verified facts", async () => {
  const config = await loadConfigSet();
  const kimiProvider = config.providers.find((item) => item.id === "kimi");
  const deepseekProvider = config.providers.find((item) => item.id === "deepseek");
  assert.deepEqual(
    { baseUrl: kimiProvider.baseUrl, authVariable: kimiProvider.authVariable, apiKeyUrl: kimiProvider.apiKeyUrl },
    {
      baseUrl: "https://api.moonshot.cn/anthropic",
      authVariable: "ANTHROPIC_AUTH_TOKEN",
      apiKeyUrl: "https://platform.kimi.com/console/api-keys"
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

  const malformedPricing = structuredClone(kimiPricing);
  delete malformedPricing.prices.output;
  assert.throws(() => validatePricing(malformedPricing), /must contain exactly/);
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
