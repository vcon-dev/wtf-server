import { z } from "zod";

const ConfigSchema = z.object({
  // Server
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  logLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // NVIDIA NIM ASR
  nimAsrUrl: z.string().url().default("http://localhost:9000"),
  nimApiKey: z.string().optional(),
  nimDefaultModel: z
    .enum([
      "parakeet-ctc-1.1b",
      "parakeet-ctc-0.6b",
      "parakeet-rnnt-1.1b",
      "parakeet-rnnt-0.6b",
      "parakeet-tdt-1.1b",
      "parakeet-tdt-0.6b",
      "canary-1b",
      "canary-0.6b",
    ])
    .default("parakeet-tdt-1.1b"),
  nimTimeoutMs: z.coerce.number().int().positive().default(300000),

  // Limits
  maxAudioSizeMb: z.coerce.number().positive().default(100),
  maxVconSizeMb: z.coerce.number().positive().default(200),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const env = process.env;

  const rawConfig = {
    port: env["PORT"],
    host: env["HOST"],
    logLevel: env["LOG_LEVEL"],
    nimAsrUrl: env["NIM_ASR_URL"],
    nimApiKey: env["NIM_API_KEY"],
    nimDefaultModel: env["NIM_DEFAULT_MODEL"],
    nimTimeoutMs: env["NIM_TIMEOUT_MS"],
    maxAudioSizeMb: env["MAX_AUDIO_SIZE_MB"],
    maxVconSizeMb: env["MAX_VCON_SIZE_MB"],
  };

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}

export const config = loadConfig();
