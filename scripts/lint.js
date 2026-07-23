#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directories = ["src", "tests", "scripts"];
const files = [];

function collect(directory) {
  for (const entry of readdirSync(path.join(root, directory))) {
    const fullPath = path.join(root, directory, entry);
    if (statSync(fullPath).isDirectory()) collect(path.join(directory, entry));
    else if (fullPath.endsWith(".js")) files.push(fullPath);
  }
}

for (const directory of directories) collect(directory);

let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
