import type { AIProvider } from "./types";
import { GeminiProvider } from "./providers/gemini";

type ProviderFactory = (apiKey: string, modelName: string) => AIProvider;

const providerFactories: Record<string, ProviderFactory> = {
  gemini: (apiKey, modelName) => new GeminiProvider(apiKey, modelName),
  // Future providers:
  // openai: (apiKey, modelName) => new OpenAIProvider(apiKey, modelName),
  // anthropic: (apiKey, modelName) => new AnthropicProvider(apiKey, modelName),
};

const apiKeyEnvVars: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export function getProvider(providerName: string, modelName: string): AIProvider {
  const factory = providerFactories[providerName];
  if (!factory) {
    throw new Error(`Unknown AI provider: ${providerName}. Available: ${Object.keys(providerFactories).join(", ")}`);
  }

  const envVar = apiKeyEnvVars[providerName];
  const apiKey = process.env[envVar];
  if (!apiKey) {
    throw new Error(`Missing API key for provider "${providerName}". Set the ${envVar} environment variable.`);
  }

  return factory(apiKey, modelName);
}

export function getAvailableProviders(): string[] {
  return Object.keys(providerFactories);
}
