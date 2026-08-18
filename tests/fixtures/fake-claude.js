import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const routerManagedEnvironmentNames = new Set([
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
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "API_TIMEOUT_MS"
].map((key) => key.toLowerCase()));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const claudeArgs = process.argv.slice(2);
const safeSnapshot = process.env.FAKE_SAFE_SNAPSHOT === "1";
const output = {
  ...(safeSnapshot
    ? { argsSha256: sha256(JSON.stringify(claudeArgs)), cwdSha256: sha256(process.cwd()) }
    : { args: claudeArgs, cwd: process.cwd() }),
  baseUrl: process.env.ANTHROPIC_BASE_URL ?? null,
  model: process.env.ANTHROPIC_MODEL ?? null,
  opus: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? null,
  sonnet: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? null,
  haiku: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? null,
  fable: process.env.ANTHROPIC_DEFAULT_FABLE_MODEL ?? null,
  subagent: process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? null,
  compact: process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? null,
  maxContext: process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS ?? null,
  apiTimeoutMs: process.env.API_TIMEOUT_MS ?? null,
  disableNonessentialTraffic: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? null,
  effort: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null,
  toolSearch: process.env.ENABLE_TOOL_SEARCH ?? null,
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  hasAuthToken: Boolean(process.env.ANTHROPIC_AUTH_TOKEN),
  anthropicAuthVariables: Object.keys(process.env)
    .filter((key) => ["anthropic_api_key", "anthropic_auth_token"].includes(key.toLowerCase()))
    .sort(),
  routerEnvironmentKeys: Object.keys(process.env)
    .filter((key) => routerManagedEnvironmentNames.has(key.toLowerCase()))
    .sort()
};

if (process.env.FAKE_OUTPUT_FILE) await writeFile(process.env.FAKE_OUTPUT_FILE, JSON.stringify(output), "utf8");
process.exitCode = Number(process.env.FAKE_CLAUDE_EXIT_CODE ?? 0);
