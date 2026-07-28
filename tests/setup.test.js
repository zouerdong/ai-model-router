import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfigSet } from "../src/config/loader.js";
import { runSetup } from "../src/commands/setup.js";
import { readHiddenSecret, SecretStore } from "../src/secret-store.js";
import { SetupStateStore } from "../src/setup-state.js";

function capture(isTTY = false) {
  let value = "";
  return { stream: { isTTY, write: (chunk) => { value += chunk; } }, get value() { return value; } };
}

function fakePrompter({ choices = [], confirms = [], hidden = [] } = {}) {
  const calls = { choices: [], confirms: 0, hidden: 0 };
  return {
    calls,
    choose: async (prompt) => {
      calls.choices.push(prompt);
      const value = choices.shift();
      if (value instanceof Error) throw value;
      return value;
    },
    confirm: async () => {
      calls.confirms += 1;
      return confirms.length > 0 ? confirms.shift() : false;
    },
    hidden: async () => {
      calls.hidden += 1;
      const value = hidden.shift();
      if (value instanceof Error) throw value;
      return value;
    }
  };
}

function cancelError() {
  const error = new Error("cancelled");
  error.code = "CMR_CANCELLED";
  return error;
}

async function fixture(t, { configured = [], providerIds } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "cmr-setup-test-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  const config = await loadConfigSet();
  const providers = providerIds ?? config.providers.map((provider) => provider.secretId);
  const secretStore = new SecretStore({ filePath: path.join(directory, "secrets.json"), providerIds: providers });
  for (const [provider, secret] of configured) await secretStore.set(provider, secret);
  const setupStateStore = new SetupStateStore({ filePath: path.join(directory, "state.json") });
  return { directory, config, secretStore, setupStateStore };
}

function optionsFor(fixtureValue, prompter) {
  const output = capture(true);
  const errorOutput = capture(true);
  return {
    config: fixtureValue.config,
    secretStore: fixtureValue.secretStore,
    setupStateStore: fixtureValue.setupStateStore,
    interactive: true,
    input: { isTTY: true },
    output: output.stream,
    errorOutput: errorOutput.stream,
    prompter,
    claudeExecutable: null,
    outputCapture: output,
    errorCapture: errorOutput
  };
}

test("full dashboard shows all providers and configures every missing key", async (t) => {
  const value = await fixture(t);
  const prompter = fakePrompter({ choices: ["configure-all-missing"], hidden: ["test-kimi-key", "test-deepseek-key", "test-glm-key", "test-glm-api-key"] });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "configured");
  assert.deepEqual(result.configuredProviders, ["kimi", "deepseek", "glm", "glm-api"]);
  assert.deepEqual(result.changedProviders, ["kimi", "deepseek", "glm", "glm-api"]);
  assert.deepEqual(result.displayedProviderIds, ["kimi", "deepseek", "glm", "glm-api"]);
  assert.equal(result.markedSeen, true);
  assert.deepEqual((await value.setupStateStore.read()).seenProviderIds, ["deepseek", "glm", "glm-api", "kimi"]);
  assert.match(options.outputCapture.value, /kimi: missing/);
  assert.match(options.outputCapture.value, /deepseek: missing/);
  assert.match(options.outputCapture.value, /glm: missing/);
  assert.match(options.outputCapture.value, /glm-api: missing/);
  assert.doesNotMatch(`${options.outputCapture.value}${options.errorCapture.value}`, /test-kimi-key|test-deepseek-key|test-glm-key|test-glm-api-key/);
});

test("first dashboard still appears with one or all keys already configured", async (t) => {
  for (const configured of [
    [["kimi", "test-kimi-key"]],
    [["kimi", "test-kimi-key"], ["deepseek", "test-deepseek-key"], ["glm", "test-glm-key"], ["glm-api", "test-glm-api-key"]]
  ]) {
    const value = await fixture(t, { configured });
    const prompter = fakePrompter({ choices: ["continue"] });
    const options = optionsFor(value, prompter);
    const result = await runSetup([], options);
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "unchanged");
    assert.equal(result.markedSeen, true);
    assert.match(options.outputCapture.value, /Current API Key status/);
    assert.match(options.outputCapture.value, /kimi: configured/);
    assert.match(options.outputCapture.value, /deepseek: (?:missing|configured)/);
    assert.match(options.outputCapture.value, /glm: (?:missing|configured)/);
    assert.match(options.outputCapture.value, /glm-api: (?:missing|configured)/);
    assert.equal(prompter.calls.hidden, 0);
  }
});

test("Not now marks seen without creating an empty Secret Store", async (t) => {
  const value = await fixture(t);
  const prompter = fakePrompter({ choices: ["continue"] });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "unchanged");
  assert.equal(result.markedSeen, true);
  await assert.rejects(() => readFile(path.join(value.directory, "secrets.json")), { code: "ENOENT" });
  assert.deepEqual((await value.setupStateStore.read()).seenProviderIds, ["deepseek", "glm", "glm-api", "kimi"]);
});

test("configure all missing only writes what is missing and preserves the existing key", async (t) => {
  const value = await fixture(t, { configured: [["kimi", "test-kimi-old"]] });
  const prompter = fakePrompter({ choices: ["configure-all-missing"], hidden: ["test-deepseek-key", "test-glm-key", "test-glm-api-key"] });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], options);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.changedProviders, ["deepseek", "glm", "glm-api"]);
  assert.equal(await value.secretStore.get("kimi"), "test-kimi-old");
  assert.equal(await value.secretStore.get("deepseek"), "test-deepseek-key");
  assert.equal(await value.secretStore.get("glm"), "test-glm-key");
  assert.equal(await value.secretStore.get("glm-api"), "test-glm-api-key");
  assert.deepEqual(prompter.calls.hidden, 3);
});

test("full dashboard can configure only one selected Provider and leave the others missing", async (t) => {
  for (const provider of ["kimi", "deepseek", "glm", "glm-api"]) {
    const value = await fixture(t);
    const prompter = fakePrompter({
      choices: [`provider:${provider}`, "continue"],
      hidden: [`test-${provider}-only`]
    });
    const result = await runSetup([], optionsFor(value, prompter));
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.changedProviders, [provider]);
    assert.equal(await value.secretStore.get(provider), `test-${provider}-only`);
    for (const other of ["kimi", "deepseek", "glm", "glm-api"].filter((id) => id !== provider)) {
      assert.equal(await value.secretStore.get(other), null);
    }
  }
});

test("targeted replacement defaults to keeping the old key and does not read hidden input", async (t) => {
  const value = await fixture(t, { configured: [["kimi", "test-kimi-old"]] });
  const prompter = fakePrompter({ confirms: [false], hidden: ["test-kimi-new"] });
  const options = optionsFor(value, prompter);
  const result = await runSetup(["kimi"], options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "unchanged");
  assert.equal(result.markedSeen, false);
  assert.equal(await value.secretStore.get("kimi"), "test-kimi-old");
  assert.equal(prompter.calls.hidden, 0);
  assert.deepEqual(result.displayedProviderIds, ["kimi"]);
});

test("targeted GLM API replacement defaults to keeping its isolated key", async (t) => {
  const value = await fixture(t, { configured: [["glm-api", "test-glm-api-old"]] });
  const prompter = fakePrompter({ confirms: [false], hidden: ["test-glm-api-new"] });
  const result = await runSetup(["glm-api"], optionsFor(value, prompter));
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, "unchanged");
  assert.equal(await value.secretStore.get("glm-api"), "test-glm-api-old");
  assert.equal(await value.secretStore.get("glm"), null);
  assert.equal(prompter.calls.hidden, 0);
});

test("targeted replacement writes only after explicit confirmation and preserves the old key on validation failure", async (t) => {
  const value = await fixture(t, { configured: [["kimi", "test-kimi-old"]] });
  const prompter = fakePrompter({ confirms: [true], hidden: [" "] });
  const options = optionsFor(value, prompter);
  const result = await runSetup(["kimi"], options);
  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "failed");
  assert.equal(await value.secretStore.get("kimi"), "test-kimi-old");
  assert.doesNotMatch(`${options.outputCapture.value}${options.errorCapture.value}`, /test-kimi-old|test-kimi-new/);
});

test("targeted replacement supports every formal Provider after explicit confirmation", async (t) => {
  for (const provider of ["kimi", "deepseek", "glm", "glm-api"]) {
    const value = await fixture(t, { configured: [[provider, `test-${provider}-old`]] });
    const prompter = fakePrompter({ confirms: [true], hidden: [`test-${provider}-new`] });
    const result = await runSetup([provider], optionsFor(value, prompter));
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.changedProviders, [provider]);
    assert.equal(await value.secretStore.get(provider), `test-${provider}-new`);
  }
});

test("targeted GLM API setup leaves the existing three-provider onboarding state unchanged", async (t) => {
  const value = await fixture(t);
  await value.setupStateStore.markSeen(["deepseek", "glm", "kimi"]);
  const result = await runSetup(["glm-api"], optionsFor(value, fakePrompter({ hidden: ["test-glm-api-key"] })));
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.displayedProviderIds, ["glm-api"]);
  assert.equal(result.markedSeen, false);
  assert.equal(await value.secretStore.get("glm-api"), "test-glm-api-key");
  assert.deepEqual((await value.setupStateStore.read()).seenProviderIds, ["deepseek", "glm", "kimi"]);
});

test("targeted replacement preserves the old key for every hostile value class", async (t) => {
  const hostileValues = ["", " padded ", "line1\nline2", "value\0with-null", "x".repeat(16_385)];
  for (const [index, hostileValue] of hostileValues.entries()) {
    const value = await fixture(t, { configured: [["deepseek", "test-deepseek-old"]] });
    const prompter = fakePrompter({ confirms: [true], hidden: [hostileValue] });
    const result = await runSetup(["deepseek"], optionsFor(value, prompter));
    assert.equal(result.exitCode, 1, index);
    assert.equal(await value.secretStore.get("deepseek"), "test-deepseek-old", index);
  }
});

test("targeted replacement rejects a multiline TTY paste and preserves the old key", async (t) => {
  const value = await fixture(t, { configured: [["kimi", "test-kimi-old"]] });
  const input = new EventEmitter();
  const rawModes = [];
  input.isTTY = true;
  input.setEncoding = () => {};
  input.setRawMode = (enabled) => rawModes.push(enabled);
  input.resume = () => {};
  input.pause = () => {};
  const prompter = {
    choose: async () => "continue",
    confirm: async () => true,
    hidden: async () => {
      const pending = readHiddenSecret({ input, output: { write: () => {} } });
      queueMicrotask(() => input.emit("data", "test-kimi-new\nsecond-line"));
      return pending;
    }
  };
  const options = optionsFor(value, prompter);
  const result = await runSetup(["kimi"], options);
  assert.equal(result.exitCode, 1);
  assert.equal(await value.secretStore.get("kimi"), "test-kimi-old");
  assert.deepEqual(rawModes, [true, false]);
});

test("second provider cancellation keeps the first successful write and leaves state unseen", async (t) => {
  const value = await fixture(t);
  const prompter = fakePrompter({ choices: ["configure-all-missing"], hidden: ["test-kimi-key", cancelError()] });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], options);
  assert.equal(result.exitCode, 130);
  assert.equal(result.status, "cancelled");
  assert.deepEqual(result.changedProviders, ["kimi"]);
  assert.equal(await value.secretStore.get("kimi"), "test-kimi-key");
  assert.equal(await value.secretStore.get("deepseek"), null);
  assert.equal((await value.setupStateStore.read()).exists, false);
});

test("corrupt Secret Store fails closed and corrupt Setup State rebuilds only after explicit completion", async (t) => {
  const value = await fixture(t);
  await writeFile(path.join(value.directory, "secrets.json"), "not-json");
  const secretOutput = capture(true);
  const secretErrors = capture(true);
  const secretResult = await runSetup([], {
    ...optionsFor(value, fakePrompter({ choices: ["continue"] })),
    output: secretOutput.stream,
    errorOutput: secretErrors.stream
  });
  assert.equal(secretResult.exitCode, 1);
  assert.equal(await readFile(path.join(value.directory, "secrets.json"), "utf8"), "not-json");
  await writeFile(path.join(value.directory, "secrets.json"), JSON.stringify({ version: 1, providers: {} }));
  const statePath = path.join(value.directory, "state.json");
  await writeFile(statePath, "corrupt-state");
  const prompter = fakePrompter({ choices: ["continue"] });
  const options = optionsFor(value, prompter);
  const stateResult = await runSetup([], options);
  assert.equal(stateResult.exitCode, 0);
  assert.equal(stateResult.markedSeen, true);
  assert.match(options.errorCapture.value, /Setup State was invalid/);
  assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), { version: 1, seenProviderIds: ["deepseek", "glm", "glm-api", "kimi"] });
});

test("corrupt Setup State remains byte-for-byte unchanged when onboarding is cancelled", async (t) => {
  const value = await fixture(t);
  const statePath = path.join(value.directory, "state.json");
  const corrupt = "corrupt-state-cancelled";
  await writeFile(statePath, corrupt);
  const prompter = fakePrompter({ choices: [cancelError()] });
  const result = await runSetup([], optionsFor(value, prompter));
  assert.equal(result.exitCode, 130);
  assert.equal(result.markedSeen, false);
  assert.equal(await readFile(statePath, "utf8"), corrupt);
});

test("Setup State permission errors stop before Secret Store status is read", async (t) => {
  const value = await fixture(t);
  let secretReads = 0;
  const secretStore = {
    async get() {
      secretReads += 1;
      return null;
    }
  };
  const setupStateStore = {
    async read() {
      const error = new Error("permission denied");
      error.code = "CMR_SETUP_STATE_READ";
      throw error;
    }
  };
  const options = optionsFor(value, fakePrompter({ choices: ["continue"] }));
  const result = await runSetup([], { ...options, secretStore, setupStateStore });
  assert.equal(result.exitCode, 1);
  assert.equal(result.markedSeen, false);
  assert.equal(secretReads, 0);
});

test("dynamic fifth Provider is displayed and marked seen without a CLI-specific branch", async (t) => {
  const value = await fixture(t, { providerIds: ["kimi", "deepseek", "glm", "glm-api", "third-provider"] });
  value.config.providers.push({
    id: "third-provider",
    displayName: "Third Provider",
    apiKeyUrl: "https://third.example.com/api-keys",
    baseUrl: "https://third.example.com/anthropic",
    authVariable: "ANTHROPIC_AUTH_TOKEN",
    secretId: "third-provider",
    verifiedOn: "2026-07-19",
    sourceUrl: "https://third.example.com/docs"
  });
  const prompter = fakePrompter({ choices: ["continue"] });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], options);
  assert.deepEqual(result.displayedProviderIds, ["kimi", "deepseek", "glm", "glm-api", "third-provider"]);
  assert.deepEqual(result.configuredProviders, []);
  assert.deepEqual((await value.setupStateStore.read()).seenProviderIds, ["deepseek", "glm", "glm-api", "kimi", "third-provider"]);
  assert.match(options.outputCapture.value, /third-provider: missing/);
});

test("State chmod or rename failure does not report onboarding completion", async (t) => {
  const value = await fixture(t);
  for (const failure of ["chmod", "rename"]) {
    const statePath = path.join(value.directory, `${failure}-state.json`);
    const failingState = new SetupStateStore({
      filePath: statePath,
      fs: {
        mkdir: (target, options) => import("node:fs/promises").then((fs) => fs.mkdir(target, options)),
        readFile: (target, encoding) => import("node:fs/promises").then((fs) => fs.readFile(target, encoding)),
        writeFile: (target, content, options) => import("node:fs/promises").then((fs) => fs.writeFile(target, content, options)),
        chmod: failure === "chmod"
          ? async () => { const error = new Error("permission denied"); error.code = "EACCES"; throw error; }
          : chmod,
        rename: failure === "rename"
          ? async () => { const error = new Error("rename failed"); error.code = "EIO"; throw error; }
          : rename,
        unlink
      }
    });
    const prompter = fakePrompter({ choices: ["continue"] });
    const options = optionsFor(value, prompter);
    const result = await runSetup([], { ...options, setupStateStore: failingState });
    assert.equal(result.exitCode, 1, failure);
    assert.equal(result.markedSeen, false, failure);
    assert.equal((await new SetupStateStore({ filePath: statePath }).read()).exists, false, failure);
  }
});

test("a provider write failure does not leak a secret from the thrown cause", async (t) => {
  const value = await fixture(t);
  const sentinel = "test-deepseek-key-error-sentinel";
  const fakeStore = {
    values: new Map(),
    async get(provider) { return this.values.get(provider) ?? null; },
    async set(provider, secret) {
      if (provider === "deepseek") throw new Error(`write failed ${sentinel}`);
      this.values.set(provider, secret);
    }
  };
  const prompter = fakePrompter({ choices: ["configure-all-missing"], hidden: ["test-kimi-key", sentinel] });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], { ...options, secretStore: fakeStore });
  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "failed");
  assert.doesNotMatch(`${options.outputCapture.value}${options.errorCapture.value}`, new RegExp(sentinel));
  assert.equal(fakeStore.values.get("kimi"), "test-kimi-key");
});

test("a GLM write failure preserves existing Provider keys and redacts the cause", async (t) => {
  const value = await fixture(t);
  const sentinel = "test-glm-key-error-sentinel";
  const fakeStore = {
    values: new Map(),
    async get(provider) { return this.values.get(provider) ?? null; },
    async set(provider, secret) {
      if (provider === "glm") throw new Error(`write failed ${sentinel}`);
      this.values.set(provider, secret);
    }
  };
  const prompter = fakePrompter({
    choices: ["configure-all-missing"],
    hidden: ["test-kimi-key", "test-deepseek-key", sentinel]
  });
  const options = optionsFor(value, prompter);
  const result = await runSetup([], { ...options, secretStore: fakeStore });
  assert.equal(result.exitCode, 1);
  assert.equal(fakeStore.values.get("kimi"), "test-kimi-key");
  assert.equal(fakeStore.values.get("deepseek"), "test-deepseek-key");
  assert.equal(fakeStore.values.has("glm"), false);
  assert.doesNotMatch(`${options.outputCapture.value}${options.errorCapture.value}`, new RegExp(sentinel));
});

test("after a second-provider failure, rerun starts from the remaining missing provider", async (t) => {
  const value = await fixture(t);
  const fakeStore = {
    values: new Map(),
    failDeepseek: true,
    async get(provider) { return this.values.get(provider) ?? null; },
    async set(provider, secret) {
      if (provider === "deepseek" && this.failDeepseek) throw new Error("temporary write failure");
      this.values.set(provider, secret);
    }
  };
  const firstPrompter = fakePrompter({ choices: ["configure-all-missing"], hidden: ["test-kimi-key", "test-deepseek-key"] });
  const firstOptions = optionsFor(value, firstPrompter);
  const first = await runSetup([], { ...firstOptions, secretStore: fakeStore });
  assert.equal(first.exitCode, 1);
  fakeStore.failDeepseek = false;
  const secondPrompter = fakePrompter({ choices: ["configure-all-missing"], hidden: ["test-deepseek-key", "test-glm-key", "test-glm-api-key"] });
  const secondOptions = optionsFor(value, secondPrompter);
  const second = await runSetup([], { ...secondOptions, secretStore: fakeStore });
  assert.equal(second.exitCode, 0);
  assert.deepEqual(second.changedProviders, ["deepseek", "glm", "glm-api"]);
  assert.equal(secondPrompter.calls.hidden, 3);
  assert.deepEqual((await value.setupStateStore.read()).seenProviderIds, ["deepseek", "glm", "glm-api", "kimi"]);
});

test("non-TTY setup fails without prompting or writing state", async (t) => {
  const value = await fixture(t);
  const output = capture(false);
  const errorOutput = capture(false);
  const prompter = fakePrompter({ choices: ["continue"] });
  const result = await runSetup([], {
    ...value,
    interactive: false,
    output: output.stream,
    errorOutput: errorOutput.stream,
    prompter
  });
  assert.equal(result.exitCode, 1);
  assert.match(errorOutput.value, /requires an interactive terminal/);
  assert.equal(prompter.calls.choices.length, 0);
  assert.equal((await value.setupStateStore.read()).exists, false);
});
