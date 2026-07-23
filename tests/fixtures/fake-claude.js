import { writeFile } from "node:fs/promises";

const output = {
  args: process.argv.slice(2),
  cwd: process.cwd(),
  baseUrl: process.env.ANTHROPIC_BASE_URL ?? null,
  model: process.env.ANTHROPIC_MODEL ?? null,
  opus: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? null,
  sonnet: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? null,
  haiku: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? null,
  fable: process.env.ANTHROPIC_DEFAULT_FABLE_MODEL ?? null,
  subagent: process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? null,
  compact: process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? null,
  effort: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null,
  toolSearch: process.env.ENABLE_TOOL_SEARCH ?? null,
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  hasAuthToken: Boolean(process.env.ANTHROPIC_AUTH_TOKEN)
};

if (process.env.FAKE_OUTPUT_FILE) await writeFile(process.env.FAKE_OUTPUT_FILE, JSON.stringify(output), "utf8");
process.exitCode = Number(process.env.FAKE_CLAUDE_EXIT_CODE ?? 0);
