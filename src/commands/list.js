import { loadConfigSet } from "../config/loader.js";
import { getEnvironmentSnapshot } from "../environment.js";

export async function formatList(options = {}) {
  const config = await loadConfigSet(options);
  const providers = new Map(config.providers.map((provider) => [provider.id, provider]));
  const pricing = new Map(config.pricing.map((item) => [item.id, item]));
  const output = ["Profiles:"];
  for (const profile of config.profiles) {
    const provider = providers.get(profile.provider);
    const price = pricing.get(profile.pricingRef);
    output.push(`- ${profile.id}: ${profile.displayName}`);
    output.push(`  aliases: ${profile.aliases.join(", ")}`);
    output.push(`  provider: ${provider.displayName}`);
    output.push(`  base URL: ${provider.baseUrl}`);
    output.push(`  purpose: ${profile.purpose}`);
    output.push(`  cost notice: ${profile.costNotice}; pricing verified: ${price.verifiedOn}`);
    output.push("  environment:");
    const snapshot = getEnvironmentSnapshot({ ...profile.environment, ANTHROPIC_BASE_URL: provider.baseUrl });
    for (const [key, value] of Object.entries(snapshot)) {
      if (key.startsWith("has")) continue;
      output.push(`    ${key}=${value}`);
    }
  }
  return output.join("\n");
}
