import assert from "node:assert/strict";
import test from "node:test";
import { loadConfigSet } from "../src/config/loader.js";
import { buildChildEnvironment, getEnvironmentSnapshot, ROUTER_MANAGED_ENV_VARS } from "../src/environment.js";

test("builds an isolated Kimi child environment without mutating the parent", async () => {
  const config = await loadConfigSet();
  const provider = config.providers.find((item) => item.id === "kimi");
  const profile = config.profiles.find((item) => item.id === "kimi");
  const parent = { PATH: "/test/bin", TAVILY_API_KEY: "test-tavily", CLAUDE_CODE_MAX_CONTEXT_TOKENS: "legacy" };
  for (const key of ROUTER_MANAGED_ENV_VARS) parent[key] = `old-${key}`;
  parent.anthropic_model = "stale-mixed-case-model";
  parent.Anthropic_Api_Key = "stale-mixed-case-key";
  const before = { ...parent };
  const child = buildChildEnvironment({ parentEnv: parent, provider, profile, secret: "test-kimi-key" });
  assert.deepEqual(parent, before);
  assert.equal(child.ANTHROPIC_BASE_URL, "https://api.moonshot.cn/anthropic");
  assert.equal(child.ANTHROPIC_AUTH_TOKEN, "test-kimi-key");
  assert.equal(Object.hasOwn(child, "ANTHROPIC_API_KEY"), false);
  assert.equal(Object.hasOwn(child, "anthropic_model"), false);
  assert.equal(Object.hasOwn(child, "Anthropic_Api_Key"), false);
  assert.equal(child.ANTHROPIC_MODEL, "kimi-k3[1m]");
  assert.equal(child.CLAUDE_CODE_SUBAGENT_MODEL, "kimi-k3[1m]");
  assert.equal(child.CLAUDE_CODE_MAX_CONTEXT_TOKENS, "legacy");
  assert.equal(getEnvironmentSnapshot(child).hasAnthropicAuthToken, true);
  assert.equal(JSON.stringify(getEnvironmentSnapshot(child)).includes("test-kimi-key"), false);
});

test("builds DeepSeek Auto without Kimi-only leftovers", async () => {
  const config = await loadConfigSet();
  const provider = config.providers.find((item) => item.id === "deepseek");
  const profile = config.profiles.find((item) => item.id === "deepseek");
  const child = buildChildEnvironment({
    parentEnv: { ANTHROPIC_DEFAULT_FABLE_MODEL: "old-fable", ANTHROPIC_API_KEY: "old-key", PATH: "/test/bin" },
    provider,
    profile,
    secret: "test-deepseek-key"
  });
  assert.equal(child.ANTHROPIC_MODEL, "deepseek-v4-pro[1m]");
  assert.equal(child.ANTHROPIC_DEFAULT_HAIKU_MODEL, "deepseek-v4-flash");
  assert.equal(child.CLAUDE_CODE_SUBAGENT_MODEL, "deepseek-v4-flash");
  assert.equal(Object.hasOwn(child, "ANTHROPIC_DEFAULT_FABLE_MODEL"), false);
  assert.equal(child.ANTHROPIC_AUTH_TOKEN, "test-deepseek-key");
  assert.equal(Object.hasOwn(child, "ANTHROPIC_API_KEY"), false);
  assert.equal(Object.hasOwn(child, "API_TIMEOUT_MS"), false);
  assert.equal(Object.hasOwn(child, "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"), false);
});

test("builds GLM Coding Plan with its exact public mapping and no inherited auth leftovers", async () => {
  const config = await loadConfigSet();
  const provider = config.providers.find((item) => item.id === "glm");
  const profile = config.profiles.find((item) => item.id === "glm");
  const parent = {
    PATH: "/test/bin",
    ANTHROPIC_API_KEY: "old-api-key",
    aNtHrOpIc_AuTh_ToKeN: "old-token",
    api_timeout_ms: "999",
    Claude_Code_Disable_Nonessential_Traffic: "0"
  };
  const before = { ...parent };
  const child = buildChildEnvironment({ parentEnv: parent, provider, profile, secret: "test-glm-key" });
  assert.deepEqual(parent, before);
  assert.equal(child.ANTHROPIC_BASE_URL, "https://open.bigmodel.cn/api/anthropic");
  assert.equal(child.ANTHROPIC_AUTH_TOKEN, "test-glm-key");
  assert.equal(Object.hasOwn(child, "ANTHROPIC_API_KEY"), false);
  assert.equal(Object.hasOwn(child, "aNtHrOpIc_AuTh_ToKeN"), false);
  assert.equal(Object.hasOwn(child, "api_timeout_ms"), false);
  assert.equal(Object.hasOwn(child, "Claude_Code_Disable_Nonessential_Traffic"), false);
  assert.equal(child.ANTHROPIC_DEFAULT_OPUS_MODEL, "glm-5.2[1m]");
  assert.equal(child.ANTHROPIC_DEFAULT_SONNET_MODEL, "glm-5.2[1m]");
  assert.equal(child.ANTHROPIC_DEFAULT_HAIKU_MODEL, "glm-4.7");
  assert.equal(child.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "1000000");
  assert.equal(child.API_TIMEOUT_MS, "3000000");
  assert.equal(child.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
  assert.equal(Object.hasOwn(child, "ANTHROPIC_MODEL"), false);
  assert.equal(Object.hasOwn(child, "ANTHROPIC_DEFAULT_FABLE_MODEL"), false);
  assert.equal(Object.hasOwn(child, "CLAUDE_CODE_SUBAGENT_MODEL"), false);
  assert.equal(Object.hasOwn(child, "CLAUDE_CODE_EFFORT_LEVEL"), false);
  assert.equal(Object.hasOwn(child, "ENABLE_TOOL_SEARCH"), false);
  const snapshot = getEnvironmentSnapshot(child);
  assert.equal(snapshot.API_TIMEOUT_MS, "3000000");
  assert.equal(snapshot.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
  assert.equal(JSON.stringify(snapshot).includes("test-glm-key"), false);
});

test("builds GLM standard API with API key authentication only and no mixed-case leftovers", async () => {
  const config = await loadConfigSet();
  const provider = config.providers.find((item) => item.id === "glm-api");
  const profile = config.profiles.find((item) => item.id === "glm-api");
  const parent = {
    PATH: "/test/bin",
    ANTHROPIC_API_KEY: "old-api",
    ANTHROPIC_AUTH_TOKEN: "old-token",
    Anthropic_Api_Key: "old-mixed-api",
    aNtHrOpIc_AuTh_ToKeN: "old-mixed-token",
    API_TIMEOUT_MS: "999",
    Claude_Code_Disable_Nonessential_Traffic: "0"
  };
  const before = { ...parent };
  const child = buildChildEnvironment({ parentEnv: parent, provider, profile, secret: "test-glm-api-key" });
  assert.deepEqual(parent, before);
  assert.equal(child.ANTHROPIC_BASE_URL, "https://open.bigmodel.cn/api/anthropic");
  assert.equal(child.ANTHROPIC_API_KEY, "test-glm-api-key");
  for (const key of ["ANTHROPIC_AUTH_TOKEN", "Anthropic_Api_Key", "aNtHrOpIc_AuTh_ToKeN", "Claude_Code_Disable_Nonessential_Traffic"]) {
    assert.equal(Object.hasOwn(child, key), false, key);
  }
  assert.equal(child.ANTHROPIC_DEFAULT_OPUS_MODEL, "glm-5.2[1m]");
  assert.equal(child.ANTHROPIC_DEFAULT_SONNET_MODEL, "glm-5.2[1m]");
  assert.equal(child.ANTHROPIC_DEFAULT_HAIKU_MODEL, "glm-4.7");
  assert.equal(child.CLAUDE_CODE_AUTO_COMPACT_WINDOW, "1000000");
  assert.equal(child.API_TIMEOUT_MS, "3000000");
  assert.equal(child.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
  for (const key of [
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL",
    "ENABLE_TOOL_SEARCH"
  ]) {
    assert.equal(Object.hasOwn(child, key), false, key);
  }
  const snapshot = getEnvironmentSnapshot(child);
  assert.equal(snapshot.hasAnthropicApiKey, true);
  assert.equal(snapshot.hasAnthropicAuthToken, false);
  assert.equal(JSON.stringify(snapshot).includes("test-glm-api-key"), false);
});

test("sequential GLM, GLM API, Kimi and DeepSeek launches do not retain Router variables", async () => {
  const config = await loadConfigSet();
  const glmProvider = config.providers.find((item) => item.id === "glm");
  const glmProfile = config.profiles.find((item) => item.id === "glm");
  const glmApiProvider = config.providers.find((item) => item.id === "glm-api");
  const glmApiProfile = config.profiles.find((item) => item.id === "glm-api");
  const kimiProvider = config.providers.find((item) => item.id === "kimi");
  const kimiProfile = config.profiles.find((item) => item.id === "kimi");
  const deepseekProvider = config.providers.find((item) => item.id === "deepseek");
  const deepseekProfile = config.profiles.find((item) => item.id === "deepseek");
  const glm = buildChildEnvironment({ parentEnv: { PATH: "/test/bin" }, provider: glmProvider, profile: glmProfile, secret: "test-glm-key" });
  const glmApi = buildChildEnvironment({ parentEnv: glm, provider: glmApiProvider, profile: glmApiProfile, secret: "test-glm-api-key" });
  const glmAgain = buildChildEnvironment({ parentEnv: glmApi, provider: glmProvider, profile: glmProfile, secret: "test-glm-key" });
  const kimi = buildChildEnvironment({ parentEnv: glmAgain, provider: kimiProvider, profile: kimiProfile, secret: "test-kimi-key" });
  const deepseek = buildChildEnvironment({ parentEnv: kimi, provider: deepseekProvider, profile: deepseekProfile, secret: "test-deepseek-key" });
  assert.equal(Object.hasOwn(kimi, "API_TIMEOUT_MS"), false);
  assert.equal(Object.hasOwn(kimi, "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"), false);
  assert.equal(Object.hasOwn(deepseek, "API_TIMEOUT_MS"), false);
  assert.equal(Object.hasOwn(deepseek, "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"), false);
  assert.equal(Object.hasOwn(deepseek, "ANTHROPIC_DEFAULT_FABLE_MODEL"), false);
  assert.equal(deepseek.ANTHROPIC_AUTH_TOKEN, "test-deepseek-key");
  assert.equal(Object.hasOwn(deepseek, "ANTHROPIC_API_KEY"), false);
  assert.equal(glmApi.ANTHROPIC_API_KEY, "test-glm-api-key");
  assert.equal(Object.hasOwn(glmApi, "ANTHROPIC_AUTH_TOKEN"), false);
  assert.equal(glmAgain.ANTHROPIC_AUTH_TOKEN, "test-glm-key");
  assert.equal(Object.hasOwn(glmAgain, "ANTHROPIC_API_KEY"), false);
});
