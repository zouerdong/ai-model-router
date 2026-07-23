import { spawn as nodeSpawn } from "node:child_process";
import { buildSpawnSpec, findClaudeExecutable } from "./platform.js";

const SIGNAL_EXIT_CODES = Object.freeze({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });

export function signalExitCode(signal) {
  return SIGNAL_EXIT_CODES[signal] ?? 1;
}

export function installSignalForwarding(child, processLike = process) {
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => {
      if (child.exitCode == null && child.signalCode == null) {
        try {
          child.kill(signal);
        } catch {
          // The child may have exited between the state check and kill call.
        }
      }
    };
    handlers.set(signal, handler);
    processLike.on(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) processLike.removeListener(signal, handler);
  };
}

export function runChild({ command, args = [], options = {}, spawnImpl = nodeSpawn, processLike = process }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, options);
    } catch (error) {
      reject(error);
      return;
    }
    const cleanupSignals = installSignalForwarding(child, processLike);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanupSignals();
      resolve(value);
    };
    child.once("error", (error) => {
      cleanupSignals();
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("exit", (code, signal) => finish(code ?? signalExitCode(signal)));
  });
}

export async function runClaude({
  env,
  cwd = process.cwd(),
  executable,
  executableArgs = [],
  claudeArgs = [],
  platform = process.platform,
  spawnImpl = nodeSpawn,
  processLike = process,
  stdio = "inherit"
}) {
  const resolved = executable ?? await findClaudeExecutable({ platform, env });
  if (!resolved) throw new Error("Claude Code executable was not found on PATH");
  const spec = buildSpawnSpec(resolved, { platform, env });
  return runChild({
    command: spec.command,
    args: [...spec.args, ...executableArgs, ...claudeArgs],
    options: {
      ...spec.options,
      cwd,
      env,
      stdio
    },
    spawnImpl,
    processLike
  });
}
