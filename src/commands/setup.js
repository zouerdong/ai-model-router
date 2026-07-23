import { createInterface } from "node:readline/promises";
import { stderr, stdin, stdout } from "node:process";
import { loadConfigSet } from "../config/loader.js";
import { findClaudeExecutable } from "../platform.js";
import { readHiddenSecret, SecretStore } from "../secret-store.js";
import { isSetupStateCorrupt, SetupStateStore } from "../setup-state.js";

const INSTALL_URL = "https://code.claude.com/docs/en/installation";

function isInteractive(options, input, output) {
  return options.interactive ?? Boolean(input.isTTY && output.isTTY);
}

function cancelledError(message = "setup cancelled") {
  const error = new Error(message);
  error.code = "CMR_CANCELLED";
  return error;
}

function isCancelled(error) {
  return error?.code === "CMR_CANCELLED" || error?.code === "CMR_INPUT_ERROR" && error.message === "secret input ended before submission";
}

function result({ exitCode, status, providers, statuses, changedProviders = [], displayedProviderIds = [], markedSeen = false }) {
  const configuredProviders = providers.filter((provider) => statuses.get(provider.id) === true).map((provider) => provider.id);
  const missingProviders = providers.filter((provider) => statuses.get(provider.id) !== true).map((provider) => provider.id);
  return {
    exitCode,
    status,
    configuredProviders,
    changedProviders: [...new Set(changedProviders)],
    missingProviders,
    displayedProviderIds,
    markedSeen
  };
}

async function readStatuses(providers, secretStore) {
  const statuses = new Map();
  for (const provider of providers) statuses.set(provider.id, Boolean(await secretStore.get(provider.secretId)));
  return statuses;
}

function writeError(errorOutput, message) {
  errorOutput.write(`ERROR ${message}\n`);
}

function createProductionPrompter({ input = stdin, output = stderr } = {}) {
  async function ask(message) {
    const readline = createInterface({ input, output });
    try {
      return await readline.question(message);
    } finally {
      readline.close();
    }
  }

  return {
    async choose({ message, choices }) {
      while (true) {
        output.write(`${message}\n`);
        choices.forEach((choice, index) => output.write(`${index + 1}) ${choice.label}\n`));
        let answer;
        try {
          answer = await ask(`Select [1-${choices.length}]: `);
        } catch {
          throw cancelledError();
        }
        const index = Number.parseInt(answer.trim(), 10) - 1;
        if (Number.isInteger(index) && choices[index]) return choices[index].id;
        output.write(`Invalid selection. Choose 1-${choices.length}.\n`);
      }
    },
    async confirm({ message, defaultValue = false }) {
      let answer;
      try {
        answer = await ask(`${message} [${defaultValue ? "Y/n" : "y/N"}] `);
      } catch {
        throw cancelledError();
      }
      const normalized = answer.trim().toLowerCase();
      if (normalized === "") return defaultValue;
      if (["y", "yes"].includes(normalized)) return true;
      if (["n", "no"].includes(normalized)) return false;
      output.write("Please answer yes or no.\n");
      return this.confirm({ message, defaultValue });
    },
    hidden({ label }) {
      return readHiddenSecret({ input, output, label });
    }
  };
}

function getSecretStore(options, providers) {
  return options.secretStore ?? new SecretStore({
    ...options,
    providerIds: providers.map((provider) => provider.secretId)
  });
}

function getStateStore(options) {
  return options.setupStateStore ?? new SetupStateStore(options);
}

function providerStatusText(provider, statuses) {
  return `${provider.id}: ${statuses.get(provider.id) ? "configured" : "missing"}`;
}

function printStatus(output, providers, statuses, { heading = "Current API Key status" } = {}) {
  output.write(`${heading}\n`);
  for (const provider of providers) output.write(`${providerStatusText(provider, statuses)}\n`);
}

async function printSummary({ output, providers, secretStore, platform, env, changedProviders, claudeExecutable, fsAccess }) {
  const statuses = await readStatuses(providers, secretStore);
  output.write("\nSetup summary\n");
  for (const provider of providers) output.write(`${providerStatusText(provider, statuses)}\n`);
  const discovered = claudeExecutable === undefined
    ? await findClaudeExecutable({ platform, env, fsAccess })
    : claudeExecutable;
  output.write(`Claude Code: ${discovered ? "found" : "not found"}\n`);
  output.write("configured means stored locally; Provider access is checked when Claude Code connects.\n");
  if (discovered && [...statuses.values()].some(Boolean)) {
    const configuredIds = providers.filter((provider) => statuses.get(provider.id)).map((provider) => provider.id);
    output.write(`Next: run ${configuredIds.map((id) => `cmr ${id}`).join(" or ")} from your project directory.\n`);
  } else if (!discovered) {
    output.write(`WARN  Claude Code was not found on PATH.\nInstall it from: ${INSTALL_URL}\nYour configured API Keys were kept.\n`);
  } else if ([...statuses.values()].every((configured) => !configured)) {
    output.write("Next: run cmr setup when you are ready to configure an API Key.\n");
  }
  return { statuses, changedProviders };
}

async function configureProvider(provider, { statuses, prompter, secretStore, output, required = false }) {
  const configured = statuses.get(provider.id) === true;
  if (configured && !required) {
    const replace = await prompter.confirm({
      message: `Replace the existing ${provider.displayName} API Key?`,
      defaultValue: false
    });
    if (!replace) return { changed: false };
  } else if (configured) {
    return { changed: false };
  }
  output.write(`Get your ${provider.displayName} API Key:\n${provider.apiKeyUrl}\n`);
  const secret = await prompter.hidden({
    message: `${provider.displayName} API Key`,
    label: `${provider.displayName} API Key`
  });
  await secretStore.set(provider.secretId, secret);
  output.write(`${provider.id}: configured\n`);
  return { changed: true };
}

function validateSetupArgs(args) {
  if (!Array.isArray(args) || args.length > 1) throw new Error("usage: cmr setup [provider]");
  if (args.length === 1 && (typeof args[0] !== "string" || args[0].startsWith("-"))) {
    throw new Error("usage: cmr setup [provider]");
  }
}

export async function ensureProviderSecret(provider, options = {}) {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const errorOutput = options.errorOutput ?? stderr;
  const interactive = isInteractive(options, input, output);
  const secretStore = options.secretStore ?? new SecretStore(options);
  const current = await secretStore.get(provider.secretId);
  if (current) return { exitCode: 0, status: "unchanged", configured: true, changed: false };
  if (!interactive) throw new Error(`missing ${provider.displayName} secret; run cmr secret set ${provider.secretId}`);
  const prompter = options.prompter ?? createProductionPrompter({ input, output: options.promptOutput ?? errorOutput });
  try {
    const statuses = new Map([[provider.id, false]]);
    const configured = await configureProvider(provider, {
      statuses,
      prompter,
      secretStore,
      output,
      required: true
    });
    const stored = Boolean(await secretStore.get(provider.secretId));
    return {
      exitCode: stored ? 0 : 1,
      status: stored ? "configured" : "failed",
      configured: stored,
      changed: configured.changed
    };
  } catch (error) {
    if (isCancelled(error)) return { exitCode: 130, status: "cancelled", configured: false, changed: false };
    writeError(errorOutput, `could not configure ${provider.displayName} API Key`);
    return { exitCode: 1, status: "failed", configured: false, changed: false };
  }
}

export async function runSetup(args = [], options = {}) {
  validateSetupArgs(args);
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const errorOutput = options.errorOutput ?? stderr;
  const interactive = isInteractive(options, input, output);
  const emptyResult = { providers: [], statuses: new Map() };
  if (!interactive) {
    writeError(errorOutput, "setup requires an interactive terminal; run cmr setup in a TTY");
    return result({ exitCode: 1, status: "failed", ...emptyResult });
  }

  let config;
  let providers = [];
  let secretStore;
  let changedProviders = [];
  let displayedProviderIds = [];
  let stateStore;
  let stateCorrupt = false;
  let statuses = new Map();
  try {
    config = options.config ?? await loadConfigSet(options);
    providers = config.providers;
    const currentProviderIds = providers.map((provider) => provider.id);
    secretStore = getSecretStore(options, providers);
    const prompter = options.prompter ?? createProductionPrompter({ input, output: options.promptOutput ?? errorOutput });
    const targetId = args[0];
    if (targetId !== undefined) {
      const provider = providers.find((item) => item.id === targetId);
      if (!provider) {
        const error = new Error("usage: cmr setup [provider]");
        error.code = "CMR_USAGE";
        throw error;
      }
      displayedProviderIds = [provider.id];
      statuses = await readStatuses([provider], secretStore);
      const configured = await configureProvider(provider, { statuses, prompter, secretStore, output });
      if (configured.changed) changedProviders.push(provider.id);
      statuses = await readStatuses([provider], secretStore);
      await printSummary({
        output,
        providers: [provider],
        secretStore,
        platform: options.platform ?? process.platform,
        env: options.env ?? options.parentEnv ?? process.env,
        changedProviders,
        claudeExecutable: options.claudeExecutable,
        fsAccess: options.fsAccess
      });
      return result({
        exitCode: 0,
        status: configured.changed ? "configured" : "unchanged",
        providers: [provider],
        statuses,
        changedProviders,
        displayedProviderIds
      });
    }

    stateStore = getStateStore(options);
    try {
      await stateStore.read();
    } catch (error) {
      if (!isSetupStateCorrupt(error)) throw error;
      stateCorrupt = true;
      errorOutput.write("WARN  Setup State was invalid; it will be rebuilt only after you finish setup.\n");
    }

    displayedProviderIds = [...currentProviderIds];
    statuses = await readStatuses(providers, secretStore);
    output.write("Claude Model Router setup\n");
    output.write("API Keys stay in the local CMR secret store and are never shown in output.\n\n");
    printStatus(output, providers, statuses);

    let finished = false;
    while (!finished) {
      const choices = [];
      if (providers.some((provider) => !statuses.get(provider.id))) {
        choices.push({ id: "configure-all-missing", label: "Configure all missing providers (recommended)" });
      }
      for (const provider of providers) {
        choices.push({ id: `provider:${provider.id}`, label: `Set or replace ${provider.displayName} API Key` });
      }
      choices.push({
        id: "continue",
        label: providers.some((provider) => !statuses.get(provider.id))
          ? "Not now"
          : "Keep current API Keys and continue"
      });
      choices.push({ id: "exit", label: "Exit" });
      const action = await prompter.choose({ message: "Setup actions", choices });
      if (action === "continue" || action === "exit") {
        finished = true;
        continue;
      }
      if (action === "configure-all-missing") {
        for (const provider of providers) {
          if (statuses.get(provider.id)) continue;
          try {
            const configured = await configureProvider(provider, { statuses, prompter, secretStore, output });
            if (configured.changed) changedProviders.push(provider.id);
            statuses = await readStatuses(providers, secretStore);
          } catch (error) {
            throw error;
          }
        }
        finished = true;
        continue;
      }
      if (action.startsWith("provider:")) {
        const provider = providers.find((item) => `provider:${item.id}` === action);
        if (!provider) throw new Error("setup selection was invalid");
        const configured = await configureProvider(provider, { statuses, prompter, secretStore, output });
        if (configured.changed) changedProviders.push(provider.id);
        statuses = await readStatuses(providers, secretStore);
        printStatus(output, providers, statuses, { heading: "Updated API Key status" });
        continue;
      }
      throw new Error("setup selection was invalid");
    }

    await stateStore.markSeen(currentProviderIds, { rebuildCorrupt: stateCorrupt });
    const summary = await printSummary({
      output,
      providers,
      secretStore,
      platform: options.platform ?? process.platform,
      env: options.env ?? options.parentEnv ?? process.env,
      changedProviders,
      claudeExecutable: options.claudeExecutable,
      fsAccess: options.fsAccess
    });
    return result({
      exitCode: 0,
      status: changedProviders.length > 0 ? "configured" : "unchanged",
      providers,
      statuses: summary.statuses,
      changedProviders,
      displayedProviderIds,
      markedSeen: true
    });
  } catch (error) {
    if (error?.code === "CMR_USAGE") throw error;
    if (isCancelled(error)) {
      return result({
        exitCode: 130,
        status: "cancelled",
        providers,
        statuses,
        changedProviders,
        displayedProviderIds
      });
    }
    writeError(errorOutput, "setup could not be completed");
    return result({
      exitCode: 1,
      status: "failed",
      providers,
      statuses,
      changedProviders,
      displayedProviderIds
    });
  }
}

export { createProductionPrompter, INSTALL_URL };
