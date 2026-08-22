import assert from "node:assert/strict";
import { access, cp, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCommandRunner, runCommand } from "../src/command-runner.js";
import { runUpdate } from "../src/commands/update.js";
import { findNpmExecutable } from "../src/platform.js";
import { CMR_PACKAGE_NAME, LATEST_RELEASE_ASSET_URL } from "../src/updater.js";

// SHA256SUMS answers for locally injected candidates: hash the tarball npm actually produced,
// keyed by its basename, so integrity verification passes without network access.
function makeCandidateSumsTracker(runner) {
  const state = { lastPackedCandidate: null };
  const wrapped = async (request) => {
    const args = [...request.args];
    if (args[0] === "pack" && args[1] === LATEST_RELEASE_ASSET_URL) args[1] = state.candidateTarball;
    const early = state.intercept ? await state.intercept(args) : undefined;
    if (early) return early;
    const result = await runner.run({ ...request, args });
    if (args[0] === "pack" && args[1] === state.candidateTarball) {
      const metadata = JSON.parse(result.stdout)[0];
      const destination = args[args.indexOf("--pack-destination") + 1];
      state.lastPackedCandidate = path.isAbsolute(metadata.filename)
        ? metadata.filename
        : path.join(destination, metadata.filename);
    }
    if (state.onResult) state.onResult(args, result);
    return result;
  };
  state.fetchImpl = async () => {
    const bytes = await readFile(state.lastPackedCandidate);
    return { ok: true, text: async () => `${createHash("sha256").update(bytes).digest("hex")}  ${path.basename(state.lastPackedCandidate)}\n` };
  };
  state.run = wrapped;
  return state;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativePlatform = process.platform;
const nativeE2eSupported = nativePlatform === "darwin" || nativePlatform === "win32";
const platformLabel = nativePlatform === "win32" ? "Windows" : "Mac";

async function runNpm(npmExecutable, args, env, cwd = repoRoot) {
  const result = await createCommandRunner({ platform: nativePlatform }).run({
    executable: npmExecutable,
    args,
    cwd,
    env,
    platform: nativePlatform,
    maxOutputBytes: 256 * 1024,
    timeoutMs: 2 * 60 * 1000
  });
  assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

async function makeFixture(root, version, { sentinelPath } = {}) {
  const fixture = path.join(root, `fixture-${version}`);
  await mkdir(fixture, { recursive: true });
  await cp(path.join(repoRoot, "src"), path.join(fixture, "src"), { recursive: true });
  await cp(path.join(repoRoot, "config"), path.join(fixture, "config"), { recursive: true });
  await cp(path.join(repoRoot, "README.md"), path.join(fixture, "README.md"));
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  packageJson.version = version;
  if (sentinelPath) packageJson.scripts = { install: `node -e "require('fs').writeFileSync(${JSON.stringify(sentinelPath)}, 'ran')"` };
  await writeFile(path.join(fixture, "package.json"), JSON.stringify(packageJson, null, 2));
  const cliPath = path.join(fixture, "src", "cli.js");
  const cliSource = await readFile(cliPath, "utf8");
  await writeFile(cliPath, cliSource.replace(/export const VERSION = "[^"]+";/, `export const VERSION = "${version}";`));
  return fixture;
}

async function packFixture(npmExecutable, fixture, destination, cache, env) {
  const result = await runNpm(npmExecutable, [
    "pack",
    "--json",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    cache,
    "--pack-destination",
    destination
  ], env, fixture);
  const metadata = JSON.parse(result.stdout);
  assert.equal(metadata.length, 1);
  return path.isAbsolute(metadata[0].filename) ? metadata[0].filename : path.join(destination, metadata[0].filename);
}

async function installFixture(npmExecutable, prefix, tarball, cache, env) {
  await runNpm(npmExecutable, [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    cache,
    tarball
  ], env);
}

async function assertMissing(file) {
  await assert.rejects(() => access(file), { code: "ENOENT" });
}

function installationPaths(prefix) {
  if (nativePlatform === "win32") {
    return {
      commandPath: path.join(prefix, "cmr.cmd"),
      modulePath: path.join(prefix, "node_modules", CMR_PACKAGE_NAME, "src", "cli.js"),
      packageRoot: path.join(prefix, "node_modules", CMR_PACKAGE_NAME),
      packageJson: path.join(prefix, "node_modules", CMR_PACKAGE_NAME, "package.json")
    };
  }
  return {
    commandPath: path.join(prefix, "bin", "cmr"),
    modulePath: path.join(prefix, "lib", "node_modules", CMR_PACKAGE_NAME, "src", "cli.js"),
    packageRoot: path.join(prefix, "lib", "node_modules", CMR_PACKAGE_NAME),
    packageJson: path.join(prefix, "lib", "node_modules", CMR_PACKAGE_NAME, "package.json")
  };
}

test(`${platformLabel} isolated prefix self-update uses real npm, exact prefix, local release injection, and no lifecycle script`, {
  skip: !nativeE2eSupported
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-e2e-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spacedRoot = path.join(root, "prefix with spaces 中文");
  const home = path.join(root, "home");
  const appData = path.join(home, "AppData", "Roaming");
  const cache = path.join(root, "npm-cache");
  const assets = path.join(root, "assets");
  const prefix = path.join(spacedRoot, "target");
  const otherPrefix = path.join(spacedRoot, "other");
  await mkdir(home, { recursive: true });
  await mkdir(appData, { recursive: true });
  await mkdir(cache, { recursive: true });
  await mkdir(assets, { recursive: true });
  const npmExecutable = await findNpmExecutable({ platform: nativePlatform, env: process.env });
  assert.ok(npmExecutable);
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData };
  const sentinelPath = path.join(root, "lifecycle-ran");
  const oldFixture = await makeFixture(root, "1.2.1");
  const candidateFixture = await makeFixture(root, "1.3.0", { sentinelPath });
  const oldTarball = await packFixture(npmExecutable, oldFixture, assets, cache, env);
  const candidateTarball = await packFixture(npmExecutable, candidateFixture, assets, cache, env);
  await installFixture(npmExecutable, prefix, oldTarball, cache, env);
  await installFixture(npmExecutable, otherPrefix, oldTarball, cache, env);

  const { commandPath, modulePath, packageJson } = installationPaths(prefix);
  const otherPackageJson = installationPaths(otherPrefix).packageJson;
  const lockPath = path.join(appData, "ClaudeModelRouter", "update.lock");
  const runner = createCommandRunner({ platform: nativePlatform });
  const observed = [];
  const sumsTracker = makeCandidateSumsTracker(runner);
  sumsTracker.candidateTarball = candidateTarball;
  sumsTracker.onResult = (args, result) => {
    observed.push({ args, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
  };
  const injectedRunner = { run: sumsTracker.run };
  const output = { value: "", write(chunk) { this.value += chunk; } };
  const errorOutput = { value: "", write(chunk) { this.value += chunk; } };
  const checkResult = await runUpdate(["--check"], {
    entryPath: commandPath,
    modulePath,
    currentVersion: "1.2.1",
    platform: nativePlatform,
    env,
    npmExecutable,
    runner: injectedRunner,
    tempParent: root,
    output,
    errorOutput
  });
  assert.equal(checkResult.status, "update-available", errorOutput.value);
  assert.equal(JSON.parse(await readFile(packageJson, "utf8")).version, "1.2.1");

  const result = await runUpdate([], {
    entryPath: commandPath,
    modulePath,
    currentVersion: "1.2.1",
    platform: nativePlatform,
    env,
    npmExecutable,
    runner: injectedRunner,
    fetchImpl: sumsTracker.fetchImpl,
    lockPath,
    tempParent: root,
    output,
    errorOutput,
    randomToken: () => "real-e2e-owner-abcdefghijkl"
  });
  assert.equal(result.status, "updated", `${errorOutput.value}\n${JSON.stringify(observed)}`);
  assert.equal(result.exitCode, 0);
  assert.match(output.value, /1\.2\.1 -> 1\.3\.0/);
  assert.equal(JSON.parse(await readFile(packageJson, "utf8")).version, "1.3.0");
  assert.equal(JSON.parse(await readFile(otherPackageJson, "utf8")).version, "1.2.1");
  await assertMissing(sentinelPath);
  await assertMissing(lockPath);
});

test(`${platformLabel} isolated prefix rejects a bad candidate before install and preserves old package`, {
  skip: !nativeE2eSupported
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-e2e-bad-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const appData = path.join(home, "AppData", "Roaming");
  const cache = path.join(root, "cache");
  const assets = path.join(root, "assets");
  const prefix = path.join(root, "prefix");
  await mkdir(home, { recursive: true });
  await mkdir(appData, { recursive: true });
  await mkdir(cache, { recursive: true });
  await mkdir(assets, { recursive: true });
  const npmExecutable = await findNpmExecutable({ platform: nativePlatform, env: process.env });
  assert.ok(npmExecutable);
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData };
  const oldFixture = await makeFixture(root, "1.2.1");
  const badFixture = await makeFixture(root, "1.3.0");
  const badPackage = JSON.parse(await readFile(path.join(badFixture, "package.json"), "utf8"));
  badPackage.name = "not-claude-model-router";
  await writeFile(path.join(badFixture, "package.json"), JSON.stringify(badPackage, null, 2));
  const oldTarball = await packFixture(npmExecutable, oldFixture, assets, cache, env);
  const badTarball = await packFixture(npmExecutable, badFixture, assets, cache, env);
  await installFixture(npmExecutable, prefix, oldTarball, cache, env);
  const { commandPath, modulePath, packageJson } = installationPaths(prefix);
  const runner = createCommandRunner({ platform: nativePlatform });
  const injectedRunner = { async run(request) {
    const args = [...request.args];
    if (args[0] === "pack" && args[1] === LATEST_RELEASE_ASSET_URL) args[1] = badTarball;
    return runner.run({ ...request, args });
  } };
  const errorOutput = { value: "", write(chunk) { this.value += chunk; } };
  const result = await runUpdate([], {
    entryPath: commandPath,
    modulePath,
    currentVersion: "1.2.1",
    platform: nativePlatform,
    env,
    npmExecutable,
    runner: injectedRunner,
    lockPath: path.join(home, "update.lock"),
    tempParent: root,
    output: { write() {} },
    errorOutput,
    randomToken: () => "bad-e2e-owner-abcdefghijkl"
  });
  assert.equal(result.status, "failed");
  assert.match(errorOutput.value, /unexpected package name|malformed pack metadata/);
  assert.equal(JSON.parse(await readFile(packageJson, "utf8")).version, "1.2.1");
});

test("Windows entity package junction is rejected before npm runs", {
  skip: nativePlatform !== "win32"
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-e2e-junction-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const appData = path.join(home, "AppData", "Roaming");
  const cache = path.join(root, "cache");
  const assets = path.join(root, "assets");
  const prefix = path.join(root, "prefix with spaces 中文");
  await mkdir(appData, { recursive: true });
  await mkdir(cache, { recursive: true });
  await mkdir(assets, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData };
  const npmExecutable = await findNpmExecutable({ platform: nativePlatform, env });
  assert.ok(npmExecutable);
  const fixture = await makeFixture(root, "1.2.1");
  const tarball = await packFixture(npmExecutable, fixture, assets, cache, env);
  await installFixture(npmExecutable, prefix, tarball, cache, env);
  const installation = installationPaths(prefix);
  const entityRoot = path.join(root, "entity-package");
  await rename(installation.packageRoot, entityRoot);
  await symlink(entityRoot, installation.packageRoot, "junction");
  let runnerCalls = 0;
  const errorOutput = { value: "", write(chunk) { this.value += chunk; } };

  const result = await runUpdate([], {
    entryPath: installation.commandPath,
    modulePath: installation.modulePath,
    currentVersion: "1.2.1",
    platform: nativePlatform,
    env,
    npmExecutable,
    runner: { async run() { runnerCalls += 1; throw new Error("npm must not run"); } },
    lockPath: path.join(appData, "ClaudeModelRouter", "update.lock"),
    tempParent: root,
    output: { write() {} },
    errorOutput
  });

  assert.equal(result.status, "failed");
  assert.equal(runnerCalls, 0);
  assert.match(errorOutput.value, /source-linked|entity npm global package/);
});

test("Windows real npm install failure rolls back the damaged package", {
  skip: nativePlatform !== "win32"
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-e2e-rollback-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const appData = path.join(home, "AppData", "Roaming");
  const cache = path.join(root, "cache");
  const assets = path.join(root, "assets");
  const prefix = path.join(root, "prefix with spaces 中文");
  await mkdir(appData, { recursive: true });
  await mkdir(cache, { recursive: true });
  await mkdir(assets, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData };
  const npmExecutable = await findNpmExecutable({ platform: nativePlatform, env });
  assert.ok(npmExecutable);
  const oldFixture = await makeFixture(root, "1.2.1");
  const candidateFixture = await makeFixture(root, "1.3.0");
  const oldTarball = await packFixture(npmExecutable, oldFixture, assets, cache, env);
  const candidateTarball = await packFixture(npmExecutable, candidateFixture, assets, cache, env);
  await installFixture(npmExecutable, prefix, oldTarball, cache, env);
  const installation = installationPaths(prefix);
  const runner = createCommandRunner({ platform: nativePlatform });
  const sumsTracker = makeCandidateSumsTracker(runner);
  sumsTracker.candidateTarball = candidateTarball;
  let injectedFailure = false;
  sumsTracker.intercept = async (args) => {
    if (!injectedFailure && args[0] === "install") {
      injectedFailure = true;
      await writeFile(installation.packageJson, JSON.stringify({
        name: CMR_PACKAGE_NAME,
        version: "damaged"
      }));
      return { exitCode: 1, signal: null, stdout: "", stderr: "injected install failure" };
    }
    return undefined;
  };
  const injectedRunner = { run: sumsTracker.run };
  const errorOutput = { value: "", write(chunk) { this.value += chunk; } };

  const result = await runUpdate([], {
    entryPath: installation.commandPath,
    modulePath: installation.modulePath,
    currentVersion: "1.2.1",
    platform: nativePlatform,
    env,
    npmExecutable,
    runner: injectedRunner,
    fetchImpl: sumsTracker.fetchImpl,
    lockPath: path.join(appData, "ClaudeModelRouter", "update.lock"),
    tempParent: root,
    output: { write() {} },
    errorOutput,
    randomToken: () => "rollback-e2e-owner-abcdefghijkl"
  });

  assert.equal(injectedFailure, true);
  assert.equal(result.status, "failed-rolled-back", errorOutput.value);
  assert.equal(result.exitCode, 1);
  assert.match(errorOutput.value, /rollback succeeded/);
  assert.equal(JSON.parse(await readFile(installation.packageJson, "utf8")).version, "1.2.1");
});

test("Windows command runner terminates a real child and preserves forwarded Ctrl+C semantics", {
  skip: nativePlatform !== "win32"
}, async () => {
  const processLike = new EventEmitter();
  const pending = runCommand({
    executable: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    platform: nativePlatform,
    env: process.env,
    processLike,
    timeoutMs: 10_000
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  processLike.emit("SIGINT");
  const result = await pending;
  assert.equal(result.exitCode, 130);
  assert.equal(result.signal, "SIGINT");
});
