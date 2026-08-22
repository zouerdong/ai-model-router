import { spawn as nodeSpawn } from "node:child_process";
import { installSignalForwarding, signalExitCode } from "./launcher.js";
import { buildCommandSpawnSpec } from "./platform.js";
import { ROUTER_MANAGED_ENV_VARS, removeEnvironmentKeys } from "./environment.js";

export class CommandRunnerError extends Error {
  constructor(message, { cause, exitCode, signal, code } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CommandRunnerError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.code = code;
  }
}

export function removeRouterEnvironmentVariables(parentEnv = process.env, managedKeys = ROUTER_MANAGED_ENV_VARS) {
  const managed = new Set(managedKeys.map((key) => key.toLowerCase()));
  return removeEnvironmentKeys(parentEnv, (key) => managed.has(key.toLowerCase()));
}

export function runCommand({
  executable,
  args = [],
  platform = process.platform,
  env = process.env,
  cwd = process.cwd(),
  capture = true,
  maxOutputBytes = Number.POSITIVE_INFINITY,
  timeoutMs,
  spawnImpl = nodeSpawn,
  processLike = process
} = {}) {
  if (!(maxOutputBytes === Number.POSITIVE_INFINITY
    || (Number.isInteger(maxOutputBytes) && maxOutputBytes > 0))) {
    throw new TypeError("maxOutputBytes must be a positive integer or Infinity");
  }
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new TypeError("timeoutMs must be a positive integer");
  }
  const spec = buildCommandSpawnSpec(executable, { platform, env, args });
  const options = {
    ...spec.options,
    cwd,
    env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  };
  if (timeoutMs !== undefined) {
    options.timeout = timeoutMs;
    options.killSignal = "SIGTERM";
  }
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(spec.command, spec.args, options);
    } catch (error) {
      reject(new CommandRunnerError("command could not be started", { cause: error }));
      return;
    }

    let forwardedSignal = null;
    const cleanupSignals = installSignalForwarding(child, processLike, (signal) => {
      forwardedSignal ??= signal;
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let captureError = null;
    const captureChunk = (target, chunk, streamName) => {
      if (captureError) return;
      const buffer = Buffer.from(chunk);
      if (streamName === "stdout") stdoutBytes += buffer.length;
      else stderrBytes += buffer.length;
      if ((streamName === "stdout" ? stdoutBytes : stderrBytes) > maxOutputBytes) {
        captureError = new CommandRunnerError(`command ${streamName} exceeded the capture limit`, {
          code: "output-limit"
        });
        try {
          child.kill("SIGTERM");
        } catch {
          // The child may have exited between the data event and the kill attempt.
        }
        return;
      }
      target.push(buffer);
    };
    if (capture) {
      child.stdout?.on("data", (chunk) => captureChunk(stdout, chunk, "stdout"));
      child.stderr?.on("data", (chunk) => captureChunk(stderr, chunk, "stderr"));
    }
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanupSignals();
      if (captureError) {
        reject(captureError);
        return;
      }
      resolve({
        ...result,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    };
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanupSignals();
      reject(new CommandRunnerError("command failed to start", { cause: error }));
    });
    child.once("exit", (code, signal) => {
      const effectiveSignal = signal ?? forwardedSignal;
      finish({
        exitCode: forwardedSignal ? signalExitCode(forwardedSignal) : (code ?? signalExitCode(signal)),
        signal: effectiveSignal ?? null
      });
    });
  });
}

export function createCommandRunner(options = {}) {
  return {
    run(commandOptions) {
      return runCommand({ ...options, ...commandOptions });
    }
  };
}
