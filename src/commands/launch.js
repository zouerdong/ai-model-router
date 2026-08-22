import { stderr } from "node:process";
import { loadConfigSet, resolveProfile } from "../config/loader.js";
import { buildChildEnvironment } from "../environment.js";
import { runClaude } from "../launcher.js";
import { assertNoSettingsConflicts } from "../settings-conflict.js";
import { ensureProviderSecret } from "./setup.js";
import { SecretStore } from "../secret-store.js";

function describeUnknownSelector(selector) {
  if (typeof selector !== "string" || selector.length === 0) return "unknown profile";
  // A key accidentally pasted as the profile argument must not be echoed into terminal
  // scrollback, pipes, or CI logs; token-shaped input is redacted before it reaches the error.
  if (selector.length >= 24 && /^[A-Za-z0-9_.\-]+$/.test(selector)) {
    return `unknown profile: <redacted ${selector.length}-character input>`;
  }
  return `unknown profile: ${selector.length > 40 ? `${selector.slice(0, 40)}…` : selector}`;
}

function formatPricing(pricing) {
  if (pricing.id === "kimi-k3") {
    const { inputCacheHit, inputCacheMiss, output } = pricing.prices;
    return `CNY/M tokens: cache hit ${inputCacheHit}, cache miss ${inputCacheMiss}, output ${output}`;
  }
  if (pricing.id === "deepseek-v4") {
    return "DeepSeek V4 Pro/Flash pricing is recorded in config/pricing/deepseek-v4.json";
  }
  if (pricing.id === "glm-5.2") {
    const { inputCacheHit, inputCacheMiss, output } = pricing.prices;
    return `CNY/M GLM-5.2 tokens: cache hit ${inputCacheHit}, input ${inputCacheMiss}, output ${output}`;
  }
  throw new Error(`unsupported pricing configuration: ${pricing.id}`);
}

export async function launchProfile(profileSelector, claudeArgs = [], options = {}) {
  if (!Array.isArray(claudeArgs)) throw new TypeError("claudeArgs must be an array");
  const config = options.config ?? await loadConfigSet(options);
  const profile = resolveProfile(config.profiles, profileSelector);
  if (!profile) throw new Error(describeUnknownSelector(profileSelector));
  const provider = config.providers.find((item) => item.id === profile.provider);
  const pricing = config.pricing.find((item) => item.id === profile.pricingRef);
  const entitlement = config.entitlements.find((item) => item.id === profile.entitlementRef);
  // Claude Code settings env overrides the injected environment; refuse to launch a session that
  // would be silently redirected (e.g. keys persisted by CC Switch or other provider switchers).
  await assertNoSettingsConflicts({
    platform: options.platform ?? process.platform,
    env: options.parentEnv ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    homedir: options.homedir,
    fs: options.settingsFs
  });
  const input = options.input ?? process.stdin;
  const output = options.output ?? stderr;
  const errorOutput = options.errorOutput ?? stderr;
  const interactive = options.interactive ?? Boolean(input.isTTY && output.isTTY);
  const secretStore = options.secretStore ?? new SecretStore({
    ...options,
    providerIds: config.providers.map((item) => item.secretId)
  });
  let secret = options.secret ?? await secretStore.get(provider.secretId);
  if (!secret) {
    if (!interactive) throw new Error(`missing ${provider.displayName} secret; run cmr secret set ${provider.secretId}`);
    const setupResult = await ensureProviderSecret(provider, {
      ...options,
      input,
      output,
      errorOutput,
      interactive,
      secretStore,
      providerIds: config.providers.map((item) => item.secretId)
    });
    if (setupResult.exitCode !== 0) return setupResult.exitCode;
    secret = await secretStore.get(provider.secretId);
    if (!secret) throw new Error(`missing ${provider.displayName} secret; run cmr secret set ${provider.secretId}`);
  }

  if (profile.costNotice === "high") {
    output.write(`WARN  ${profile.displayName} is a high-cost profile; ${formatPricing(pricing)}; verified ${pricing.verifiedOn}.\n`);
  } else if (profile.costNotice === "payg") {
    output.write(`WARN  ${profile.displayName} uses direct standard API billing; ${formatPricing(pricing)}; other mapped models may have different rates; verified ${pricing.verifiedOn}.\n`);
  } else if (profile.costNotice === "subscription") {
    output.write(`WARN  ${profile.displayName} uses subscription quota; ${entitlement.quotaNotice}; verified ${entitlement.verifiedOn}.\n`);
  }
  const environment = buildChildEnvironment({ parentEnv: options.parentEnv ?? process.env, provider, profile, secret });
  return runClaude({
    env: environment,
    cwd: options.cwd ?? process.cwd(),
    executable: options.executable,
    executableArgs: options.executableArgs,
    claudeArgs,
    platform: options.platform ?? process.platform,
    spawnImpl: options.spawnImpl,
    processLike: options.processLike ?? process,
    stdio: options.stdio ?? "inherit"
  });
}
