import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CMR_PACKAGE_NAME,
  compareStableVersions,
  inspectCurrentInstallation,
  parseNpmPackMetadata,
  parseStableVersion,
  planUpdate
} from "../src/updater.js";

test("parses and compares strict stable SemVer without numeric overflow", () => {
  assert.equal(parseStableVersion("0.0.0").major, 0n);
  assert.equal(compareStableVersions("1.10.0", "1.9.99"), 1);
  assert.equal(compareStableVersions("999999999999999999.0.0", "1.0.0"), 1);
  assert.equal(planUpdate("1.3.0", "1.3.0"), "same");
  assert.equal(planUpdate("1.3.0", "1.4.0"), "upgrade");
  assert.equal(planUpdate("1.3.0", "1.2.9"), "candidate-older");

  for (const value of ["v1.2.3", "1.2", "1.2.3-beta.1", "1.2.3+build", " 1.2.3", "01.2.3", "1.02.3", "1.2.03", "1.2.3 ", "1.9999999999999999999.0"]) {
    assert.throws(() => parseStableVersion(value), /stable|version/);
  }
});

test("parses one npm pack metadata item and confines the tarball to the temp directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cmr-updater-metadata-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tarballPath = path.join(directory, "claude-model-router-1.3.0.tgz");
  await writeFile(tarballPath, "fake tgz");
  const metadata = parseNpmPackMetadata(JSON.stringify([{
    name: CMR_PACKAGE_NAME,
    version: "1.3.0",
    filename: tarballPath,
    integrity: "sha512-test"
  }]), { expectedDirectory: directory });
  assert.equal(metadata.name, CMR_PACKAGE_NAME);
  assert.equal(metadata.version, "1.3.0");
  assert.equal(metadata.tarballPath, tarballPath);
  assert.equal(metadata.integrity, "sha512-test");

  const bad = (item, options = {}) => assert.throws(
    () => parseNpmPackMetadata(JSON.stringify(item), { expectedDirectory: directory, ...options }),
    /metadata|tarball|filename|version|package name|directory|unpacked|size/
  );
  bad({});
  bad([{ name: CMR_PACKAGE_NAME, version: "1.3.0", filename: tarballPath }, { name: CMR_PACKAGE_NAME, version: "1.3.0", filename: tarballPath }]);
  bad([{ name: "other", version: "1.3.0", filename: tarballPath }]);
  bad([{ name: CMR_PACKAGE_NAME, version: "1.3.0-beta.1", filename: tarballPath }]);
  bad([{ name: CMR_PACKAGE_NAME, version: "1.3.0", filename: path.join(directory, "..", "escape.tgz") }]);
  bad([{ name: CMR_PACKAGE_NAME, version: "1.3.0", filename: path.join(directory, "missing.tgz") }]);
  bad([{ name: CMR_PACKAGE_NAME, version: "1.3.0", filename: tarballPath }], { maxTarballBytes: 1 });
  bad([{
    name: CMR_PACKAGE_NAME,
    version: "1.3.0",
    filename: tarballPath,
    unpackedSize: 10
  }], { maxUnpackedBytes: 9 });

  const linkPath = path.join(directory, "linked.tgz");
  await symlink(tarballPath, linkPath);
  bad([{ name: CMR_PACKAGE_NAME, version: "1.3.0", filename: linkPath }]);
});

async function createUnixInstall(t, { linked = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "cmr-updater-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prefix = path.join(root, "prefix");
  const sourceRoot = path.join(root, "checkout");
  const packageRoot = path.join(prefix, "lib", "node_modules", CMR_PACKAGE_NAME);
  const actualRoot = linked ? sourceRoot : packageRoot;
  await mkdir(path.join(prefix, "bin"), { recursive: true });
  await mkdir(path.dirname(packageRoot), { recursive: true });
  await mkdir(path.join(actualRoot, "src"), { recursive: true });
  await writeFile(path.join(actualRoot, "package.json"), JSON.stringify({ name: CMR_PACKAGE_NAME, version: "1.3.0" }));
  await writeFile(path.join(actualRoot, "src", "cli.js"), "#!/usr/bin/env node\n");
  if (linked) await symlink(sourceRoot, packageRoot, "dir");
  const commandPath = path.join(prefix, "bin", "cmr");
  await symlink(path.relative(path.dirname(commandPath), path.join(packageRoot, "src", "cli.js")), commandPath);
  return { prefix, packageRoot, commandPath, modulePath: path.join(actualRoot, "src", "cli.js") };
}

test("recognizes an entity Unix global package and derives its custom prefix", async (t) => {
  const install = await createUnixInstall(t);
  const result = inspectCurrentInstallation({
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    platform: "darwin"
  });
  assert.equal(result.kind, "global-package");
  assert.equal(result.prefix, install.prefix);
  assert.equal(result.packageRoot, install.packageRoot);
  assert.equal(result.currentVersion, "1.3.0");
  const moduleEntry = inspectCurrentInstallation({
    entryPath: install.modulePath,
    modulePath: install.modulePath,
    platform: "darwin"
  });
  assert.equal(moduleEntry.kind, "global-package");
  assert.equal(moduleEntry.commandPath, install.commandPath);
});

test("rejects a source-linked Unix package before any update write", async (t) => {
  const install = await createUnixInstall(t, { linked: true });
  const result = inspectCurrentInstallation({
    entryPath: install.commandPath,
    modulePath: install.modulePath,
    platform: "darwin"
  });
  assert.equal(result.kind, "source-link");
  assert.match(result.reason, /symlink|junction/);
});

test("rejects direct checkout execution and unrelated command paths", async (t) => {
  const install = await createUnixInstall(t);
  const checkoutCli = path.join(path.dirname(install.prefix), "checkout", "src", "cli.js");
  assert.equal(inspectCurrentInstallation({ entryPath: checkoutCli, modulePath: checkoutCli, platform: "darwin" }).kind, "unsupported");
  assert.equal(inspectCurrentInstallation({ entryPath: path.join(install.prefix, "bin", "other"), modulePath: install.modulePath, platform: "darwin" }).kind, "unsupported");
});

test("recognizes the Windows Node argv entry and npm cmd shim, and rejects a junction package root", () => {
  const prefix = "C:\\Users\\Tester\\AppData\\Roaming\\npm";
  const packageRoot = `${prefix}\\node_modules\\${CMR_PACKAGE_NAME}`;
  const modulePath = `${packageRoot}\\src\\cli.js`;
  const commandPath = `${prefix}\\cmr.cmd`;
  const packageJsonPath = `${packageRoot}\\package.json`;
  const fs = {
    lstatSync(value) {
      if (value === packageRoot) return { isSymbolicLink: () => false, isDirectory: () => true };
      if (value === commandPath) return { isSymbolicLink: () => false, isFile: () => true };
      return { isSymbolicLink: () => false, isDirectory: () => false };
    },
    readFileSync(value) {
      if (value === packageJsonPath) return JSON.stringify({ name: CMR_PACKAGE_NAME, version: "1.3.0" });
      if (value === commandPath) return "@ECHO off\r\n\"%dp0%\\node.exe\" \"%dp0%\\node_modules\\claude-model-router\\src\\cli.js\" %*\r\n";
      throw new Error(`unexpected read: ${value}`);
    },
    realpathSync(value) { return value; }
  };
  const result = inspectCurrentInstallation({ entryPath: commandPath, modulePath, platform: "win32", fs });
  assert.equal(result.kind, "global-package");
  assert.equal(result.prefix, prefix);
  const argvResult = inspectCurrentInstallation({ entryPath: modulePath, modulePath, platform: "win32", fs });
  assert.equal(argvResult.kind, "global-package");
  assert.equal(argvResult.commandPath, commandPath);

  const unrelatedShimFs = {
    ...fs,
    readFileSync(value) {
      if (value === commandPath) return "@ECHO off\r\nnode C:\\other\\cli.js %*\r\n";
      return fs.readFileSync(value);
    }
  };
  assert.equal(
    inspectCurrentInstallation({ entryPath: modulePath, modulePath, platform: "win32", fs: unrelatedShimFs }).kind,
    "unsupported"
  );

  const junctionFs = { ...fs, lstatSync(value) {
    if (value === packageRoot) return { isSymbolicLink: () => true, isDirectory: () => false };
    return fs.lstatSync(value);
  } };
  assert.equal(inspectCurrentInstallation({ entryPath: commandPath, modulePath, platform: "win32", fs: junctionFs }).kind, "source-link");
});
