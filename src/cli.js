#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { stdin, stdout, stderr } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDefaultConfigRoot, getConfigPath, loadConfigSet } from "./config/loader.js";
import { runDoctor } from "./commands/doctor.js";
import { formatList } from "./commands/list.js";
import { launchProfile } from "./commands/launch.js";
import { createProductionPrompter, runSetup } from "./commands/setup.js";
import { redactError } from "./redact.js";
import { readHiddenSecret, SecretStore } from "./secret-store.js";
import { getSecretStorePath, getSetupStatePath } from "./platform.js";
import { SetupStateStore, isSetupStateCorrupt } from "./setup-state.js";

export const VERSION = "1.2.1";

export function isMainModule(
  entryPath = process.argv[1],
  modulePath = fileURLToPath(import.meta.url),
  resolveRealPath = realpathSync
) {
  if (!entryPath) return false;
  const canonicalPath = (value) => {
    try {
      return resolveRealPath(value);
    } catch {
      return path.resolve(value);
    }
  };
  return canonicalPath(entryPath) === canonicalPath(modulePath);
}

function printUsage(output = stdout) {
  output.write(`Claude Model Router ${VERSION}\n\n`);
  output.write("Usage:\n");
  output.write("  cmr                                Show the profile menu\n");
  output.write("  cmr kimi [claude args...]          Start Claude Code with Kimi K3\n");
  output.write("  cmr deepseek [claude args...]      Start Claude Code with DeepSeek Auto\n");
  output.write("  cmr plan [claude args...]          Alias for kimi\n");
  output.write("  cmr build [claude args...]         Alias for deepseek\n");
  output.write("  cmr setup                          Configure or replace Provider API Keys\n");
  output.write("  cmr setup <provider>               Configure or replace one Provider API Key\n");
  output.write("  cmr list             Show profiles and model mappings\n");
  output.write("  cmr doctor           Run a read-only local diagnostic\n");
  output.write("  cmr config path      Show repository and secret-store paths\n");
  output.write("  cmr secret set <provider>\n");
  output.write("  cmr secret status    Show configured/missing status only\n");
  output.write("  cmr version          Show the version\n");
  output.write("\nThe first interactive cmr run shows all Provider API Key status; new unseen Providers do the same.\n");
  output.write("Keys are entered only through hidden TTY input, never as command arguments.\n");
  output.write("Claude Code arguments after the profile are passed through unchanged.\n");
}

async function getProviderStatuses(providers, secretStore) {
  const statuses = new Map();
  for (const provider of providers) statuses.set(provider.id, Boolean(await secretStore.get(provider.secretId)));
  return statuses;
}

async function interactiveMenu({
  config,
  input = stdin,
  output = stdout,
  errorOutput = stderr,
  interactive = true,
  ...options
} = {}) {
  const currentConfig = config ?? options.config ?? await loadConfigSet(options);
  const secretStore = options.secretStore ?? new SecretStore({
    ...options,
    providerIds: currentConfig.providers.map((provider) => provider.secretId)
  });
  const setupStateStore = options.setupStateStore ?? new SetupStateStore(options);
  const prompter = options.menuPrompter ?? options.prompter ?? createProductionPrompter({ input, output });
  while (true) {
    const statuses = await getProviderStatuses(currentConfig.providers, secretStore);
    const choices = [];
    output.write("Claude Model Router\n");
    for (const profile of currentConfig.profiles) {
      const provider = currentConfig.providers.find((item) => item.id === profile.provider);
      const configured = statuses.get(provider.id) ? "configured" : "missing";
      const id = `profile:${profile.id}`;
      choices.push({ id, label: `${profile.id} — ${profile.displayName} [${configured}]` });
    }
    choices.push({ id: "setup", label: "setup — Configure or replace API Keys" });
    choices.push({ id: "doctor", label: "doctor" });
    choices.push({ id: "exit", label: "exit" });
    const action = await prompter.choose({ message: "Select an action", choices });
    if (action === "exit") return 0;
    if (action === "doctor") {
      const doctorResult = await runDoctor({ ...options, input, output, interactive });
      output.write(`${doctorResult.text}\n`);
      return doctorResult.lines.some((item) => item.startsWith("FAIL")) ? 1 : 0;
    }
    if (action === "setup") {
      const setupResult = await runSetup([], {
        ...options,
        config: currentConfig,
        input,
        output,
        errorOutput,
        interactive,
        secretStore,
        setupStateStore,
        prompter
      });
      if (setupResult.exitCode !== 0) return setupResult.exitCode;
      continue;
    }
    if (action?.startsWith("profile:")) {
      const profile = currentConfig.profiles.find((item) => `profile:${item.id}` === action);
      if (!profile) {
        errorOutput.write("ERROR invalid menu selection\n");
        continue;
      }
      return launchProfile(profile.id, [], {
        ...options,
        config: currentConfig,
        input,
        output,
        errorOutput,
        interactive,
        secretStore,
        setupStateStore
      });
    }
    errorOutput.write("ERROR invalid menu selection\n");
  }
}

async function commandSecret(args, options) {
  const [action, provider, ...extra] = args;
  const store = options.secretStore ?? new SecretStore(options);
  if (action === "status" && provider === undefined && extra.length === 0) {
    const status = await store.status();
    const output = options.output ?? stdout;
    for (const [id, configured] of Object.entries(status)) output.write(`${id}: ${configured ? "configured" : "missing"}\n`);
    return 0;
  }
  if (action === "set" && ["kimi", "deepseek"].includes(provider) && extra.length === 0) {
    const secret = await readHiddenSecret({ input: options.input ?? stdin, output: options.output ?? stderr, label: "Secret" });
    await store.set(provider, secret);
    (options.output ?? stdout).write(`${provider}: configured\n`);
    return 0;
  }
  throw new Error("usage: cmr secret set <kimi|deepseek> or cmr secret status");
}

async function commandConfig(args, options) {
  if (args.length !== 1 || args[0] !== "path") throw new Error("usage: cmr config path");
  const config = options.config ?? await loadConfigSet(options);
  const output = options.output ?? stdout;
  output.write(`config: ${getDefaultConfigRoot()}\n`);
  output.write(`secret store: ${getSecretStorePath(options)}\n`);
  output.write(`setup state: ${getSetupStatePath(options)}\n`);
  output.write(`profiles: ${config.profiles.map((profile) => profile.id).join(", ")}\n`);
  return 0;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const errorOutput = options.errorOutput ?? stderr;
  const interactive = options.interactive ?? Boolean(input.isTTY && output.isTTY);
  const sharedOptions = { ...options, input, output, errorOutput, interactive };
  let command = argv[0];
  let args = argv.slice(1);
  if (!command) {
    if (!interactive) {
      printUsage(output);
      return 0;
    }
    const config = sharedOptions.config ?? await loadConfigSet(sharedOptions);
    const secretStore = sharedOptions.secretStore ?? new SecretStore({
      ...sharedOptions,
      providerIds: config.providers.map((provider) => provider.secretId)
    });
    const setupStateStore = sharedOptions.setupStateStore ?? new SetupStateStore(sharedOptions);
    let shouldShowOnboarding = false;
    try {
      const state = await setupStateStore.read();
      const currentProviderIds = config.providers.map((provider) => provider.id);
      shouldShowOnboarding = !state.exists || currentProviderIds.some((id) => !state.seenProviderIds.includes(id));
    } catch (error) {
      if (!isSetupStateCorrupt(error)) throw new Error("cannot read setup state");
      shouldShowOnboarding = true;
    }
    if (shouldShowOnboarding) {
      const setupResult = await runSetup([], {
        ...sharedOptions,
        config,
        secretStore,
        setupStateStore
      });
      if (setupResult.exitCode !== 0) return setupResult.exitCode;
    }
    return interactiveMenu({
      ...sharedOptions,
      config,
      secretStore,
      setupStateStore
    });
  }
  if (!command) return 0;
  if (command === "version") {
    if (args.length > 0) throw new Error("usage: cmr version");
    output.write(`${VERSION}\n`);
    return 0;
  }
  if (command === "help" || command === "--help") {
    if (args.length > 0) throw new Error("usage: cmr help");
    printUsage(output);
    return 0;
  }
  if (command === "list") {
    if (args.length > 0) throw new Error("usage: cmr list");
    output.write(`${await formatList(sharedOptions)}\n`);
    return 0;
  }
  if (command === "doctor") {
    if (args.length > 0) throw new Error("usage: cmr doctor");
    const result = await runDoctor(sharedOptions);
    output.write(`${result.text}\n`);
    return result.lines.some((item) => item.startsWith("FAIL")) ? 1 : 0;
  }
  if (command === "config") return commandConfig(args, sharedOptions);
  if (command === "secret") return commandSecret(args, sharedOptions);
  if (command === "setup") return (await runSetup(args, sharedOptions)).exitCode;
  return launchProfile(command, args, sharedOptions);
}

if (isMainModule()) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch(async (error) => {
    let secrets = [];
    try {
      secrets = await new SecretStore().readSecretsForRedaction();
    } catch {
      // Do not replace the original error with a secret-store diagnostic.
    }
    stderr.write(`ERROR ${redactError(error, secrets)}\n`);
    process.exitCode = 1;
  });
}
