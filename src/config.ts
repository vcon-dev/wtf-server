import { z } from "zod";

const AsrProviderSchema = z.enum([
  "nvidia",
  "openai",
  "deepgram",
  "groq",
  "local-whisper",
  "mlx-whisper",
]);

const ConfigSchema = z.object({
  // Server
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  logLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Default ASR Provider
  asrProvider: AsrProviderSchema.default("nvidia"),

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

  // OpenAI Whisper API
  openaiApiKey: z.string().optional(),
  openaiBaseUrl: z.string().url().optional(),
  openaiModel: z.enum(["whisper-1"]).default("whisper-1"),
  openaiTimeoutMs: z.coerce.number().int().positive().default(300000),

  // Deepgram
  deepgramApiKey: z.string().optional(),
  deepgramModel: z
    .enum(["nova-2", "nova", "enhanced", "base"])
    .default("nova-2"),
  deepgramTimeoutMs: z.coerce.number().int().positive().default(300000),

  // Groq (Whisper)
  groqApiKey: z.string().optional(),
  groqModel: z
    .enum([
      "whisper-large-v3",
      "whisper-large-v3-turbo",
      "distil-whisper-large-v3-en",
    ])
    .default("whisper-large-v3-turbo"),
  groqTimeoutMs: z.coerce.number().int().positive().default(300000),

  // Local Whisper
  localWhisperUrl: z.string().url().default("http://localhost:9001"),
  localWhisperModel: z.string().default("base"),
  localWhisperTimeoutMs: z.coerce.number().int().positive().default(600000),

  // MLX Whisper (Apple Silicon)
  mlxWhisperUrl: z.string().url().default("http://localhost:8000"),
  mlxWhisperModel: z.string().default("mlx-community/whisper-turbo"),
  mlxWhisperTimeoutMs: z.coerce.number().int().positive().default(600000),

  // Limits
  maxAudioSizeMb: z.coerce.number().positive().default(100),
  maxVconSizeMb: z.coerce.number().positive().default(200),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AsrProviderType = z.infer<typeof AsrProviderSchema>;

function loadConfig(): Config {
  const env = process.env;

  const rawConfig = {
    port: env["PORT"],
    host: env["HOST"],
    logLevel: env["LOG_LEVEL"],

    // Default ASR Provider
    asrProvider: env["ASR_PROVIDER"],

    // NVIDIA
    nimAsrUrl: env["NIM_ASR_URL"],
    nimApiKey: env["NIM_API_KEY"],
    nimDefaultModel: env["NIM_DEFAULT_MODEL"],
    nimTimeoutMs: env["NIM_TIMEOUT_MS"],

    // OpenAI
    openaiApiKey: env["OPENAI_API_KEY"],
    openaiBaseUrl: env["OPENAI_BASE_URL"],
    openaiModel: env["OPENAI_MODEL"],
    openaiTimeoutMs: env["OPENAI_TIMEOUT_MS"],

    // Deepgram
    deepgramApiKey: env["DEEPGRAM_API_KEY"],
    deepgramModel: env["DEEPGRAM_MODEL"],
    deepgramTimeoutMs: env["DEEPGRAM_TIMEOUT_MS"],

    // Groq
    groqApiKey: env["GROQ_API_KEY"],
    groqModel: env["GROQ_MODEL"],
    groqTimeoutMs: env["GROQ_TIMEOUT_MS"],

    // Local Whisper
    localWhisperUrl: env["LOCAL_WHISPER_URL"],
    localWhisperModel: env["LOCAL_WHISPER_MODEL"],
    localWhisperTimeoutMs: env["LOCAL_WHISPER_TIMEOUT_MS"],

    // MLX Whisper
    mlxWhisperUrl: env["MLX_WHISPER_URL"],
    mlxWhisperModel: env["MLX_WHISPER_MODEL"],
    mlxWhisperTimeoutMs: env["MLX_WHISPER_TIMEOUT_MS"],

    // Limits
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
