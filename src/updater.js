import * as defaultFs from "node:fs";
import path from "node:path";

export const CMR_PACKAGE_NAME = "claude-model-router";
export const LATEST_RELEASE_ASSET_URL = "https://github.com/zouerdong/ai-model-router/releases/latest/download/claude-model-router.tgz";
export const LATEST_RELEASE_SUMS_URL = "https://github.com/zouerdong/ai-model-router/releases/latest/download/SHA256SUMS";
export const DEFAULT_PACK_METADATA_MAX_BYTES = 64 * 1024;
export const DEFAULT_TARBALL_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_UNPACKED_MAX_BYTES = 200 * 1024 * 1024;
export const MAX_VERSION_COMPONENT_DIGITS = 18;

const VERSION_COMPONENT = `(?:0|[1-9]\\d{0,${MAX_VERSION_COMPONENT_DIGITS - 1}})`;
const STABLE_VERSION_PATTERN = new RegExp(`^(${VERSION_COMPONENT})\\.(${VERSION_COMPONENT})\\.(${VERSION_COMPONENT})$`);
// cmd.exe metacharacters (or %VAR% expansion) in an npm-reported filename would be reinterpreted
// once the tarball path reaches npm on Windows; path separators and spaces stay allowed.
const DANGEROUS_FILENAME_PATTERN = /[\u0000-\u001F\u007F&|^%!<>()'"=;,]/;

function reject(message) {
  throw new TypeError(message);
}

function pathApiFor(platform) {
  return platform === "win32" ? path.win32 : path;
}

function normalizePath(value, pathApi) {
  return pathApi.resolve(value);
}

function pathsEqual(left, right, platform) {
  if (platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function pathInside(directory, candidate, pathApi) {
  const relative = pathApi.relative(directory, candidate);
  return relative !== ""
    && !relative.startsWith(`..${pathApi.sep}`)
    && relative !== ".."
    && !pathApi.isAbsolute(relative);
}

function readPackageJson(packageRoot, fsApi, pathApi) {
  const packagePath = pathApi.join(packageRoot, "package.json");
  let value;
  try {
    value = JSON.parse(fsApi.readFileSync(packagePath, "utf8"));
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.name !== CMR_PACKAGE_NAME || typeof value.version !== "string") return null;
  try {
    parseStableVersion(value.version);
  } catch {
    return null;
  }
  return { name: value.name, version: value.version };
}

function packageRootFromCliPath(cliPath, pathApi) {
  if (pathApi.basename(cliPath).toLowerCase() !== "cli.js") return null;
  const sourceDirectory = pathApi.dirname(cliPath);
  if (pathApi.basename(sourceDirectory).toLowerCase() !== "src") return null;
  const packageRoot = pathApi.dirname(sourceDirectory);
  if (pathApi.basename(packageRoot).toLowerCase() !== CMR_PACKAGE_NAME) return null;
  if (pathApi.basename(pathApi.dirname(packageRoot)).toLowerCase() !== "node_modules") return null;
  return packageRoot;
}

function globalLayoutFromPackageRoot(packageRoot, platform, pathApi) {
  const nodeModules = pathApi.dirname(packageRoot);
  if (platform === "win32") {
    const prefix = pathApi.dirname(nodeModules);
    return { prefix, commandPath: pathApi.join(prefix, "cmr.cmd") };
  }
  const libraryDirectory = pathApi.dirname(nodeModules);
  if (pathApi.basename(libraryDirectory) !== "lib") return null;
  const prefix = pathApi.dirname(libraryDirectory);
  return { prefix, commandPath: pathApi.join(prefix, "bin", "cmr") };
}

function commandMapsToPackage({ commandPath, expectedModulePath, platform, fsApi }) {
  let commandStat;
  try {
    commandStat = fsApi.lstatSync(commandPath);
  } catch {
    return false;
  }
  if (platform === "win32") {
    if (!commandStat?.isFile?.() || commandStat.isSymbolicLink?.()) return false;
    let text;
    try {
      text = fsApi.readFileSync(commandPath, "utf8");
    } catch {
      return false;
    }
    const normalized = String(text).replaceAll("\\", "/").toLowerCase();
    return normalized.includes("/node_modules/claude-model-router/src/cli.js");
  }
  if (!commandStat?.isSymbolicLink?.()) return false;
  try {
    return fsApi.realpathSync(commandPath) === fsApi.realpathSync(expectedModulePath);
  } catch {
    return false;
  }
}

export function parseStableVersion(value) {
  if (typeof value !== "string") reject("version must be a string");
  const match = value.match(STABLE_VERSION_PATTERN);
  if (!match) reject("version must be a stable X.Y.Z SemVer without a prefix or metadata");
  return Object.freeze({
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    value
  });
}

export function compareStableVersions(left, right) {
  const leftVersion = typeof left === "string" ? parseStableVersion(left) : left;
  const rightVersion = typeof right === "string" ? parseStableVersion(right) : right;
  for (const key of ["major", "minor", "patch"]) {
    if (leftVersion[key] > rightVersion[key]) return 1;
    if (leftVersion[key] < rightVersion[key]) return -1;
  }
  return 0;
}

export function planUpdate(currentVersion, candidateVersion) {
  const comparison = compareStableVersions(candidateVersion, currentVersion);
  if (comparison === 0) return "same";
  if (comparison > 0) return "upgrade";
  return "candidate-older";
}

export function parseNpmPackMetadata(
  stdout,
  {
    expectedName = CMR_PACKAGE_NAME,
    expectedDirectory,
    maxBytes = DEFAULT_PACK_METADATA_MAX_BYTES,
    maxTarballBytes = DEFAULT_TARBALL_MAX_BYTES,
    maxUnpackedBytes = DEFAULT_UNPACKED_MAX_BYTES,
    fs: fsApi = defaultFs,
    pathApi = path
  } = {}
) {
  if (typeof stdout !== "string") reject("npm pack metadata must be text");
  if (typeof expectedDirectory !== "string" || expectedDirectory.length === 0) {
    reject("expectedDirectory is required");
  }
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) reject("maxBytes must be a positive integer");
  if (!Number.isInteger(maxTarballBytes) || maxTarballBytes <= 0) reject("maxTarballBytes must be a positive integer");
  if (!Number.isInteger(maxUnpackedBytes) || maxUnpackedBytes <= 0) reject("maxUnpackedBytes must be a positive integer");
  if (Buffer.byteLength(stdout, "utf8") > maxBytes) reject("npm pack metadata is too large");

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    reject("npm pack metadata is not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) reject("npm pack metadata must contain exactly one item");
  const item = parsed[0];
  if (item === null || typeof item !== "object" || Array.isArray(item)) reject("npm pack metadata item is invalid");
  if (item.name !== expectedName) reject("npm pack metadata has an unexpected package name");
  if (typeof item.version !== "string") reject("npm pack metadata is missing a version");
  parseStableVersion(item.version);
  if (typeof item.filename !== "string" || item.filename.length === 0) reject("npm pack metadata is missing a filename");
  if (DANGEROUS_FILENAME_PATTERN.test(item.filename) || !item.filename.toLowerCase().endsWith(".tgz")) {
    reject("npm pack metadata filename is invalid");
  }

  const directory = pathApi.resolve(expectedDirectory);
  const tarballPath = pathApi.isAbsolute(item.filename)
    ? pathApi.resolve(item.filename)
    : pathApi.resolve(directory, item.filename);
  if (!pathInside(directory, tarballPath, pathApi)) reject("npm pack tarball escapes its temporary directory");

  let stat;
  try {
    stat = fsApi.lstatSync(tarballPath);
  } catch {
    reject("npm pack tarball is missing");
  }
  if (!stat || typeof stat.isFile !== "function" || !stat.isFile()) reject("npm pack tarball is not a regular file");
  if (typeof stat.isSymbolicLink === "function" && stat.isSymbolicLink()) reject("npm pack tarball must not be a symlink");
  if (!Number.isFinite(stat.size) || stat.size < 0 || stat.size > maxTarballBytes) {
    reject("npm pack tarball size is invalid");
  }
  if (item.unpackedSize !== undefined
    && (!Number.isSafeInteger(item.unpackedSize) || item.unpackedSize < 0 || item.unpackedSize > maxUnpackedBytes)) {
    reject("npm pack unpacked size is invalid");
  }

  const result = {
    name: item.name,
    version: item.version,
    filename: item.filename,
    tarballPath
  };
  for (const key of ["integrity", "shasum"]) {
    if (item[key] !== undefined) {
      if (typeof item[key] !== "string" || item[key].length === 0) reject(`npm pack metadata ${key} is invalid`);
      result[key] = item[key];
    }
  }
  return result;
}

function unsupported(reason, details = {}) {
  return { kind: "unsupported", reason, ...details };
}

export function inspectCurrentInstallation({
  entryPath,
  modulePath,
  platform = process.platform,
  fs: fsApi = defaultFs,
  pathApi = pathApiFor(platform)
} = {}) {
  if (platform !== "darwin" && platform !== "win32") return unsupported("unsupported platform");
  if (typeof entryPath !== "string" || typeof modulePath !== "string") return unsupported("current command path is unavailable");

  const normalizedEntryPath = normalizePath(entryPath, pathApi);
  const loadedModulePath = normalizePath(modulePath, pathApi);
  const commandName = pathApi.basename(normalizedEntryPath).toLowerCase();
  let prefix;
  let packageRoot;
  let commandPath;

  const packageRootFromEntry = packageRootFromCliPath(normalizedEntryPath, pathApi);
  if (packageRootFromEntry) {
    const layout = globalLayoutFromPackageRoot(packageRootFromEntry, platform, pathApi);
    if (!layout) return unsupported("current package is not in an npm global layout");
    packageRoot = packageRootFromEntry;
    prefix = layout.prefix;
    commandPath = layout.commandPath;
  }

  if (!packageRoot && platform === "win32") {
    if (!new Set(["cmr.cmd", "cmr.bat", "cmr.ps1", "cmr"]).has(commandName)) {
      return unsupported("current command is not an npm CMR shim", { commandPath: normalizedEntryPath });
    }
    prefix = pathApi.dirname(normalizedEntryPath);
    packageRoot = pathApi.join(prefix, "node_modules", CMR_PACKAGE_NAME);
    commandPath = pathApi.join(prefix, "cmr.cmd");
  } else if (!packageRoot) {
    if (commandName !== "cmr" || !pathsEqual(pathApi.basename(pathApi.dirname(normalizedEntryPath)), "bin", platform)) {
      return unsupported("current command is not an npm CMR bin", { commandPath: normalizedEntryPath });
    }
    commandPath = normalizedEntryPath;
    prefix = pathApi.dirname(pathApi.dirname(commandPath));
    packageRoot = pathApi.join(prefix, "lib", "node_modules", CMR_PACKAGE_NAME);
  }

  const packageInfo = readPackageJson(packageRoot, fsApi, pathApi);
  if (!packageInfo) return unsupported("current package metadata is missing or invalid", { prefix, commandPath, packageRoot });

  let rootStat;
  try {
    rootStat = fsApi.lstatSync(packageRoot);
  } catch {
    return unsupported("current package root is missing", { prefix, commandPath, packageRoot, currentVersion: packageInfo.version });
  }
  const details = {
    prefix,
    commandPath,
    packageRoot,
    packageName: packageInfo.name,
    currentVersion: packageInfo.version
  };
  if (rootStat?.isSymbolicLink?.()) return { kind: "source-link", ...details, reason: "package root is a symlink or junction" };
  if (!rootStat?.isDirectory?.()) return unsupported("current package root is not a directory", details);

  const expectedModulePath = pathApi.join(packageRoot, "src", "cli.js");
  let moduleMatches = pathsEqual(loadedModulePath, expectedModulePath, platform);
  if (!moduleMatches) {
    try {
      moduleMatches = pathsEqual(fsApi.realpathSync(loadedModulePath), fsApi.realpathSync(expectedModulePath), platform);
    } catch {
      moduleMatches = false;
    }
  }
  if (!moduleMatches) return unsupported("current command does not map to this package", details);
  if (!commandMapsToPackage({ commandPath, expectedModulePath, platform, fsApi })) {
    return unsupported("current command shim does not map to this package", details);
  }

  return { kind: "global-package", ...details };
}
