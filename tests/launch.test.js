import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { launchProfile } from "../src/commands/launch.js";
import { SecretStore } from "../src/secret-store.js";
import { SetupStateStore } from "../src/setup-state.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-claude.js", import.meta.url));

function outputCapture() {
  let text = "";
  return { stream: { isTTY: false, write: (chunk) => { text += chunk; } }, get text() { return text; } };
}

async function canonicalPath(value) {
  const resolved = await realpath(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function fakePrompter({ secret = "test-kimi-key", cancel = false } = {}) {
  let hiddenCalls = 0;
  return {
    get hiddenCalls() { return hiddenCalls; },
    choose: async () => "exit",
    confirm: async () => false,
    hidden: async () => {
      hiddenCalls += 1;
      if (cancel) {
        const error = new Error("cancelled");
        error.code = "CMR_CANCELLED";
        throw error;
      }
      return secret;
    }
  };
}

async function runFake(root, selector, claudeArgs, file, secret, extraParentEnv = {}) {
  const outputFile = path.join(root, file);
  const output = outputCapture();
  const inputArgs = claudeArgs.slice();
  const code = await launchProfile(selector, inputArgs, {
    secret,
    output: output.stream,
    parentEnv: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: outputFile, ...extraParentEnv },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  return {
    code,
    snapshot: JSON.parse(await readFile(outputFile, "utf8")),
    output: output.text,
    inputArgs
  };
}

test("launchProfile injects the selected profile and passes Claude args unchanged", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const kimiOutputFile = path.join(root, "kimi.json");
  const planOutput = outputCapture();
  const kimiArgs = ["--continue", "-p", "opaque prompt with spaces"];
  const planCode = await launchProfile("kimi", kimiArgs, {
    secret: "test-kimi-key",
    output: planOutput.stream,
    parentEnv: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: kimiOutputFile },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  const planSnapshot = JSON.parse(await readFile(kimiOutputFile, "utf8"));
  assert.equal(planCode, 0);
  assert.deepEqual(planSnapshot.args, kimiArgs);
  assert.equal(planSnapshot.model, "kimi-k3[1m]");
  assert.equal(planSnapshot.fable, "kimi-k3[1m]");
  assert.match(planOutput.text, /high-cost profile/);
  assert.doesNotMatch(planOutput.text, /new Claude Code session|Do not switch|planning only|build only/);
  assert.doesNotMatch(planOutput.text, /test-kimi-key/);

  const buildOutputFile = path.join(root, "build.json");
  const buildOutput = outputCapture();
  const deepseekArgs = ["--permission-mode", "plan"];
  const buildCode = await launchProfile("deepseek", deepseekArgs, {
    secret: "test-deepseek-key",
    output: buildOutput.stream,
    parentEnv: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: buildOutputFile },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  const buildSnapshot = JSON.parse(await readFile(buildOutputFile, "utf8"));
  assert.equal(buildCode, 0);
  assert.deepEqual(buildSnapshot.args, deepseekArgs);
  assert.equal(buildSnapshot.model, "deepseek-v4-pro[1m]");
  assert.equal(buildSnapshot.haiku, "deepseek-v4-flash");
  assert.equal(buildSnapshot.fable, null);
  assert.equal(buildSnapshot.hasAuthToken, true);
  assert.doesNotMatch(buildOutput.text, /test-deepseek-key/);

  const glm = await runFake(root, "glm", ["--resume", "glm-session-123", "-p", "CMR_GLM_PRIVATE_PROMPT_SENTINEL"], "glm.json", "test-glm-key");
  assert.equal(glm.code, 0);
  assert.deepEqual(glm.snapshot.args, ["--resume", "glm-session-123", "-p", "CMR_GLM_PRIVATE_PROMPT_SENTINEL"]);
  assert.equal(glm.snapshot.baseUrl, "https://open.bigmodel.cn/api/anthropic");
  assert.equal(glm.snapshot.hasAuthToken, true);
  assert.equal(glm.snapshot.hasApiKey, false);
  assert.equal(glm.snapshot.model, null);
  assert.equal(glm.snapshot.opus, "glm-5.3[1m]");
  assert.equal(glm.snapshot.sonnet, "glm-5.3[1m]");
  assert.equal(glm.snapshot.haiku, "glm-4.7");
  assert.equal(glm.snapshot.compact, "1000000");
  assert.equal(glm.snapshot.apiTimeoutMs, "3000000");
  assert.equal(glm.snapshot.disableNonessentialTraffic, "1");
  assert.equal(glm.snapshot.fable, null);
  assert.equal(glm.snapshot.subagent, null);
  assert.equal(glm.snapshot.effort, null);
  assert.equal(glm.snapshot.toolSearch, null);
  assert.match(glm.output, /uses subscription quota/);
  assert.doesNotMatch(glm.output, /cache hit 2|input 8|output 28|standard API billing/);
  assert.doesNotMatch(glm.output, /test-glm-key|CMR_GLM_PRIVATE_PROMPT_SENTINEL/);

  const glmApi = await runFake(root, "glm-api", ["--help", "-p", "CMR_GLM_API_PRIVATE_PROMPT_SENTINEL"], "glm-api.json", "test-glm-api-key");
  assert.equal(glmApi.code, 0);
  assert.deepEqual(glmApi.snapshot.args, ["--help", "-p", "CMR_GLM_API_PRIVATE_PROMPT_SENTINEL"]);
  assert.equal(glmApi.snapshot.baseUrl, "https://open.bigmodel.cn/api/anthropic");
  assert.equal(glmApi.snapshot.hasApiKey, true);
  assert.equal(glmApi.snapshot.hasAuthToken, false);
  assert.equal(glmApi.snapshot.model, null);
  assert.equal(glmApi.snapshot.opus, "glm-5.2[1m]");
  assert.equal(glmApi.snapshot.sonnet, "glm-5.2[1m]");
  assert.equal(glmApi.snapshot.haiku, "glm-4.7");
  assert.equal(glmApi.snapshot.compact, "1000000");
  assert.equal(glmApi.snapshot.apiTimeoutMs, "3000000");
  assert.equal(glmApi.snapshot.disableNonessentialTraffic, "1");
  assert.equal(glmApi.snapshot.fable, null);
  assert.equal(glmApi.snapshot.subagent, null);
  assert.equal(glmApi.snapshot.effort, null);
  assert.equal(glmApi.snapshot.toolSearch, null);
  assert.match(glmApi.output, /GLM-5\.2 API \(Pay-as-you-go\) uses direct standard API billing/);
  assert.match(glmApi.output, /cache hit 2, input 8, output 28/);
  assert.match(glmApi.output, /verified 2026-08-16/);
  assert.doesNotMatch(glmApi.output, /test-glm-api-key|CMR_GLM_API_PRIVATE_PROMPT_SENTINEL/);
  assert.doesNotMatch(glm.output, /direct standard API billing/);
});

test("a legacy provider set launches from a store written by a newer CMR version", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-legacy-reader-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const storePath = path.join(root, "secrets.json");
  const newerWriter = new SecretStore({ filePath: storePath });
  await newerWriter.set("kimi", "test-kimi-key");
  await newerWriter.set("kimi-code", "test-kimi-code-key");
  const legacyStore = new SecretStore({ filePath: storePath, providerIds: ["kimi", "deepseek", "glm", "glm-api"] });
  const outputFile = path.join(root, "legacy-launch.json");
  const output = outputCapture();
  const code = await launchProfile("kimi", [], {
    secretStore: legacyStore,
    output: output.stream,
    parentEnv: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: outputFile },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  assert.equal(code, 0);
  assert.doesNotMatch(output.text, /unknown provider/);
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.deepEqual(snapshot.args, []);
  assert.equal(snapshot.hasAuthToken, true);
  assert.equal(snapshot.hasApiKey, false);
  assert.equal(snapshot.model, "kimi-k3[1m]");
  assert.doesNotMatch(output.text, /test-kimi-key/);
});

test("Kimi Code profiles launch through the isolated API key path with exact argv and quota warning", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-kimi-code-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const cases = [
    ["kimi-code", "kimi-for-coding", "262144", null],
    ["kimi-code-k3-256k", "k3-256k", "262144", "high"],
    ["kimi-code-k3", "k3[1m]", "1048576", "high"]
  ];
  for (const [index, [selector, model, context, effort]] of cases.entries()) {
    const args = ["--continue", "--model", "opaque-kimi-code-model", "-p", `prompt-${index}`];
    const result = await runFake(root, selector, args, `kimi-code-${index}.json`, "test-kimi-code-key", {
      ANTHROPIC_AUTH_TOKEN: "stale-token",
      aNtHrOpIc_AuTh_ToKeN: "stale-mixed-token",
      Anthropic_Api_Key: "stale-mixed-api-key"
    });
    assert.equal(result.code, 0);
    assert.deepEqual(result.snapshot.args, args);
    assert.equal(result.snapshot.baseUrl, "https://api.kimi.com/coding/");
    for (const key of ["model", "opus", "sonnet", "haiku", "fable", "subagent"]) {
      assert.equal(result.snapshot[key], model, `${selector}.${key}`);
    }
    assert.equal(result.snapshot.compact, context);
    assert.equal(result.snapshot.maxContext, context);
    assert.equal(result.snapshot.effort, effort);
    assert.equal(result.snapshot.hasApiKey, true);
    assert.equal(result.snapshot.hasAuthToken, false);
    assert.deepEqual(result.snapshot.anthropicAuthVariables, ["ANTHROPIC_API_KEY"]);
    assert.match(result.output, /uses subscription quota/);
    assert.match(result.output, /Extra Usage may incur additional charges when enabled/);
    assert.doesNotMatch(result.output, /CNY\/M|cache hit|cache miss|unlimited|never charged/i);
    assert.doesNotMatch(result.output, /test-kimi-code-key|opaque-kimi-code-model|prompt-/);
  }
});

test("all three Kimi Code profiles share one inline-configured secret without marking onboarding seen", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-kimi-code-shared-secret-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const secretStore = new SecretStore({ filePath: path.join(root, "secrets.json") });
  const setupStateStore = new SetupStateStore({ filePath: path.join(root, "state.json") });
  await setupStateStore.markSeen(["deepseek", "glm", "glm-api", "kimi"]);
  const prompter = fakePrompter({ secret: "test-kimi-code-key" });
  const output = outputCapture();
  output.stream.isTTY = true;

  for (const selector of ["kimi-code", "kimi-code-k3-256k", "kimi-code-k3"]) {
    const outputFile = path.join(root, `${selector}.json`);
    const code = await launchProfile(selector, [], {
      secretStore,
      setupStateStore,
      prompter,
      input: { isTTY: true },
      output: output.stream,
      errorOutput: output.stream,
      interactive: true,
      parentEnv: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: outputFile },
      cwd: root,
      executable: process.execPath,
      executableArgs: [fixture],
      stdio: "ignore"
    });
    assert.equal(code, 0, selector);
    assert.equal(JSON.parse(await readFile(outputFile, "utf8")).hasApiKey, true, selector);
  }

  assert.equal(prompter.hiddenCalls, 1);
  assert.equal(await secretStore.get("kimi-code"), "test-kimi-code-key");
  assert.deepEqual((await setupStateStore.read()).seenProviderIds, ["deepseek", "glm", "glm-api", "kimi"]);
  assert.doesNotMatch(output.text, /test-kimi-code-key/);
});

test("Kimi Code fake launch uses only temporary environment and does not create Claude config files", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-kimi-code-isolated-config-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const isolatedHome = path.join(root, "isolated-home");
  const configDir = path.join(isolatedHome, ".claude");
  await runFake(root, "kimi-code", ["--help"], "isolated.json", "test-kimi-code-key", {
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    CLAUDE_CONFIG_DIR: configDir
  });
  for (const file of [
    path.join(isolatedHome, ".claude.json"),
    path.join(isolatedHome, ".claude", "settings.json")
  ]) {
    await assert.rejects(readFile(file), { code: "ENOENT" });
  }
});

test("hostile Claude argv vectors remain exact and private", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-hostile-argv-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const sentinel = "CMR_PRIVATE_PROMPT_SENTINEL_7F31";
  const vectors = [
    ["kimi", ["--continue"], "test-kimi-key"],
    ["deepseek", ["--resume"], "test-deepseek-key"],
    ["kimi", ["--resume", "session-123"], "test-kimi-key"],
    ["deepseek", ["--fork-session", "--resume", "session-123"], "test-deepseek-key"],
    ["kimi", ["--permission-mode", "plan"], "test-kimi-key"],
    ["deepseek", ["--model", "custom-provider-model"], "test-deepseek-key"],
    ["kimi", ["-p", `含 空格、中文 and 'quotes' 的 prompt ${sentinel}`], "test-kimi-key"],
    ["deepseek", ["--future-claude-flag", "future-value"], "test-deepseek-key"],
    ["plan", ["--flag", "--value-that-starts-with-dashes"], "test-kimi-key"],
    ["build", [], "test-deepseek-key"],
    ["glm", ["--resume", "glm-session-123", "-p", `glm prompt ${sentinel}`], "test-glm-key"],
    ["glm-plan", ["--model", "provider-supported-model"], "test-glm-key"],
    ["glm-api", ["--model", "provider-supported-model"], "test-glm-api-key"],
    ["glm-payg", ["--help"], "test-glm-api-key"],
    ["kimi-code", ["--continue"], "test-kimi-code-key"],
    ["kimi-membership-k3-256k", ["--model", "k3-256k"], "test-kimi-code-key"],
    ["kimi-membership-k3", ["-p", `kimi code ${sentinel}`], "test-kimi-code-key"]
  ];
  for (const [index, [selector, claudeArgs, secret]] of vectors.entries()) {
    const result = await runFake(root, selector, claudeArgs, `vector-${index}.json`, secret);
    assert.equal(result.code, 0);
    assert.deepEqual(result.snapshot.args, claudeArgs);
    assert.deepEqual(result.inputArgs, claudeArgs);
    assert.doesNotMatch(result.output, new RegExp(sentinel));
    assert.doesNotMatch(result.output, /test-kimi-code-key/);
  }
});

test("GLM standard API launch clears both authentication modes without mutating the parent", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-api-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const outputFile = path.join(root, "glm-api.json");
  const output = outputCapture();
  const parentEnv = {
    PATH: process.env.PATH,
    FAKE_OUTPUT_FILE: outputFile,
    FAKE_CLAUDE_EXIT_CODE: "7",
    ANTHROPIC_API_KEY: "old-api",
    ANTHROPIC_AUTH_TOKEN: "old-token",
    Anthropic_Api_Key: "old-mixed-api",
    aNtHrOpIc_AuTh_ToKeN: "old-mixed-token",
    API_TIMEOUT_MS: "999",
    Claude_Code_Disable_Nonessential_Traffic: "0"
  };
  const before = { ...parentEnv };
  const claudeArgs = ["--resume", "glm-api-session-123", "--model", "provider-supported-model", "-p", "CMR_GLM_API_PRIVATE_PROMPT_SENTINEL"];
  const result = await launchProfile("glm-api", claudeArgs, {
    secret: "test-glm-api-key",
    output: output.stream,
    parentEnv,
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(result, 7);
  assert.deepEqual(parentEnv, before);
  assert.deepEqual(snapshot.args, claudeArgs);
  assert.equal(await canonicalPath(snapshot.cwd), await canonicalPath(root));
  assert.equal(snapshot.baseUrl, "https://open.bigmodel.cn/api/anthropic");
  assert.equal(snapshot.hasApiKey, true);
  assert.equal(snapshot.hasAuthToken, false);
  assert.equal(snapshot.opus, "glm-5.2[1m]");
  assert.equal(snapshot.sonnet, "glm-5.2[1m]");
  assert.equal(snapshot.haiku, "glm-4.7");
  assert.equal(snapshot.compact, "1000000");
  assert.equal(snapshot.apiTimeoutMs, "3000000");
  assert.equal(snapshot.disableNonessentialTraffic, "1");
  for (const key of ["model", "fable", "subagent", "effort", "toolSearch"]) assert.equal(snapshot[key], null, key);
  assert.doesNotMatch(output.text, /test-glm-api-key|CMR_GLM_API_PRIVATE_PROMPT_SENTINEL/);
});

test("canonical IDs and aliases have identical environments and argv", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-alias-equivalence-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const kimiArgs = ["--resume", "session-123"];
  const kimi = await runFake(root, "kimi", kimiArgs, "kimi.json", "test-kimi-key");
  const plan = await runFake(root, "plan", kimiArgs, "plan.json", "test-kimi-key");
  const deepseekArgs = ["--permission-mode", "plan"];
  const deepseek = await runFake(root, "deepseek", deepseekArgs, "deepseek.json", "test-deepseek-key");
  const build = await runFake(root, "build", deepseekArgs, "build.json", "test-deepseek-key");
  const glmArgs = ["--resume", "glm-session-123"];
  const glm = await runFake(root, "glm", glmArgs, "glm.json", "test-glm-key");
  const glm53 = await runFake(root, "glm-5.3", glmArgs, "glm-5.3.json", "test-glm-key");
  const glm52 = await runFake(root, "glm-5.2", glmArgs, "glm-5.2.json", "test-glm-key");
  const glmPlan = await runFake(root, "glm-plan", glmArgs, "glm-plan.json", "test-glm-key");
  const glmApiArgs = ["--help"];
  const glmApi = await runFake(root, "glm-api", glmApiArgs, "glm-api.json", "test-glm-api-key");
  const glmPayg = await runFake(root, "glm-payg", glmApiArgs, "glm-payg.json", "test-glm-api-key");
  for (const pair of [[kimi, plan], [deepseek, build], [glm, glm53], [glm, glm52], [glm, glmPlan], [glmApi, glmPayg]]) {
    assert.equal(pair[0].code, pair[1].code);
    assert.deepEqual(pair[0].snapshot, pair[1].snapshot);
    assert.deepEqual(pair[0].inputArgs, pair[1].inputArgs);
    assert.equal(pair[0].output, pair[1].output);
  }
});

test("missing Provider Key is configured in place and the original opaque argv reaches Claude", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-inline-setup-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const outputFile = path.join(root, "inline.json");
  const output = outputCapture();
  output.stream.isTTY = true;
  const secretStore = new SecretStore({ filePath: path.join(root, "secrets.json") });
  const claudeArgs = ["--resume", "session-123"];
  const parentEnv = {
    PATH: process.env.PATH,
    FAKE_OUTPUT_FILE: outputFile,
    FAKE_CLAUDE_EXIT_CODE: "7",
    ANTHROPIC_AUTH_TOKEN: "test-parent-token"
  };
  const result = await launchProfile("kimi", claudeArgs, {
    secretStore,
    prompter: fakePrompter({ secret: "test-kimi-key" }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    parentEnv,
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(result, 7);
  assert.deepEqual(snapshot.args, claudeArgs);
  assert.equal(await canonicalPath(snapshot.cwd), await canonicalPath(root));
  assert.equal(snapshot.model, "kimi-k3[1m]");
  assert.equal(parentEnv.ANTHROPIC_AUTH_TOKEN, "test-parent-token");
  assert.equal(await secretStore.get("kimi"), "test-kimi-key");
  assert.doesNotMatch(output.text, /test-kimi-key|session-123/);
});

test("DeepSeek missing Key setup preserves resume argv and the child exit code", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-deepseek-inline-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const outputFile = path.join(root, "deepseek-inline.json");
  const output = outputCapture();
  output.stream.isTTY = true;
  const claudeArgs = ["--resume", "deepseek-session-123"];
  const result = await launchProfile("deepseek", claudeArgs, {
    secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
    prompter: fakePrompter({ secret: "test-deepseek-key" }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    parentEnv: {
      PATH: process.env.PATH,
      FAKE_OUTPUT_FILE: outputFile,
      FAKE_CLAUDE_EXIT_CODE: "9"
    },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  assert.equal(result, 9);
  assert.deepEqual(JSON.parse(await readFile(outputFile, "utf8")).args, claudeArgs);
  assert.doesNotMatch(output.text, /deepseek-session-123|test-deepseek-key/);
});

test("GLM missing Key setup preserves opaque argv, cwd and the child exit code", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-inline-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const outputFile = path.join(root, "glm-inline.json");
  const output = outputCapture();
  output.stream.isTTY = true;
  const claudeArgs = ["--resume", "glm-session-123", "-p", "CMR_GLM_PRIVATE_PROMPT_SENTINEL"];
  const secretStore = new SecretStore({ filePath: path.join(root, "secrets.json") });
  const result = await launchProfile("glm", claudeArgs, {
    secretStore,
    prompter: fakePrompter({ secret: "test-glm-key" }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    parentEnv: {
      PATH: process.env.PATH,
      FAKE_OUTPUT_FILE: outputFile,
      FAKE_CLAUDE_EXIT_CODE: "7"
    },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(result, 7);
  assert.deepEqual(snapshot.args, claudeArgs);
  assert.equal(await canonicalPath(snapshot.cwd), await canonicalPath(root));
  assert.equal(await secretStore.get("glm"), "test-glm-key");
  assert.doesNotMatch(output.text, /test-glm-key|CMR_GLM_PRIVATE_PROMPT_SENTINEL/);
});

test("GLM standard API missing Key setup preserves opaque argv, cwd and the child exit code", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-api-inline-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const outputFile = path.join(root, "glm-api-inline.json");
  const output = outputCapture();
  output.stream.isTTY = true;
  const claudeArgs = ["--resume", "glm-api-session-123", "-p", "CMR_GLM_API_PRIVATE_PROMPT_SENTINEL"];
  const secretStore = new SecretStore({ filePath: path.join(root, "secrets.json") });
  const result = await launchProfile("glm-api", claudeArgs, {
    secretStore,
    prompter: fakePrompter({ secret: "test-glm-api-key" }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    parentEnv: {
      PATH: process.env.PATH,
      FAKE_OUTPUT_FILE: outputFile,
      FAKE_CLAUDE_EXIT_CODE: "7"
    },
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  const snapshot = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(result, 7);
  assert.deepEqual(snapshot.args, claudeArgs);
  assert.equal(await canonicalPath(snapshot.cwd), await canonicalPath(root));
  assert.equal(snapshot.hasApiKey, true);
  assert.equal(snapshot.hasAuthToken, false);
  assert.equal(await secretStore.get("glm-api"), "test-glm-api-key");
  assert.doesNotMatch(output.text, /test-glm-api-key|CMR_GLM_API_PRIVATE_PROMPT_SENTINEL/);
});

test("missing Key cancellation returns 130 and never spawns Claude", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-inline-cancel-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const output = outputCapture();
  output.stream.isTTY = true;
  const prompter = fakePrompter({ cancel: true });
  const secretStore = new SecretStore({ filePath: path.join(root, "secrets.json") });
  await secretStore.set("deepseek", "test-deepseek-existing");
  const result = await launchProfile("plan", ["-p", "CMR_PRIVATE_PROMPT_SENTINEL"], {
    secretStore,
    prompter,
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  assert.equal(result, 130);
  assert.equal(prompter.hiddenCalls, 1);
  assert.equal(await secretStore.get("deepseek"), "test-deepseek-existing");
  await assert.rejects(() => readFile(path.join(root, "inline.json")));
  assert.doesNotMatch(output.text, /CMR_PRIVATE_PROMPT_SENTINEL/);
});

test("GLM missing Key cancellation returns 130 and never spawns Claude", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-cancel-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const output = outputCapture();
  output.stream.isTTY = true;
  const result = await launchProfile("glm", ["-p", "CMR_GLM_PRIVATE_PROMPT_SENTINEL"], {
    secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
    prompter: fakePrompter({ cancel: true }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  assert.equal(result, 130);
  await assert.rejects(() => readFile(path.join(root, "inline.json")));
  assert.doesNotMatch(output.text, /CMR_GLM_PRIVATE_PROMPT_SENTINEL/);
});

test("GLM standard API missing Key cancellation returns 130 and never spawns Claude", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-api-cancel-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const output = outputCapture();
  output.stream.isTTY = true;
  const result = await launchProfile("glm-api", ["-p", "CMR_GLM_API_PRIVATE_PROMPT_SENTINEL"], {
    secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
    prompter: fakePrompter({ cancel: true }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true,
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  assert.equal(result, 130);
  await assert.rejects(() => readFile(path.join(root, "inline.json")));
  assert.doesNotMatch(output.text, /CMR_GLM_API_PRIVATE_PROMPT_SENTINEL/);
});

test("missing Key in a non-TTY returns a fast stable error without reading input", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-inline-nontty-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const output = outputCapture();
  await assert.rejects(
    () => launchProfile("deepseek", [], {
      secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
      input: { isTTY: false },
      output: output.stream,
      interactive: false
    }),
    /missing DeepSeek secret; run cmr secret set deepseek/
  );
});

test("GLM missing Key in a non-TTY returns a fast stable error without reading input", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-nontty-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(
    () => launchProfile("glm", [], {
      secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
      input: { isTTY: false },
      output: outputCapture().stream,
      interactive: false
    }),
    /missing GLM Coding Plan secret; run cmr secret set glm/
  );
});

test("GLM standard API missing Key in a non-TTY returns a fast stable error without reading input", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-glm-api-nontty-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(
    () => launchProfile("glm-api", [], {
      secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
      input: { isTTY: false },
      output: outputCapture().stream,
      interactive: false
    }),
    /missing GLM Standard API \(Pay-as-you-go\) secret; run cmr secret set glm-api/
  );
});

test("Kimi Code missing Key in a non-TTY returns a fast stable error without reading input", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-kimi-code-nontty-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(
    () => launchProfile("kimi-code", [], {
      secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
      input: { isTTY: false },
      output: outputCapture().stream,
      interactive: false
    }),
    /missing Kimi Code Membership secret; run cmr secret set kimi-code/
  );
});

test("TTY input with non-TTY output does not downgrade to visible or hidden input", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-inline-mismatch-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const output = outputCapture();
  const prompter = fakePrompter();
  await assert.rejects(
    () => launchProfile("kimi", [], {
      secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
      prompter,
      input: { isTTY: true },
      output: output.stream
    }),
    /missing Kimi secret; run cmr secret set kimi/
  );
  assert.equal(prompter.hiddenCalls, 0);
});

test("interactive setup refuses an input TTY without setRawMode", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-inline-rawmode-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const output = outputCapture();
  output.stream.isTTY = true;
  const result = await launchProfile("kimi", [], {
    secretStore: new SecretStore({ filePath: path.join(root, "secrets.json") }),
    input: { isTTY: true },
    output: output.stream,
    errorOutput: output.stream,
    interactive: true
  });
  assert.equal(result, 1);
  assert.match(output.text, /could not configure Kimi API Key/);
});

test("compatibility aliases configure the correct Provider in place", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-launch-inline-alias-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  for (const [selector, provider, secret] of [
    ["plan", "kimi", "test-kimi-key"],
    ["build", "deepseek", "test-deepseek-key"],
    ["glm-5.2", "glm", "test-glm-key"],
    ["glm-plan", "glm", "test-glm-key"],
    ["kimi-membership", "kimi-code", "test-kimi-code-key"],
    ["kimi-membership-k3-256k", "kimi-code", "test-kimi-code-key"],
    ["kimi-membership-k3", "kimi-code", "test-kimi-code-key"]
  ]) {
    const output = outputCapture();
    output.stream.isTTY = true;
    const store = new SecretStore({ filePath: path.join(root, `${provider}.json`) });
    const result = await launchProfile(selector, [], {
      secretStore: store,
      prompter: fakePrompter({ secret }),
      input: { isTTY: true },
      output: output.stream,
      errorOutput: output.stream,
      interactive: true,
      cwd: root,
      executable: process.execPath,
      executableArgs: [fixture],
      stdio: "ignore"
    });
    assert.equal(result, 0);
    assert.equal(await store.get(provider), secret);
  }
});
