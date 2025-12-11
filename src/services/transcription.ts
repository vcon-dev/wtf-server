/**
 * Transcription Service
 * Orchestrates the full VCON transcription pipeline
 */

import type { NormalizedVcon } from "../types/vcon.js";
import type { NvidiaAsrModel } from "../types/nvidia.js";
import { parseVcon } from "./vcon-parser.js";
import { extractAudioFromDialogs, type ExtractedAudio } from "./audio-extractor.js";
import {
  nvidiaAsrClient,
  type TranscribeRequest,
  type TranscribeResult,
} from "./nvidia-asr.js";
import {
  enrichVconWithTranscriptions,
  type EnrichmentInput,
} from "./vcon-enricher.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

export interface TranscriptionOptions {
  model?: NvidiaAsrModel;
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
 * 3. Transcribe with NVIDIA NIM (optimized for H200)
 * 4. Enrich VCON with WTF transcription
 */
export async function transcribeVcon(
  input: unknown,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  const startTime = Date.now();
  const model = options?.model ?? config.nimDefaultModel;

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
      model,
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

  // Step 3: Transcribe with NVIDIA NIM
  // Use batch processing for H200 efficiency
  const transcribeRequests: Array<{
    audio: ExtractedAudio;
    request: TranscribeRequest;
  }> = extraction.extracted.map((audio) => ({
    audio,
    request: {
      audioBuffer: audio.buffer,
      mediatype: audio.mediatype,
      model,
      language: options?.language,
      options: {
        word_timestamps: options?.wordTimestamps ?? true,
        speaker_diarization: options?.speakerDiarization ?? false,
        punctuation: true,
      },
    },
  }));

  const transcriptionResults: Array<{
    audio: ExtractedAudio;
    result: TranscribeResult;
  }> = [];

  // Process in parallel for H200 throughput optimization
  const batchResults = await nvidiaAsrClient.transcribeBatch(
    transcribeRequests.map((r) => r.request)
  );

  for (let i = 0; i < transcribeRequests.length; i++) {
    const req = transcribeRequests[i]!;
    const result = batchResults[i]!;
    transcriptionResults.push({
      audio: req.audio,
      result,
    });
  }

  // Step 4: Enrich VCON with WTF transcription
  const enrichments: EnrichmentInput[] = transcriptionResults.map(
    ({ audio, result }) => ({
      dialogIndex: audio.dialogIndex,
      transcription: result,
      model,
      audioDuration: audio.duration,
    })
  );

  const enrichedVcon = enrichVconWithTranscriptions(vcon, enrichments);

  const totalTime = Date.now() - startTime;

  logger.info(
    {
      uuid: vcon.uuid,
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
    },
  };
}

/**
 * Check if the transcription service is healthy
 */
export async function checkHealth(): Promise<{
  healthy: boolean;
  nim: { status: string };
}> {
  const nimHealth = await nvidiaAsrClient.healthCheck();

  return {
    healthy: nimHealth.status === "ok",
    nim: { status: nimHealth.status },
  };
}
