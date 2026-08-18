import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { launchProfile } from "../src/commands/launch.js";
import { loadConfigSet } from "../src/config/loader.js";
import { buildChildEnvironment, ROUTER_MANAGED_ENV_VARS } from "../src/environment.js";
import { runClaude } from "../src/launcher.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-claude.js", import.meta.url));

function outputCapture() {
  let text = "";
  return {
    stream: { isTTY: false, write: (chunk) => { text += chunk; } },
    get text() { return text; }
  };
}

function fakeProcess() {
  return new EventEmitter();
}

function fakeChild({ exitCode = 0, signal = null, onKill, autoExit = true } = {}) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (receivedSignal) => {
    onKill?.(receivedSignal);
    child.signalCode = receivedSignal;
    child.emit("exit", signal ? null : exitCode, signal);
    return true;
  };
  if (autoExit) queueMicrotask(() => child.emit("exit", exitCode, null));
  return child;
}

function hostileParentEnv(outputFile, root) {
  const parent = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    APPDATA: process.env.APPDATA,
    FAKE_OUTPUT_FILE: outputFile,
    CMR_NON_ROUTER_SENTINEL: `keep-${root}`,
    aNtHrOpIc_BaSe_Url: "https://stale.example/base",
    Anthropic_Api_Key: "stale-api-key-sentinel",
    aNtHrOpIc_AuTh_ToKeN: "stale-auth-token-sentinel",
    aNtHrOpIc_MoDeL: "stale-model-sentinel",
    cLaUdE_CoDe_MaX_CoNtExT_ToKeNs: "stale-context-sentinel",
    cLaUdE_CoDe_EfFoRt_LeVeL: "stale-effort-sentinel",
    aPi_TiMeOuT_mS: "stale-timeout-sentinel",
    cLaUdE_CoDe_DisAbLe_NoNeSsEnTiAl_TrAfFiC: "stale-traffic-sentinel"
  };
  for (const key of ROUTER_MANAGED_ENV_VARS) {
    if (!Object.keys(parent).some((existing) => existing.toLowerCase() === key.toLowerCase())) {
      parent[key.toLowerCase()] = `stale-${key.toLowerCase()}-sentinel`;
    }
  }
  return parent;
}

async function runSafeFake(root, selector, secret, args, name, extraParentEnv = {}) {
  const outputFile = path.join(root, `${name}.json`);
  const output = outputCapture();
  const parentEnv = {
    ...hostileParentEnv(outputFile, root),
    FAKE_SAFE_SNAPSHOT: "1",
    ...extraParentEnv
  };
  const code = await launchProfile(selector, args, {
    secret,
    output: output.stream,
    errorOutput: output.stream,
    parentEnv,
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    stdio: "ignore"
  });
  return { code, output: output.text, snapshot: JSON.parse(await readFile(outputFile, "utf8")) };
}

test("all seven profiles isolate auth, models and managed variables sequentially and concurrently", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-task5-seven-profiles-中文 space-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const cases = [
    ["kimi", "test-kimi-key", "kimi-k3[1m]", "ANTHROPIC_AUTH_TOKEN", false],
    ["deepseek", "test-deepseek-key", "deepseek-v4-pro[1m]", "ANTHROPIC_AUTH_TOKEN", false],
    ["glm", "test-glm-key", null, "ANTHROPIC_AUTH_TOKEN", false],
    ["glm-api", "test-glm-api-key", null, "ANTHROPIC_API_KEY", false],
    ["kimi-code", "test-kimi-code-key", "kimi-for-coding", "ANTHROPIC_API_KEY", true],
    ["kimi-code-k3-256k", "test-kimi-code-k3-256k-key", "k3-256k", "ANTHROPIC_API_KEY", true],
    ["kimi-code-k3", "test-kimi-code-k3-key", "k3[1m]", "ANTHROPIC_API_KEY", true]
  ];
  const config = await loadConfigSet();

  const verify = (result, [selector, , model, authVariable, hasMaxContext]) => {
    const profile = config.profiles.find((item) => item.id === selector);
    assert.equal(result.code, 0, selector);
    assert.equal(result.snapshot.model, model, `${selector} model`);
    assert.deepEqual(result.snapshot.anthropicAuthVariables, [authVariable], `${selector} auth`);
    assert.equal(result.snapshot.hasApiKey, authVariable === "ANTHROPIC_API_KEY", `${selector} api key`);
    assert.equal(result.snapshot.hasAuthToken, authVariable === "ANTHROPIC_AUTH_TOKEN", `${selector} auth token`);
    assert.equal(result.snapshot.maxContext !== null, hasMaxContext, `${selector} max context`);
    assert.deepEqual(
      result.snapshot.routerEnvironmentKeys,
      ["ANTHROPIC_BASE_URL", authVariable, ...Object.keys(profile.environment)].sort(),
      `${selector} managed environment`
    );
    assert.deepEqual(
      result.snapshot.routerEnvironmentKeys.filter((key) => key.toLowerCase().includes("auth_token")),
      authVariable === "ANTHROPIC_AUTH_TOKEN" ? ["ANTHROPIC_AUTH_TOKEN"] : [],
      `${selector} auth residue`
    );
    assert.doesNotMatch(result.output, /test-.*-key|stale-.*-sentinel|CMR_TASK5/);
  };

  const sequential = [];
  for (const [index, item] of cases.entries()) {
    const args = ["--continue", "--model", `opaque-${item[0]}-model`, "-p", `CMR_TASK5_PROMPT_${index}`];
    const result = await runSafeFake(root, item[0], item[1], args, `sequential-${index}`);
    verify(result, item);
    sequential.push(result.snapshot);
  }

  const concurrent = await Promise.all(cases.map(([selector, secret, , ,], index) => runSafeFake(
    root,
    selector,
    secret,
    ["--resume", `session-${index}`, "--effort", "high", "-p", `CMR_TASK5_CONCURRENT_${index}`],
    `concurrent-${index}`
  )));
  concurrent.forEach((result, index) => verify(result, cases[index]));
  assert.equal(new Set(sequential.map((snapshot) => snapshot.baseUrl)).size, 4, "all provider endpoints represented");
});

test("safe fake Claude snapshot proves opaque argv and path sentinels are not persisted", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "CMR_TASK5_PATH_SENTINEL_中文 space-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const secret = "CMR_TASK5_FAKE_KEY_SENTINEL";
  const args = [
    "--continue",
    "--resume",
    "session with spaces 中文",
    "--fork-session",
    "--model",
    "k3-256k",
    "--effort",
    "high",
    "-p",
    "CMR_TASK5_PROMPT_SENTINEL"
  ];
  const result = await runSafeFake(root, "kimi-code", secret, args, "safe-snapshot");
  const rawSnapshot = JSON.stringify(result.snapshot);
  assert.equal(result.code, 0);
  assert.equal(result.snapshot.args, undefined);
  assert.equal(result.snapshot.cwd, undefined);
  assert.doesNotMatch(rawSnapshot, /CMR_TASK5|session with spaces|k3-256k/);
  assert.doesNotMatch(result.output, /CMR_TASK5|session with spaces|k3-256k/);
  assert.match(rawSnapshot, /argsSha256/);
  assert.match(rawSnapshot, /cwdSha256/);
});

test("full opaque argv reaches Claude unchanged without appearing in CMR output", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "cmr-task5-opaque-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const processLike = fakeProcess();
  let spawnCall;
  const spawnImpl = (command, spawnArgs, options) => {
    spawnCall = { command, args: spawnArgs, options };
    return fakeChild({ exitCode: 17 });
  };
  const args = [
    "--continue",
    "--resume",
    "session-123",
    "--fork-session",
    "--model",
    "provider-model-that-may-not-exist",
    "--effort",
    "max",
    "-p",
    "CMR_TASK5_PRIVATE_PROMPT_SENTINEL",
    "--future-opaque-flag",
    "value with spaces 中文",
    "--value-starts-with-dash",
    "-literal"
  ];
  const output = outputCapture();
  const code = await launchProfile("kimi-code", args, {
    secret: "CMR_TASK5_PRIVATE_KEY_SENTINEL",
    output: output.stream,
    errorOutput: output.stream,
    parentEnv: hostileParentEnv(path.join(root, "unused.json"), root),
    cwd: root,
    executable: process.execPath,
    executableArgs: [fixture],
    spawnImpl,
    processLike
  });
  assert.equal(code, 17);
  assert.deepEqual(spawnCall.args, [fixture, ...args]);
  assert.equal(spawnCall.options.shell, false);
  assert.equal(spawnCall.options.cwd, root);
  assert.equal(spawnCall.options.stdio, "inherit");
  assert.doesNotMatch(output.text, /CMR_TASK5|provider-model|session-123|value with spaces/);
});

test("Unix and Windows cmd/bat startup simulations preserve argv and shell boundaries", async () => {
  const args = ["--model", "k3-256k", "-p", "CMR_TASK5_PATH_AND_ARG_SENTINEL 中文 & |"];
  for (const [platform, executable, env, expectedCommand, expectedPrefix] of [
    ["darwin", "/opt/Claude 中文 Path/claude", { PATH: "/opt/Claude 中文 Path" }, executable => executable, []],
    ["win32", "C:\\Program Files\\Claude 中文\\claude.cmd", { ComSpec: "C:\\Windows\\System32\\cmd.exe" }, "C:\\Windows\\System32\\cmd.exe", ["/d", "/c"]],
    ["win32", "C:\\Program Files\\Claude 中文\\claude.bat", { COMSPEC: "C:\\Windows\\System32\\cmd.exe" }, "C:\\Windows\\System32\\cmd.exe", ["/d", "/c"]]
  ]) {
    const processLike = fakeProcess();
    let spawnCall;
    const result = await runClaude({
      executable,
      executableArgs: ["--internal-flag"],
      claudeArgs: args,
      platform,
      env,
      cwd: platform === "win32" ? "C:\\Work Dir\\项目" : "/tmp/Work Dir/项目",
      spawnImpl: (command, spawnArgs, options) => {
        spawnCall = { command, args: spawnArgs, options };
        return fakeChild();
      },
      processLike,
      stdio: "ignore"
    });
    assert.equal(result, 0);
    assert.equal(spawnCall.command, typeof expectedCommand === "function" ? expectedCommand(executable) : expectedCommand);
    const commandArgs = platform === "win32" ? [executable] : [];
    assert.deepEqual(spawnCall.args, [...expectedPrefix, ...commandArgs, "--internal-flag", ...args]);
    assert.equal(spawnCall.options.shell, false);
    assert.equal(spawnCall.options.cwd, platform === "win32" ? "C:\\Work Dir\\项目" : "/tmp/Work Dir/项目");
  }
});

test("Ctrl+C and SIGTERM simulations preserve the documented exit codes", async () => {
  for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const processLike = fakeProcess();
    const signals = [];
    const promise = runClaude({
      executable: "/opt/Claude 中文 Path/claude",
      platform: "darwin",
      env: { PATH: "/opt/Claude 中文 Path" },
      spawnImpl: (command, args, options) => fakeChild({
        signal,
        autoExit: false,
        onKill: (receivedSignal) => signals.push(receivedSignal)
      }),
      processLike,
      stdio: "ignore"
    });
    processLike.emit(signal);
    assert.equal(await promise, expectedCode);
    assert.deepEqual(signals, [signal]);
  }
});

test("seven formal profiles keep the same parent environment after direct construction", async () => {
  const config = await loadConfigSet();
  const parentEnv = hostileParentEnv("/tmp/not-written.json", "/tmp/CMR_TASK5_PARENT_PATH");
  const before = { ...parentEnv };
  for (const profile of config.profiles) {
    const provider = config.providers.find((item) => item.id === profile.provider);
    const env = buildChildEnvironment({ provider, profile, secret: `test-${profile.id}-key`, parentEnv });
    assert.deepEqual(parentEnv, before, `${profile.id} parent env`);
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "anthropic_auth_token") {
        assert.equal(provider.authVariable, "ANTHROPIC_AUTH_TOKEN", `${profile.id} auth token`);
      }
      if (key.toLowerCase() === "anthropic_api_key") {
        assert.equal(provider.authVariable, "ANTHROPIC_API_KEY", `${profile.id} api key`);
      }
    }
  }
});
