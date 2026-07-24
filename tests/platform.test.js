import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildCommandSpawnSpec, findClaudeExecutable, findNpmExecutable } from "../src/platform.js";

test("Windows executable discovery reads PATH with arbitrary casing", async () => {
  const directory = path.win32.join("C:", "Tools", "Claude");
  const expected = path.win32.join(directory, "claude.exe");
  const visited = [];
  const result = await findClaudeExecutable({
    platform: "win32",
    env: { pAtH: directory, USERPROFILE: path.win32.join("C:", "Users", "Tester") },
    fsAccess: async (candidate) => {
      visited.push(candidate);
      return candidate === expected;
    }
  });

  assert.equal(result, expected);
  assert.equal(visited[0], expected);
});

test("Windows executable discovery falls back to the native installer directory", async () => {
  const home = path.win32.join("C:", "Users", "Tester");
  const expected = path.win32.join(home, ".local", "bin", "claude.exe");
  const result = await findClaudeExecutable({
    platform: "win32",
    env: { USERPROFILE: home },
    fsAccess: async (candidate) => candidate === expected
  });

  assert.equal(result, expected);
});

test("explicit pathValue takes priority over environment PATH variants", async () => {
  const explicitDirectory = path.win32.join("C:", "Explicit");
  const expected = path.win32.join(explicitDirectory, "claude.cmd");
  const result = await findClaudeExecutable({
    platform: "win32",
    env: {
      Path: path.win32.join("C:", "Environment"),
      USERPROFILE: path.win32.join("C:", "Users", "Tester")
    },
    pathValue: explicitDirectory,
    fsAccess: async (candidate) => candidate === expected
  });

  assert.equal(result, expected);
});

test("finds npm from the active PATH with platform-specific executable names", async () => {
  const unixDirectory = "/opt/node/bin";
  const unixNpm = path.posix.join(unixDirectory, "npm");
  assert.equal(await findNpmExecutable({
    platform: "darwin",
    env: { PATH: `/other/bin:${unixDirectory}` },
    fsAccess: async (candidate) => candidate === unixNpm
  }), unixNpm);

  const windowsDirectory = path.win32.join("C:", "Program Files", "nodejs");
  const expected = path.win32.join(windowsDirectory, "npm.cmd");
  assert.equal(await findNpmExecutable({
    platform: "win32",
    env: { pAtH: `${path.win32.join("C:", "Other")};${windowsDirectory}` },
    fsAccess: async (candidate) => candidate === expected
  }), expected);
});

test("builds argv-array command specs without shell mode", () => {
  const unix = buildCommandSpawnSpec("/path with spaces/npm", {
    platform: "darwin",
    args: ["pack", "value with spaces", "-p"]
  });
  assert.deepEqual(unix, {
    command: "/path with spaces/npm",
    args: ["pack", "value with spaces", "-p"],
    options: { shell: false }
  });

  const windows = buildCommandSpawnSpec("C:\\Program Files\\nodejs\\npm.cmd", {
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    args: ["install", "--prefix", "C:\\Path With Spaces"]
  });
  assert.deepEqual(windows, {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/c", "C:\\Program Files\\nodejs\\npm.cmd", "install", "--prefix", "C:\\Path With Spaces"],
    options: { shell: false }
  });
});
