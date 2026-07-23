import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { launchProfile } from "../src/commands/launch.js";
import { SecretStore } from "../src/secret-store.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-claude.js", import.meta.url));

function outputCapture() {
  let text = "";
  return { stream: { isTTY: false, write: (chunk) => { text += chunk; } }, get text() { return text; } };
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

async function runFake(root, selector, claudeArgs, file, secret) {
  const outputFile = path.join(root, file);
  const output = outputCapture();
  const inputArgs = claudeArgs.slice();
  const code = await launchProfile(selector, inputArgs, {
    secret,
    output: output.stream,
    parentEnv: { PATH: process.env.PATH, FAKE_OUTPUT_FILE: outputFile },
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
    ["build", [], "test-deepseek-key"]
  ];
  for (const [index, [selector, claudeArgs, secret]] of vectors.entries()) {
    const result = await runFake(root, selector, claudeArgs, `vector-${index}.json`, secret);
    assert.equal(result.code, 0);
    assert.deepEqual(result.snapshot.args, claudeArgs);
    assert.deepEqual(result.inputArgs, claudeArgs);
    assert.doesNotMatch(result.output, new RegExp(sentinel));
  }
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
  for (const pair of [[kimi, plan], [deepseek, build]]) {
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
  assert.equal(snapshot.cwd, await realpath(root));
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
  for (const [selector, provider, secret] of [["plan", "kimi", "test-kimi-key"], ["build", "deepseek", "test-deepseek-key"]]) {
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
