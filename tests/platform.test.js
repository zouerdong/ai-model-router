import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { findClaudeExecutable } from "../src/platform.js";

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
