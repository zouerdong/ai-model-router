import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import * as defaultFsSync from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { stderr, stdout } from "node:process";
import { ROUTER_MANAGED_ENV_VARS } from "../environment.js";
import { createCommandRunner, removeRouterEnvironmentVariables, runCommand } from "../command-runner.js";
import { findNpmExecutable, getApplicationDataDir } from "../platform.js";
import { acquireUpdateLock, UpdateLockError } from "../update-lock.js";
import {
  CMR_PACKAGE_NAME,
  DEFAULT_PACK_METADATA_MAX_BYTES,
  LATEST_RELEASE_ASSET_URL,
  LATEST_RELEASE_SUMS_URL,
  inspectCurrentInstallation,
  parseNpmPackMetadata,
  planUpdate
} from "../updater.js";

export const UPDATE_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
export const UPDATE_COMMAND_MAX_OUTPUT_BYTES = 64 * 1024;
export const UPDATE_VERIFY_TIMEOUT_MS = 30 * 1000;
export const RELEASE_SUMS_MAX_BYTES = 64 * 1024;

export class UpdateError extends Error {
  constructor(category, message, exitCode = 1) {
    super(message);
    this.name = "UpdateError";
    this.category = category;
    this.exitCode = exitCode;
  }
}

export function parseUpdateArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError("update arguments must be an array");
  if (args.length === 0) return { checkOnly: false };
  if (args.length === 1 && args[0] === "--check") return { checkOnly: true };
  throw new Error("usage: cmr update or cmr update --check");
}

function throwUpdate(category, message, exitCode = 1) {
  throw new UpdateError(category, message, exitCode);
}

function formatFailure(error) {
  if (error instanceof UpdateError) return `${error.category}: ${error.message}`;
  return "update failed: unexpected local error";
}

async function createTempWorkspace({ fsApi, tempParent = os.tmpdir() }) {
  let directory;
  try {
    directory = await fsApi.mkdtemp(path.join(tempParent, "cmr-update-"));
    const cache = path.join(directory, "npm-cache");
    await fsApi.mkdir(cache, { recursive: true, mode: 0o700 });
    return { directory, cache };
  } catch (error) {
    if (directory) {
      try {
        await fsApi.rm(directory, { recursive: true, force: true });
      } catch {
        // The original workspace creation error remains the primary failure.
      }
    }
    throw error;
  }
}

function commandEnvironment(options) {
  const environment = removeRouterEnvironmentVariables(options.env ?? process.env, ROUTER_MANAGED_ENV_VARS);
  // NODE_OPTIONS would inject code into every npm/node child of the update chain.
  delete environment.NODE_OPTIONS;
  return environment;
}

function parseReleaseSumsEntry(text, filename) {
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.match(/^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/);
    if (match && match[2] === filename) return match[1].toLowerCase();
  }
  return null;
}

export async function verifyReleaseIntegrity({ tarballPath, options = {} }) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(LATEST_RELEASE_SUMS_URL);
  } catch {
    throwUpdate("integrity check unavailable", "published SHA256SUMS could not be fetched");
  }
  if (!response || typeof response.ok !== "boolean" || !response.ok) {
    throwUpdate("integrity check unavailable", "published SHA256SUMS could not be fetched");
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throwUpdate("integrity check unavailable", "published SHA256SUMS could not be read");
  }
  if (typeof text !== "string" || text.length === 0 || text.length > (options.maxSumsBytes ?? RELEASE_SUMS_MAX_BYTES)) {
    throwUpdate("integrity check unavailable", "published SHA256SUMS is invalid");
  }
  // SHA256SUMS entries name the release asset (a basename), while npm metadata may carry a path.
  const expected = parseReleaseSumsEntry(text, path.basename(tarballPath));
  if (!expected) throwUpdate("integrity check unavailable", "published SHA256SUMS has no entry for the release asset");
  const fsApi = options.fsSync ?? defaultFsSync;
  let bytes;
  try {
    bytes = fsApi.readFileSync(tarballPath);
  } catch {
    throwUpdate("integrity check unavailable", "downloaded release asset could not be read for verification");
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throwUpdate("integrity verification failed", "downloaded release asset does not match the published SHA256SUMS; rerun cmr update");
  }
  return actual;
}

function getRunner(options, env) {
  return options.runner ?? createCommandRunner({
    platform: options.platform ?? process.platform,
    spawnImpl: options.spawnImpl,
    processLike: options.processLike,
    env
  });
}

async function runPack({
  npmExecutable,
  packageSpec,
  workspace,
  options,
  env,
  failureCategory = "latest asset unavailable",
  metadataCategory = "malformed pack metadata"
}) {
  const args = [
    "pack",
    packageSpec,
    "--json",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    workspace.cache,
    "--pack-destination",
    workspace.directory
  ];
  let result;
  try {
    result = await getRunner(options, env).run({
      executable: npmExecutable,
      args,
      cwd: workspace.directory,
      env,
      platform: options.platform ?? process.platform,
      maxOutputBytes: options.maxCommandOutputBytes ?? UPDATE_COMMAND_MAX_OUTPUT_BYTES,
      timeoutMs: options.commandTimeoutMs ?? UPDATE_COMMAND_TIMEOUT_MS
    });
  } catch {
    throwUpdate(failureCategory, "npm pack could not be completed");
  }
  if (result.exitCode === 130) throwUpdate("interrupted", "update was interrupted", 130);
  if (result.exitCode !== 0) throwUpdate(failureCategory, `npm pack failed (exit code ${result.exitCode})`);
  try {
    return parseNpmPackMetadata(result.stdout, {
      expectedName: CMR_PACKAGE_NAME,
      expectedDirectory: workspace.directory,
      maxBytes: options.maxPackMetadataBytes ?? DEFAULT_PACK_METADATA_MAX_BYTES,
      maxTarballBytes: options.maxTarballBytes,
      maxUnpackedBytes: options.maxUnpackedBytes,
      fs: options.fsSync ?? defaultFsSync
    });
  } catch {
    throwUpdate(metadataCategory, "npm pack returned invalid package metadata");
  }
}

async function runInstall({ npmExecutable, packagePath, inspection, workspace, options, env }) {
  const args = [
    "install",
    "--global",
    "--prefix",
    inspection.prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    workspace.cache,
    packagePath
  ];
  const result = await getRunner(options, env).run({
    executable: npmExecutable,
    args,
    cwd: workspace.directory,
    env,
    platform: options.platform ?? process.platform,
    maxOutputBytes: options.maxCommandOutputBytes ?? UPDATE_COMMAND_MAX_OUTPUT_BYTES,
    timeoutMs: options.commandTimeoutMs ?? UPDATE_COMMAND_TIMEOUT_MS
  });
  return result ?? { exitCode: 1, signal: null, stdout: "", stderr: "" };
}

function readInstalledPackage(inspection, fsSync, pathApi = path) {
  try {
    const packagePath = pathApi.join(inspection.packageRoot, "package.json");
    const value = JSON.parse(fsSync.readFileSync(packagePath, "utf8"));
    if (value?.name !== CMR_PACKAGE_NAME || typeof value.version !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

async function verifyInstalledVersion({ inspection, expectedVersion, workspace, options, env }) {
  const fsSync = options.fsSync ?? defaultFsSync;
  const pathApi = options.pathApi ?? (options.platform === "win32" ? path.win32 : path);
  const packageInfo = readInstalledPackage(inspection, fsSync, pathApi);
  if (!packageInfo || packageInfo.version !== expectedVersion) return { ok: false, reason: "package metadata does not match" };
  let rootStat;
  try {
    rootStat = fsSync.lstatSync(inspection.packageRoot);
  } catch {
    return { ok: false, reason: "package root is missing" };
  }
  if (!rootStat?.isDirectory?.() || rootStat.isSymbolicLink?.()) return { ok: false, reason: "package root is not an entity directory" };
  const expectedModulePath = pathApi.join(inspection.packageRoot, "src", "cli.js");
  const currentMapping = inspectCurrentInstallation({
    entryPath: inspection.commandPath,
    modulePath: expectedModulePath,
    platform: options.platform ?? process.platform,
    fs: fsSync,
    pathApi
  });
  if (currentMapping.kind !== "global-package"
    || currentMapping.prefix !== inspection.prefix
    || currentMapping.packageRoot !== inspection.packageRoot
    || currentMapping.commandPath !== inspection.commandPath
    || currentMapping.currentVersion !== expectedVersion) {
    return { ok: false, reason: "absolute CMR command no longer maps to the target package" };
  }

  const runner = options.verifyRunner ?? options.runner;
  let result;
  try {
    result = runner
      ? await runner.run({
        executable: inspection.commandPath,
        args: ["version"],
        cwd: workspace.directory,
        env,
        platform: options.platform ?? process.platform,
        maxOutputBytes: options.maxVerifyOutputBytes ?? 4096,
        timeoutMs: options.verifyTimeoutMs ?? UPDATE_VERIFY_TIMEOUT_MS
      })
      : await runCommand({
        executable: inspection.commandPath,
        args: ["version"],
        cwd: workspace.directory,
        env,
        platform: options.platform ?? process.platform,
        spawnImpl: options.spawnImpl,
        processLike: options.processLike,
        maxOutputBytes: options.maxVerifyOutputBytes ?? 4096,
        timeoutMs: options.verifyTimeoutMs ?? UPDATE_VERIFY_TIMEOUT_MS
      });
  } catch {
    return { ok: false, reason: "absolute CMR command could not be run" };
  }
  if (!result || result.exitCode !== 0 || String(result.stdout ?? "").trim() !== expectedVersion) {
    return { ok: false, reason: "absolute CMR command version did not match" };
  }
  return { ok: true };
}

function quotePosix(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function recoveryCommand({ npmExecutable, inspection, rollbackPath, platform }) {
  const quote = platform === "win32" ? quotePowerShell : quotePosix;
  const cachePath = path.join(path.dirname(rollbackPath), "npm-cache");
  const command = [
    quote(npmExecutable),
    "install",
    "--global",
    "--prefix",
    quote(inspection.prefix),
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    quote(cachePath),
    quote(rollbackPath)
  ].join(" ");
  return platform === "win32" ? `& ${command}` : command;
}

async function preserveRollbackPackage({ rollbackPath, inspection, options }) {
  const recoveryDirectory = options.recoveryDirectory
    ?? path.join(getApplicationDataDir({
      platform: options.platform ?? process.platform,
      env: options.env ?? process.env,
      homedir: options.homedir
    }), "recovery");
  const recoveryPath = options.recoveryPath
    ?? path.join(recoveryDirectory, "claude-model-router-" + inspection.currentVersion + "-rollback-" + Date.now() + ".tgz");
  await mkdir(path.dirname(recoveryPath), { recursive: true, mode: 0o700 });
  await copyFile(rollbackPath, recoveryPath);
  if ((options.platform ?? process.platform) !== "win32") await chmod(recoveryPath, 0o600);
  return recoveryPath;
}

async function rollback({ npmExecutable, rollbackPath, inspection, workspace, options, env, originalExitCode }) {
  let installResult;
  try {
    installResult = await runInstall({ npmExecutable, packagePath: rollbackPath, inspection, workspace, options, env });
  } catch {
    installResult = { exitCode: 1 };
  }
  const verified = await verifyInstalledVersion({ inspection, expectedVersion: inspection.currentVersion, workspace, options, env });
  if (installResult.exitCode === 0 && verified.ok) {
    return {
      status: "failed-rolled-back",
      currentVersion: inspection.currentVersion,
      exitCode: originalExitCode === 130 ? 130 : 1
    };
  }
  let recoveryPath = rollbackPath;
  let recoveryPreserved = false;
  try {
    recoveryPath = await preserveRollbackPackage({ rollbackPath, inspection, options });
    recoveryPreserved = true;
  } catch {
    // Keep the original path as a last-resort diagnostic if preservation fails.
  }
  return {
    status: "failed-rollback",
    currentVersion: inspection.currentVersion,
    exitCode: originalExitCode === 130 ? 130 : 1,
    recoveryCommand: recoveryCommand({
      npmExecutable,
      inspection,
      rollbackPath: recoveryPath,
      platform: options.platform ?? process.platform
    }),
    recoveryPreserved
  };
}

async function transactionalUpdate({ inspection, npmExecutable, options, workspace, env }) {
  const rollbackPackage = await runPack({
    npmExecutable,
    packageSpec: inspection.packageRoot,
    workspace,
    options,
    env,
    failureCategory: "current package backup failed",
    metadataCategory: "current package backup invalid"
  });
  if (rollbackPackage.name !== CMR_PACKAGE_NAME || rollbackPackage.version !== inspection.currentVersion) {
    throwUpdate("current package backup invalid", "current package backup did not match the installed CMR");
  }

  const candidate = await packLatestRelease({ npmExecutable, workspace, options, env });
  const plan = planUpdate(inspection.currentVersion, candidate.version);
  if (plan === "same") return { status: "already-current", currentVersion: inspection.currentVersion, candidateVersion: candidate.version, exitCode: 0 };
  if (plan === "candidate-older") throwUpdate("invalid version direction", "latest stable release is older than the current CMR");

  const beforeInstall = await inspect(options);
  if (beforeInstall.kind !== "global-package"
    || beforeInstall.prefix !== inspection.prefix
    || beforeInstall.packageRoot !== inspection.packageRoot
    || beforeInstall.commandPath !== inspection.commandPath
    || beforeInstall.currentVersion !== inspection.currentVersion) {
    throwUpdate("current installation changed during update", "the active CMR installation changed before install");
  }

  // The published SHA256SUMS is the only integrity control beyond TLS; verify the downloaded
  // asset before any byte of it is installed or executed.
  await verifyReleaseIntegrity({ tarballPath: candidate.tarballPath, options });

  const output = options.output ?? stdout;
  output.write(`Updating CMR ${inspection.currentVersion} -> ${candidate.version} from the official GitHub Release...\n`);
  let installResult;
  try {
    installResult = await runInstall({ npmExecutable, packagePath: candidate.tarballPath, inspection, workspace, options, env });
  } catch {
    installResult = { exitCode: 1 };
  }
  const childExitCode = installResult.exitCode === 130 ? 130 : 1;
  if (installResult.exitCode !== 0) {
    const oldIsUsable = await verifyInstalledVersion({ inspection, expectedVersion: inspection.currentVersion, workspace, options, env });
    if (oldIsUsable.ok) return { status: "failed-old-intact", currentVersion: inspection.currentVersion, candidateVersion: candidate.version, exitCode: childExitCode };
    return rollback({
      npmExecutable,
      rollbackPath: rollbackPackage.tarballPath,
      inspection,
      workspace,
      options,
      env,
      originalExitCode: childExitCode
    });
  }

  const newIsUsable = await verifyInstalledVersion({ inspection, expectedVersion: candidate.version, workspace, options, env });
  if (newIsUsable.ok) return { status: "updated", currentVersion: inspection.currentVersion, candidateVersion: candidate.version, exitCode: 0 };
  return rollback({
    npmExecutable,
    rollbackPath: rollbackPackage.tarballPath,
    inspection,
    workspace,
    options,
    env,
    originalExitCode: 1
  });
}

export async function packLatestRelease({ npmExecutable, workspace, options = {}, env } = {}) {
  if (!npmExecutable) throwUpdate("npm executable not found", "npm executable was not found on PATH");
  return runPack({
    npmExecutable,
    packageSpec: LATEST_RELEASE_ASSET_URL,
    workspace,
    options,
    env: env ?? commandEnvironment(options)
  });
}

async function inspect(options) {
  const inspection = inspectCurrentInstallation({
    entryPath: options.entryPath,
    modulePath: options.modulePath,
    platform: options.platform ?? process.platform,
    fs: options.fsSync ?? defaultFsSync,
    pathApi: options.pathApi
  });
  if (inspection.kind === "unsupported") throwUpdate("unsupported installation type", inspection.reason);
  if (options.currentVersion && options.currentVersion !== inspection.currentVersion) {
    throwUpdate("current installation changed during update", "package and CLI versions do not match");
  }
  return inspection;
}

async function checkLatest({ inspection, options }) {
  const fsApi = options.fs ?? { mkdtemp, mkdir, rm };
  let workspace;
  try {
    workspace = await createTempWorkspace({ fsApi, tempParent: options.tempParent });
    const npmExecutable = options.npmExecutable ?? await findNpmExecutable({
      platform: options.platform ?? process.platform,
      env: options.env ?? process.env,
      pathValue: options.pathValue,
      fsAccess: options.fsAccess
    });
    if (!npmExecutable) throwUpdate("npm executable not found", "npm executable was not found on PATH");
    const candidate = await packLatestRelease({ npmExecutable, workspace, options });
    const plan = planUpdate(inspection.currentVersion, candidate.version);
    if (plan === "candidate-older") throwUpdate("invalid version direction", "latest stable release is older than the current CMR");
    return { status: plan === "same" ? "already-current" : "update-available", currentVersion: inspection.currentVersion, candidateVersion: candidate.version };
  } finally {
    if (workspace) {
      try {
        await fsApi.rm(workspace.directory, { recursive: true, force: true });
      } catch {
        (options.warningOutput ?? options.errorOutput ?? stderr).write("WARN temporary update cleanup could not be completed\n");
      }
    }
  }
}

function writeCheckResult(result, inspection, output) {
  if (inspection.kind === "source-link") {
    output.write("Current installation is source-linked; automatic replacement is unavailable.\n");
  }
  if (result.status === "already-current") {
    output.write(`CMR ${result.currentVersion} is already the latest stable release.\n`);
  } else {
    output.write(`Current CMR: ${result.currentVersion}\n`);
    output.write(`Latest stable CMR: ${result.candidateVersion}\n`);
    output.write("Update available. Run: cmr update\n");
  }
}

export async function runUpdate(args = [], options = {}) {
  const output = options.output ?? stdout;
  const errorOutput = options.errorOutput ?? stderr;
  try {
    let mode;
    try {
      mode = parseUpdateArgs(args);
    } catch {
      throwUpdate("invalid arguments", "usage: cmr update or cmr update --check");
    }
    const inspection = await inspect(options);
    if (!mode.checkOnly && inspection.kind !== "global-package") {
      throwUpdate("unsupported installation type", "automatic update requires an entity npm global package");
    }
    if (mode.checkOnly) {
      const result = await checkLatest({ inspection, options });
      writeCheckResult(result, inspection, output);
      return { ...result, exitCode: 0 };
    }

    const npmExecutable = options.npmExecutable ?? await findNpmExecutable({
      platform: options.platform ?? process.platform,
      env: options.env ?? process.env,
      pathValue: options.pathValue,
      fsAccess: options.fsAccess
    });
    if (!npmExecutable) throwUpdate("npm executable not found", "npm executable was not found on PATH");
    const env = commandEnvironment(options);
    const lockPath = options.lockPath ?? path.join(getApplicationDataDir({
      platform: options.platform ?? process.platform,
      env: options.env ?? process.env,
      homedir: options.homedir
    }), "update.lock");
    let lock;
    try {
      lock = await acquireUpdateLock({
        lockPath,
        fs: options.lockFs,
        pid: options.pid,
        now: options.now,
        staleMs: options.lockStaleMs,
        randomToken: options.randomToken,
        isProcessAlive: options.isProcessAlive
      });
    } catch (error) {
      if (error instanceof UpdateLockError) throwUpdate(error.code === "concurrent-update" ? "concurrent update" : "update lock unavailable", error.message);
      throwUpdate("update lock unavailable", "could not acquire the update lock");
    }
    const fsApi = options.fs ?? { mkdtemp, mkdir, rm };
    let workspace;
    try {
      workspace = await createTempWorkspace({ fsApi, tempParent: options.tempParent });
      const result = await transactionalUpdate({ inspection, npmExecutable, options, workspace, env });
      if (result.status === "updated") output.write(`CMR updated successfully: ${result.currentVersion} -> ${result.candidateVersion}\n`);
      if (result.status === "already-current") output.write(`CMR ${result.currentVersion} is already the latest stable release.\n`);
      if (result.status === "failed-old-intact") (options.errorOutput ?? stderr).write(`ERROR install failed: CMR ${result.currentVersion} remains usable.\n`);
      if (result.status === "failed-rolled-back") (options.errorOutput ?? stderr).write(`ERROR update failed: rollback succeeded; CMR ${result.currentVersion} was restored.\n`);
      if (result.status === "failed-rollback") {
        (options.errorOutput ?? stderr).write(`ERROR update and rollback failed. Manual recovery: ${result.recoveryCommand}\n`);
      }
      return result;
    } finally {
      if (workspace) {
        try {
          await fsApi.rm(workspace.directory, { recursive: true, force: true });
        } catch {
          (options.warningOutput ?? options.errorOutput ?? stderr).write("WARN temporary update cleanup could not be completed\n");
        }
      }
      try {
        const released = await lock.release();
        if (!released) {
          (options.warningOutput ?? options.errorOutput ?? stderr).write("WARN update lock cleanup could not be completed\n");
        }
      } catch {
        (options.warningOutput ?? options.errorOutput ?? stderr).write("WARN update lock cleanup could not be completed\n");
      }
    }
  } catch (error) {
    if (error instanceof UpdateLockError) error = new UpdateError("update lock unavailable", "could not acquire the update lock");
    errorOutput.write(`ERROR ${formatFailure(error)}\n`);
    return { status: "failed", exitCode: error instanceof UpdateError ? error.exitCode : 1 };
  }
}
