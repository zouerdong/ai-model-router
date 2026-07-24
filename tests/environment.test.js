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
});
