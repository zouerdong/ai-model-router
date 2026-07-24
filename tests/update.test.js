import assert from "node:assert/strict";
import * as defaultFsSync from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseUpdateArgs, runUpdate } from "../src/commands/update.js";
import { CMR_PACKAGE_NAME } from "../src/updater.js";

function capture() {
  let value = "";
  return { output: { write(chunk) { value += chunk; } }, get value() { return value; } };
}

async function createInstall(t, { linked = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-update-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prefix = path.join(root, "prefix");
  const packageRoot = path.join(prefix, "lib", "node_modules", CMR_PACKAGE_NAME);
  const sourceRoot = path.join(root, "checkout");
  const actualRoot = linked ? sourceRoot : packageRoot;
  await mkdir(path.join(prefix, "bin"), { recursive: true });
  await mkdir(path.dirname(packageRoot), { recursive: true });
  await mkdir(path.join(actualRoot, "src"), { recursive: true });
  await writeFile(path.join(actualRoot, "package.json"), JSON.stringify({ name: CMR_PACKAGE_NAME, version: "1.2.1" }));
  await writeFile(path.join(actualRoot, "src", "cli.js"), "#!/usr/bin/env node\n");
  if (linked) await symlink(sourceRoot, packageRoot, "dir");
  const commandPath = path.join(prefix, "bin", "cmr");
  await symlink(path.relative(path.dirname(commandPath), path.join(packageRoot, "src", "cli.js")), commandPath);
  return { prefix, packageRoot, commandPath, modulePath: path.join(actualRoot, "src", "cli.js") };
}

function fixtureRunner(calls, candidateVersion = "1.3.0") {
  return {
    async run({ args, cwd }) {
      calls.push({ args: [...args], cwd });
      const destination = args[args.indexOf("--pack-destination") + 1];
      const isCandidate = args[1].startsWith("https://");
      const version = isCandidate ? candidateVersion : "1.2.1";
      const filename = path.join(destination, `claude-model-router-${version}.tgz`);
      await writeFile(filename, "fake package");
      return {
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify([{ name: CMR_PACKAGE_NAME, version, filename }]),
        stderr: ""
      };
    }
  };
}

function transactionRunner({ installOutcome = "success", verifyOutput = null, mutateBeforeInstall = false } = {}) {
  const calls = [];
  let installedVersion = "1.2.1";
  let verificationCount = 0;
  let packageRoot;
  let candidatePath;
  let rollbackPath;
  return {
    calls,
    get installedVersion() { return installedVersion; },
    setPackageRoot(value) { packageRoot = value; },
    async run({ args, cwd }) {
      calls.push({ args: [...args], cwd });
      if (args[0] === "pack") {
        const spec = args[1];
        const destination = args[args.indexOf("--pack-destination") + 1];
        const isCandidate = spec.startsWith("https://");
        const version = isCandidate ? "1.3.0" : "1.2.1";
        const filename = path.join(destination, `claude-model-router-${version}-${isCandidate ? "candidate" : "rollback"}.tgz`);
        await writeFile(filename, "fake package");
        if (isCandidate) candidatePath = filename;
        else rollbackPath = filename;
        if (isCandidate && mutateBeforeInstall) {
          await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: CMR_PACKAGE_NAME, version: "9.9.9" }));
        }
        return { exitCode: 0, signal: null, stdout: JSON.stringify([{ name: CMR_PACKAGE_NAME, version, filename }]), stderr: "" };
      }
      if (args[0] === "install") {
        const packagePath = args.at(-1);
        if (packagePath === candidatePath) {
          if (installOutcome === "failure-old-intact") return { exitCode: 7, signal: null, stdout: "", stderr: "permission denied" };
          await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: CMR_PACKAGE_NAME, version: "1.3.0" }));
          installedVersion = "1.3.0";
          if (installOutcome === "failure-after-mutation" || installOutcome === "rollback-failure") {
            return { exitCode: 7, signal: null, stdout: "", stderr: "install failed" };
          }
          return { exitCode: 0, signal: null, stdout: "", stderr: "" };
        }
        if (packagePath === rollbackPath) {
          if (installOutcome === "rollback-failure") return { exitCode: 9, signal: null, stdout: "", stderr: "rollback failed" };
          await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: CMR_PACKAGE_NAME, version: "1.2.1" }));
          installedVersion = "1.2.1";
          return { exitCode: 0, signal: null, stdout: "", stderr: "" };
        }
      }
      if (args[0] === "version") {
        verificationCount += 1;
        const displayedVersion = verifyOutput && verificationCount === 1 ? verifyOutput : installedVersion;
        return { exitCode: 0, signal: null, stdout: `${displayedVersion}\n`, stderr: "" };
      }
      throw new Error("unexpected runner invocation");
    }
  };
}

test("update accepts only the explicit check form", () => {
  assert.deepEqual(parseUpdateArgs([]), { checkOnly: false });
  assert.deepEqual(parseUpdateArgs(["--check"]), { checkOnly: true });
  for (const args of [["latest"], ["v1.4.0"], ["--force"], ["--channel", "beta"], ["--url", "sentinel"], ["--check", "extra"]]) {
    assert.throws(() => parseUpdateArgs(args), /usage: cmr update/);
  }
});

test("update --check packs the fixed Release asset and never installs", async (t) => {
  const install = await createInstall(t);
  const calls = [];
  const output = capture();
  const result = await runUpdate(["--check"], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    env: { PATH: "/not-used", ANTHROPIC_AUTH_TOKEN: "test-token" },
    npmExecutable: "/fake/npm",
    runner: fixtureRunner(calls),
    tempParent: path.dirname(install.prefix),
    output: output.output,
    errorOutput: capture().output
  });
  assert.equal(result.exitCode, 0);
  assert.match(output.value, /Current CMR: 1\.2\.1/);
  assert.match(output.value, /Latest stable CMR: 1\.3\.0/);
  assert.match(output.value, /Update available/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], "pack");
  assert.equal(calls[0].args[1], "https://github.com/zouerdong/ai-model-router/releases/latest/download/claude-model-router.tgz");
  assert.ok(calls[0].args.includes("--ignore-scripts"));
  assert.ok(calls[0].args.includes("--no-audit"));
  assert.ok(calls[0].args.includes("--no-fund"));
  assert.equal(calls[0].args.includes("--prefix"), false);
  assert.equal(await readFile(path.join(install.packageRoot, "package.json"), "utf8"), JSON.stringify({ name: CMR_PACKAGE_NAME, version: "1.2.1" }));
});

test("source-linked update --check reports the source boundary but can inspect latest", async (t) => {
  const install = await createInstall(t, { linked: true });
  const output = capture();
  const result = await runUpdate(["--check"], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner: fixtureRunner([]),
    tempParent: path.dirname(install.prefix),
    output: output.output,
    errorOutput: capture().output
  });
  assert.equal(result.exitCode, 0);
  assert.match(output.value, /source-linked/);
});

test("update backs up, installs the candidate into the current prefix, verifies the absolute command, and cleans lock/temp", async (t) => {
  const install = await createInstall(t);
  const runner = transactionRunner();
  runner.setPackageRoot(install.packageRoot);
  const output = capture();
  const errorOutput = capture();
  const lockPath = path.join(path.dirname(install.prefix), "application", "update.lock");
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner,
    lockPath,
    randomToken: () => "transaction-owner-abcdefghijkl",
    tempParent: path.dirname(install.prefix),
    output: output.output,
    errorOutput: errorOutput.output
  });
  assert.equal(result.status, "updated", errorOutput.value);
  assert.equal(result.exitCode, 0);
  assert.match(output.value, /CMR updated successfully: 1\.2\.1 -> 1\.3\.0/);
  assert.equal(errorOutput.value, "");
  assert.equal(JSON.parse(await readFile(path.join(install.packageRoot, "package.json"), "utf8")).version, "1.3.0");
  await assert.rejects(() => readFile(lockPath, "utf8"), { code: "ENOENT" });
  assert.equal(runner.calls.filter((call) => call.args[0] === "install").length, 1);
  const installCall = runner.calls.find((call) => call.args[0] === "install");
  assert.deepEqual(installCall.args.slice(0, 9), [
    "install", "--global", "--prefix", install.prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--cache", installCall.args[8]
  ]);
  assert.equal(runner.calls.at(-1).args[0], "version");
});

test("same and older candidates never install", async (t) => {
  for (const candidateVersion of ["1.2.1", "1.1.9"]) {
    const install = await createInstall(t);
    const calls = [];
    const output = capture();
    const errorOutput = capture();
    const result = await runUpdate([], {
      entryPath: install.commandPath,
      modulePath: install.modulePath,
      currentVersion: "1.2.1",
      platform: "darwin",
      npmExecutable: "/fake/npm",
      runner: fixtureRunner(calls, candidateVersion),
      lockPath: path.join(path.dirname(install.prefix), `lock-${candidateVersion}.json`),
      randomToken: () => `same-older-${candidateVersion.replaceAll(".", "")}-abcdefghijkl`,
      tempParent: path.dirname(install.prefix),
      output: output.output,
      errorOutput: errorOutput.output
    });
    if (candidateVersion === "1.2.1") {
      assert.equal(result.status, "already-current");
      assert.equal(result.exitCode, 0);
      assert.equal(calls.filter((call) => call.args[0] === "install").length, 0);
    } else {
      assert.equal(result.status, "failed");
      assert.equal(result.exitCode, 1);
      assert.match(errorOutput.value, /invalid version direction/);
      assert.equal(calls.filter((call) => call.args[0] === "install").length, 0);
    }
  }
});

test("install failure leaves an intact old installation distinguishable from rollback", async (t) => {
  const intact = await createInstall(t);
  const intactRunner = transactionRunner({ installOutcome: "failure-old-intact" });
  intactRunner.setPackageRoot(intact.packageRoot);
  const intactError = capture();
  const intactResult = await runUpdate([], {
    entryPath: intact.commandPath,
    modulePath: intact.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner: intactRunner,
    lockPath: path.join(path.dirname(intact.prefix), "intact.lock"),
    randomToken: () => "install-failure-owner-abcdefghijkl",
    tempParent: path.dirname(intact.prefix),
    output: capture().output,
    errorOutput: intactError.output
  });
  assert.equal(intactResult.status, "failed-old-intact");
  assert.match(intactError.value, /remains usable/);
  assert.equal(intactRunner.calls.filter((call) => call.args[0] === "install").length, 1);

  const rollback = await createInstall(t);
  const rollbackRunner = transactionRunner({ installOutcome: "failure-after-mutation" });
  rollbackRunner.setPackageRoot(rollback.packageRoot);
  const rollbackError = capture();
  const rollbackResult = await runUpdate([], {
    entryPath: rollback.commandPath,
    modulePath: rollback.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner: rollbackRunner,
    lockPath: path.join(path.dirname(rollback.prefix), "rollback.lock"),
    randomToken: () => "rollback-owner-abcdefghijkl",
    tempParent: path.dirname(rollback.prefix),
    output: capture().output,
    errorOutput: rollbackError.output
  });
  assert.equal(rollbackResult.status, "failed-rolled-back");
  assert.match(rollbackError.value, /rollback succeeded/);
  assert.doesNotMatch(rollbackError.value, /undefined/);
  assert.match(rollbackError.value, /CMR 1\.2\.1 was restored/);
  assert.equal(JSON.parse(await readFile(path.join(rollback.packageRoot, "package.json"), "utf8")).version, "1.2.1");
});

test("post-verify failure and rollback failure are reported without false success", async (t) => {
  const broken = await createInstall(t);
  const brokenRunner = transactionRunner({ verifyOutput: "wrong-version" });
  brokenRunner.setPackageRoot(broken.packageRoot);
  const brokenError = capture();
  const brokenResult = await runUpdate([], {
    entryPath: broken.commandPath,
    modulePath: broken.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner: brokenRunner,
    lockPath: path.join(path.dirname(broken.prefix), "broken.lock"),
    randomToken: () => "broken-owner-abcdefghijkl",
    tempParent: path.dirname(broken.prefix),
    output: capture().output,
    errorOutput: brokenError.output
  });
  assert.equal(brokenResult.status, "failed-rolled-back");
  assert.match(brokenError.value, /rollback succeeded/);

  const failed = await createInstall(t);
  const failedRunner = transactionRunner({ installOutcome: "rollback-failure", verifyOutput: "wrong-version" });
  failedRunner.setPackageRoot(failed.packageRoot);
  const failedError = capture();
  const failedResult = await runUpdate([], {
    entryPath: failed.commandPath,
    modulePath: failed.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner: failedRunner,
    lockPath: path.join(path.dirname(failed.prefix), "failed.lock"),
    randomToken: () => "failed-owner-abcdefghijkl",
    tempParent: path.dirname(failed.prefix),
    output: capture().output,
    errorOutput: failedError.output,
    recoveryDirectory: path.join(path.dirname(failed.prefix), "recovery")
  });
  assert.equal(failedResult.status, "failed-rollback");
  assert.match(failedError.value, /Manual recovery/);
  assert.match(failedError.value, /--prefix/);
  assert.equal(failedResult.recoveryPreserved, true);
  const recoveryPath = failedError.value.match(/'([^']*rollback-[^']+\.tgz)'/)?.[1];
  assert.ok(recoveryPath);
  await readFile(recoveryPath);
  assert.match(failedResult.recoveryCommand, /recovery\/npm-cache/);
});

test("post-install verification rejects a command shim that no longer maps to the package", async (t) => {
  const install = await createInstall(t);
  const runner = transactionRunner();
  runner.setPackageRoot(install.packageRoot);
  const fsSync = {
    ...defaultFsSync,
    realpathSync(value) {
      if (value === install.commandPath && runner.installedVersion === "1.3.0") {
        return path.join(path.dirname(install.commandPath), "other-command");
      }
      return defaultFsSync.realpathSync(value);
    }
  };
  const errorOutput = capture();
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner,
    fsSync,
    lockPath: path.join(path.dirname(install.prefix), "mapping.lock"),
    randomToken: () => "mapping-owner-abcdefghijkl",
    tempParent: path.dirname(install.prefix),
    output: capture().output,
    errorOutput: errorOutput.output
  });
  assert.equal(result.status, "failed-rolled-back");
  assert.match(errorOutput.value, /rollback succeeded/);
  assert.equal(runner.calls.filter((call) => call.args[0] === "install").length, 2);
});

test("does not update when npm is unavailable and clears no unrelated prefix", async (t) => {
  const install = await createInstall(t);
  const errorOutput = capture();
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    env: { PATH: "" },
    fsAccess: async () => false,
    lockPath: path.join(path.dirname(install.prefix), "missing-npm.lock"),
    tempParent: path.dirname(install.prefix),
    output: capture().output,
    errorOutput: errorOutput.output
  });
  assert.equal(result.exitCode, 1);
  assert.match(errorOutput.value, /npm executable not found/);
  assert.equal(JSON.parse(await readFile(path.join(install.packageRoot, "package.json"), "utf8")).version, "1.2.1");
});

test("clears Router variables before npm and maps interrupted install to exit 130", async (t) => {
  const install = await createInstall(t);
  const runner = transactionRunner({ installOutcome: "failure-old-intact" });
  runner.setPackageRoot(install.packageRoot);
  const observedEnvs = [];
  const originalRun = runner.run.bind(runner);
  runner.run = async (request) => {
    observedEnvs.push(request.env);
    const result = await originalRun(request);
    if (request.args[0] === "install") return { ...result, exitCode: 130 };
    return result;
  };
  const errorOutput = capture();
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    env: {
      PATH: "/tmp/npm",
      ANTHROPIC_AUTH_TOKEN: "test-router-token",
      ANTHROPIC_MODEL: "test-model",
      HTTPS_PROXY: "https://proxy.example"
    },
    npmExecutable: "/tmp/npm",
    runner,
    lockPath: path.join(path.dirname(install.prefix), "interrupted.lock"),
    randomToken: () => "interrupted-owner-abcdefghijkl",
    tempParent: path.dirname(install.prefix),
    output: capture().output,
    errorOutput: errorOutput.output
  });
  assert.equal(result.status, "failed-old-intact");
  assert.equal(result.exitCode, 130);
  assert.equal(observedEnvs.every((env) => !Object.hasOwn(env, "ANTHROPIC_AUTH_TOKEN")
    && !Object.hasOwn(env, "ANTHROPIC_MODEL") && env.HTTPS_PROXY === "https://proxy.example"), true);
  assert.doesNotMatch(errorOutput.value, /test-router-token|test-model/);
});

test("detects a changed active installation before install", async (t) => {
  const install = await createInstall(t);
  const runner = transactionRunner({ mutateBeforeInstall: true });
  runner.setPackageRoot(install.packageRoot);
  const errorOutput = capture();
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner,
    lockPath: path.join(path.dirname(install.prefix), "changed.lock"),
    randomToken: () => "changed-owner-abcdefghijkl",
    tempParent: path.dirname(install.prefix),
    output: capture().output,
    errorOutput: errorOutput.output
  });
  assert.equal(result.status, "failed");
  assert.match(errorOutput.value, /package and CLI versions do not match|changed before install/);
  assert.equal(runner.calls.filter((call) => call.args[0] === "install").length, 0);
});

test("distinguishes current backup failure, candidate metadata failure, temp failure, and interrupted download", async (t) => {
  const cases = [
    {
      name: "backup",
      runner: {
        async run() {
          return {
            exitCode: 8,
            signal: null,
            stdout: JSON.stringify([{ name: CMR_PACKAGE_NAME, version: "1.2.1", filename: "looks-successful.tgz" }]),
            stderr: "backup failed"
          };
        }
      },
      expected: /current package backup failed/
    },
    {
      name: "candidate",
      runner: {
        count: 0,
        async run({ args }) {
          this.count += 1;
          if (this.count === 1) {
            const destination = args[args.indexOf("--pack-destination") + 1];
            const filename = path.join(destination, "old.tgz");
            await writeFile(filename, "old");
            return { exitCode: 0, signal: null, stdout: JSON.stringify([{ name: CMR_PACKAGE_NAME, version: "1.2.1", filename }]), stderr: "" };
          }
          return { exitCode: 0, signal: null, stdout: "not-json", stderr: "" };
        }
      },
      expected: /malformed pack metadata/
    },
    {
      name: "temp",
      runner: { async run() { throw new Error("runner must not be reached"); } },
      fs: {
        async mkdtemp() { throw new Error("temp unavailable"); },
        async mkdir() {},
        async rm() {}
      },
      expected: /update failed: unexpected local error/
    },
    {
      name: "interrupt",
      runner: { async run() { return { exitCode: 130, signal: "SIGINT", stdout: "", stderr: "" }; } },
      expected: /interrupted/
    }
  ];
  for (const item of cases) {
    const install = await createInstall(t);
    const errorOutput = capture();
    const result = await runUpdate([], {
      entryPath: install.commandPath,
      modulePath: install.modulePath,
      currentVersion: "1.2.1",
      platform: "darwin",
      npmExecutable: "/fake/npm",
      runner: item.runner,
      fs: item.fs,
      lockPath: path.join(path.dirname(install.prefix), `${item.name}.lock`),
      randomToken: () => `${item.name}-failure-owner-abcdefghijkl`,
      tempParent: path.dirname(install.prefix),
      output: capture().output,
      errorOutput: errorOutput.output
    });
    assert.equal(result.exitCode, item.name === "interrupt" ? 130 : 1, item.name);
    assert.match(errorOutput.value, item.expected, item.name);
  }
});

test("cleanup failure is a warning and does not turn a successful no-op into a failure", async (t) => {
  const install = await createInstall(t);
  const runner = transactionRunner();
  runner.setPackageRoot(install.packageRoot);
  const warnings = capture();
  const errorOutput = capture();
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner,
    fs: {
      async mkdtemp(parent) { return mkdtemp(parent); },
      async mkdir(directory, options) { return mkdir(directory, options); },
      async rm() { throw new Error("cleanup denied"); }
    },
    lockPath: path.join(path.dirname(install.prefix), "cleanup.lock"),
    randomToken: () => "cleanup-owner-abcdefghijkl",
    tempParent: path.dirname(install.prefix),
    output: capture().output,
    errorOutput: errorOutput.output,
    warningOutput: warnings.output
  });
  assert.equal(result.status, "updated", `${errorOutput.value}\n${warnings.value}`);
  assert.match(warnings.value, /temporary update cleanup/);
});

test("a workspace whose cache creation fails is cleaned before returning", async (t) => {
  const install = await createInstall(t);
  const partialDirectory = path.join(path.dirname(install.prefix), "partial-workspace");
  const removed = [];
  const errorOutput = capture();
  const result = await runUpdate([], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    platform: "darwin",
    npmExecutable: "/fake/npm",
    runner: { async run() { throw new Error("runner must not be reached"); } },
    fs: {
      async mkdtemp() { return partialDirectory; },
      async mkdir() { throw new Error("cache directory denied"); },
      async rm(directory) { removed.push(directory); }
    },
    lockPath: path.join(path.dirname(install.prefix), "partial-workspace.lock"),
    randomToken: () => "partial-workspace-owner-abcdefghijkl",
    tempParent: path.dirname(install.prefix),
    output: capture().output,
    errorOutput: errorOutput.output
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(removed, [partialDirectory]);
});

test("invalid update arguments fail before a runner can be called and do not echo the value", async (t) => {
  const install = await createInstall(t);
  const sentinel = "CMR_UPDATE_SENTINEL_DO_NOT_PRINT";
  let called = false;
  const errorOutput = capture();
  const result = await runUpdate(["--url", sentinel], {
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    currentVersion: "1.2.1",
    runner: { run: async () => { called = true; } },
    errorOutput: errorOutput.output
  });
  assert.equal(result.exitCode, 1);
  assert.match(errorOutput.value, /usage: cmr update/);
  assert.equal(called, false);
  assert.doesNotMatch(errorOutput.value, new RegExp(sentinel));
});
