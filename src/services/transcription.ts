/**
 * Transcription Service
 * Orchestrates the full VCON transcription pipeline
 */

import type { NormalizedVcon } from "../types/vcon.js";
import type { AsrProvider, AsrTranscribeRequest } from "../types/asr.js";
import { parseVcon } from "./vcon-parser.js";
import {
  extractAudioFromDialogs,
  type ExtractedAudio,
} from "./audio-extractor.js";
import { getProvider } from "../providers/index.js";
import {
  enrichVconWithTranscriptions,
  type EnrichmentInput,
} from "./vcon-enricher.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

export interface TranscriptionOptions {
  provider?: AsrProvider;
  model?: string;
  language?: string;
  wordTimestamps?: boolean;
  speakerDiarization?: boolean;
}

export interface TranscriptionSuccess {
  success: true;
  vcon: NormalizedVcon;
  stats: {
    dialogsProcessed: number;
    dialogsSkipped: number;
    dialogsFailed: number;
    totalProcessingTime: number;
    provider: AsrProvider;
    model?: string;
  };
}

export interface TranscriptionFailure {
  success: false;
  error: string;
  details?: Array<{ path: string; message: string }>;
}

export type TranscriptionResult = TranscriptionSuccess | TranscriptionFailure;

/**
 * Main transcription pipeline
 * 1. Parse and validate VCON
 * 2. Extract audio from dialogs
 * 3. Transcribe with selected ASR provider
 * 4. Enrich VCON with WTF transcription
 */
export async function transcribeVcon(
  input: unknown,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  const startTime = Date.now();
  const providerName = options?.provider ?? config.asrProvider;
  const provider = getProvider(providerName);

  // Check if provider is configured
  if (!provider.isConfigured()) {
    return {
      success: false,
      error: `ASR provider '${providerName}' is not configured. Check environment variables.`,
    };
  }

  // Step 1: Parse and validate VCON
  const parseResult = parseVcon(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error,
      details: parseResult.details,
    };
  }

  const { vcon, audioDialogs } = parseResult;

  logger.info(
    {
      uuid: vcon.uuid,
      audioDialogs: audioDialogs.length,
      provider: providerName,
      model: options?.model,
    },
    "Starting VCON transcription"
  );

  // Check if there are any audio dialogs
  if (audioDialogs.length === 0) {
    return {
      success: false,
      error: "No audio dialogs found in VCON",
    };
  }

  // Step 2: Extract audio from dialogs
  const extraction = await extractAudioFromDialogs(audioDialogs);

  if (extraction.extracted.length === 0) {
    return {
      success: false,
      error: "Failed to extract audio from any dialog",
      details: extraction.errors.map((e) => ({
        path: `dialog[${e.dialogIndex}]`,
        message: e.error,
      })),
    };
  }

  // Step 3: Transcribe with selected ASR provider
  const transcribeRequests: Array<{
    audio: ExtractedAudio;
    request: AsrTranscribeRequest;
  }> = extraction.extracted.map((audio) => ({
    audio,
    request: {
      audioBuffer: audio.buffer,
      mediatype: audio.mediatype,
      language: options?.language,
      options: {
        wordTimestamps: options?.wordTimestamps ?? true,
        speakerDiarization: options?.speakerDiarization ?? false,
        punctuation: true,
      },
    },
  }));

  // Process in batch for throughput optimization
  const batchResults = await provider.transcribeBatch(
    transcribeRequests.map((r) => r.request)
  );

  const transcriptionResults = transcribeRequests.map((req, i) => ({
    audio: req.audio,
    result: batchResults[i]!,
  }));

  // Step 4: Enrich VCON with WTF transcription
  const enrichments: EnrichmentInput[] = transcriptionResults.map(
    ({ audio, result }) => ({
      dialogIndex: audio.dialogIndex,
      transcription: result,
      provider: result.provider,
      model: result.model,
      audioDuration: audio.duration,
    })
  );

  const enrichedVcon = enrichVconWithTranscriptions(vcon, enrichments);

  const totalTime = Date.now() - startTime;

  logger.info(
    {
      uuid: vcon.uuid,
      provider: providerName,
      dialogsProcessed: transcriptionResults.length,
      dialogsSkipped: extraction.skipped.length,
      dialogsFailed: extraction.errors.length,
      totalTime,
    },
    "VCON transcription completed"
  );

  return {
    success: true,
    vcon: enrichedVcon,
    stats: {
      dialogsProcessed: transcriptionResults.length,
      dialogsSkipped: extraction.skipped.length,
      dialogsFailed: extraction.errors.length,
      totalProcessingTime: totalTime,
      provider: providerName,
      model: transcriptionResults[0]?.result.model,
    },
  };
}

/**
 * Check if the transcription service is healthy
 */
export async function checkHealth(): Promise<{
  healthy: boolean;
  providers: Record<string, { status: string; model?: string }>;
}> {
  const providerName = config.asrProvider;
  const provider = getProvider(providerName);
  const health = await provider.healthCheck();

  return {
    healthy: health.status === "ok",
    providers: {
      [providerName]: {
        status: health.status,
        model: health.model,
      },
    },
  };
}

/**
 * Check health of all configured providers
 */
export async function checkAllProvidersHealth(): Promise<{
  providers: Record<string, { status: string; model?: string; message?: string }>;
}> {
  const { getConfiguredProviderNames, createProvider } = await import(
    "../providers/index.js"
  );
  const configuredProviders = getConfiguredProviderNames();

  const results: Record<
    string,
    { status: string; model?: string; message?: string }
  > = {};

  await Promise.all(
    configuredProviders.map(async (name) => {
      const provider = createProvider(name);
      const health = await provider.healthCheck();
      results[name] = {
        status: health.status,
        model: health.model,
        message: health.message,
      };
    })
  );

  return { providers: results };
}
