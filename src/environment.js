import { PROFILE_ENV_KEYS } from "./config/validator.js";

export const ROUTER_MANAGED_ENV_VARS = Object.freeze([
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "ENABLE_TOOL_SEARCH",
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
  "CLAUDE_CODE_EFFORT_LEVEL"
]);

export function buildChildEnvironment({ parentEnv = process.env, provider, profile, secret }) {
  if (!provider || !profile) throw new Error("provider and profile are required to build a child environment");
  if (typeof secret !== "string" || secret.length === 0) throw new Error("a configured provider secret is required");
  const environment = { ...parentEnv };
  const managedKeys = new Set(ROUTER_MANAGED_ENV_VARS.map((key) => key.toLowerCase()));
  for (const key of Object.keys(environment)) {
    if (managedKeys.has(key.toLowerCase())) delete environment[key];
  }
  environment.ANTHROPIC_BASE_URL = provider.baseUrl;
  environment[provider.authVariable] = secret;
  for (const key of PROFILE_ENV_KEYS) {
    if (Object.hasOwn(profile.environment, key)) environment[key] = profile.environment[key];
  }
  return environment;
}

export function getEnvironmentSnapshot(environment) {
  const keys = ["ANTHROPIC_BASE_URL", ...PROFILE_ENV_KEYS];
  const snapshot = {};
  for (const key of keys) {
    if (Object.hasOwn(environment, key)) snapshot[key] = environment[key];
  }
  snapshot.hasAnthropicApiKey = Boolean(environment.ANTHROPIC_API_KEY);
  snapshot.hasAnthropicAuthToken = Boolean(environment.ANTHROPIC_AUTH_TOKEN);
  return snapshot;
}
