/**
 * ASR Provider Factory
 * Creates and manages ASR provider instances
 */

import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type { AsrProvider, AsrProviderClient } from "../types/asr.js";
import { NvidiaAsrProvider } from "./nvidia.js";
import { OpenAIAsrProvider } from "./openai.js";
import { DeepgramAsrProvider } from "./deepgram.js";
import { GroqAsrProvider } from "./groq.js";
import { LocalWhisperAsrProvider } from "./local-whisper.js";
import { MlxWhisperAsrProvider } from "./mlx-whisper.js";

export { BaseAsrProvider } from "./base.js";
export { NvidiaAsrProvider } from "./nvidia.js";
export { OpenAIAsrProvider } from "./openai.js";
export { DeepgramAsrProvider } from "./deepgram.js";
export { GroqAsrProvider } from "./groq.js";
export { LocalWhisperAsrProvider } from "./local-whisper.js";
export { MlxWhisperAsrProvider } from "./mlx-whisper.js";

// Singleton provider instances
const providers: Map<AsrProvider, AsrProviderClient> = new Map();

/**
 * Get or create a provider instance
 */
export function getProvider(provider?: AsrProvider): AsrProviderClient {
  const providerName = provider ?? config.asrProvider;

  // Return cached instance if available
  let instance = providers.get(providerName);
  if (instance) {
    return instance;
  }

  // Create new instance
  instance = createProvider(providerName);
  providers.set(providerName, instance);

  logger.info({ provider: providerName }, "Created ASR provider instance");

  return instance;
}

/**
 * Create a new provider instance
 */
export function createProvider(provider: AsrProvider): AsrProviderClient {
  switch (provider) {
    case "nvidia":
      return new NvidiaAsrProvider();
    case "openai":
      return new OpenAIAsrProvider();
    case "deepgram":
      return new DeepgramAsrProvider();
    case "groq":
      return new GroqAsrProvider();
    case "local-whisper":
      return new LocalWhisperAsrProvider();
    case "mlx-whisper":
      return new MlxWhisperAsrProvider();
    default:
      throw new Error(`Unknown ASR provider: ${provider}`);
  }
}

/**
 * Get all available (configured) providers
 */
export function getAvailableProviders(): AsrProviderClient[] {
  const allProviders: AsrProvider[] = [
    "nvidia",
    "openai",
    "deepgram",
    "groq",
    "local-whisper",
    "mlx-whisper",
  ];

  return allProviders
    .map((name) => {
      try {
        return createProvider(name);
      } catch {
        return null;
      }
    })
    .filter((p): p is AsrProviderClient => p !== null && p.isConfigured());
}

/**
 * Get list of provider names that are configured
 */
export function getConfiguredProviderNames(): AsrProvider[] {
  const allProviders: AsrProvider[] = [
    "nvidia",
    "openai",
    "deepgram",
    "groq",
    "local-whisper",
    "mlx-whisper",
  ];

  return allProviders.filter((name) => {
    try {
      const provider = createProvider(name);
      return provider.isConfigured();
    } catch {
      return false;
    }
  });
}

/**
 * Clear all cached provider instances (useful for testing)
 */
export function clearProviderCache(): void {
  providers.clear();
}

/**
 * Default provider instance based on configuration
 */
export const defaultProvider = getProvider();
