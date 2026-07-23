const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|authorization|credential)/i;

export function redactString(value, secrets = []) {
  let result = String(value);
  const orderedSecrets = [...new Set(secrets.filter((secret) => typeof secret === "string" && secret.length > 0))]
    .sort((left, right) => right.length - left.length);
  for (const secret of orderedSecrets) {
    result = result.split(secret).join("<redacted>");
  }
  return result;
}

export function redactValue(value, secrets = []) {
  if (typeof value === "string") return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "<redacted>" : redactValue(child, secrets);
    }
    return output;
  }
  return value;
}

export function redactError(error, secrets = []) {
  const message = error instanceof Error ? error.message : String(error);
  return redactString(message, secrets);
}
