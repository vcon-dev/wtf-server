/**
 * NVIDIA NIM ASR Client
 * Handles communication with NVIDIA NIM microservices for speech recognition
 * Optimized for H200 GPU inference
 */

import { request } from "undici";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type {
  NvidiaAsrModel,
  NvidiaTranscribeResponse,
  NvidiaHealthResponse,
  NvidiaTranscribeOptions,
} from "../types/nvidia.js";
import { getAudioFormat } from "../utils/audio.js";

export interface TranscribeRequest {
  audioBuffer: Buffer;
  mediatype: string;
  model?: NvidiaAsrModel;
  language?: string;
  options?: NvidiaTranscribeOptions;
}

export interface TranscribeResult {
  text: string;
  language: string;
  duration: number;
  confidence: number;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: string;
    words?: Array<{
      word: string;
      start: number;
      end: number;
      confidence: number;
    }>;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  processingTime: number;
}

export class NvidiaAsrClient {
  private baseUrl: string;
  private apiKey?: string;
  private defaultModel: NvidiaAsrModel;
  private timeout: number;

  constructor(options?: {
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: NvidiaAsrModel;
    timeout?: number;
  }) {
    this.baseUrl = options?.baseUrl ?? config.nimAsrUrl;
    this.apiKey = options?.apiKey ?? config.nimApiKey;
    this.defaultModel = options?.defaultModel ?? config.nimDefaultModel;
    this.timeout = options?.timeout ?? config.nimTimeoutMs;
  }

  /** Check if the NIM ASR service is healthy */
  async healthCheck(): Promise<NvidiaHealthResponse> {
    try {
      const response = await request(`${this.baseUrl}/v1/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.statusCode !== 200) {
        return { status: "unavailable" };
      }

      const data = (await response.body.json()) as NvidiaHealthResponse;
      return data;
    } catch (error) {
      logger.error({ error }, "NIM ASR health check failed");
      return { status: "unavailable" };
    }
  }

  /** Transcribe audio using NVIDIA NIM ASR */
  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const startTime = Date.now();
    const model = req.model ?? this.defaultModel;
    const format = getAudioFormat(req.mediatype);

    logger.info(
      {
        model,
        format,
        audioSize: req.audioBuffer.length,
        language: req.language,
      },
      "Starting transcription"
    );

    // Prepare the request body
    const requestBody = {
      audio: req.audioBuffer.toString("base64"),
      config: {
        format,
        sample_rate: 16000,
        channels: 1,
      },
      options: {
        language: req.language ?? "en-US",
        punctuation: req.options?.punctuation ?? true,
        word_timestamps: req.options?.word_timestamps ?? true,
        speaker_diarization: req.options?.speaker_diarization ?? false,
        profanity_filter: req.options?.profanity_filter ?? false,
        ...(req.options?.word_boosting && {
          word_boosting: req.options.word_boosting,
        }),
      },
    };

    try {
      const response = await request(`${this.baseUrl}/v1/asr/transcribe`, {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        bodyTimeout: this.timeout,
        headersTimeout: this.timeout,
      });

      if (response.statusCode !== 200) {
        const errorText = await response.body.text();
        throw new Error(
          `NIM ASR returned ${response.statusCode}: ${errorText}`
        );
      }

      const data = (await response.body.json()) as NvidiaTranscribeResponse;
      const processingTime = Date.now() - startTime;

      logger.info(
        {
          duration: data.duration,
          processingTime,
          textLength: data.text.length,
        },
        "Transcription completed"
      );

      return this.transformResponse(data, processingTime);
    } catch (error) {
      logger.error({ error, model }, "Transcription failed");
      throw error;
    }
  }

  /** Transcribe multiple audio files in batch for H200 efficiency */
  async transcribeBatch(
    requests: TranscribeRequest[]
  ): Promise<TranscribeResult[]> {
    const startTime = Date.now();

    logger.info(
      { batchSize: requests.length },
      "Starting batch transcription"
    );

    // For optimal H200 utilization, we process in parallel
    // The NIM service handles batching internally
    const results = await Promise.all(
      requests.map((req) => this.transcribe(req))
    );

    const totalTime = Date.now() - startTime;
    logger.info(
      {
        batchSize: requests.length,
        totalTime,
        avgTime: totalTime / requests.length,
      },
      "Batch transcription completed"
    );

    return results;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private transformResponse(
    response: NvidiaTranscribeResponse,
    processingTime: number
  ): TranscribeResult {
    // Calculate overall confidence from segments or words
    let confidence = response.confidence ?? 0;
    if (!confidence && response.segments?.length) {
      const totalConf = response.segments.reduce(
        (sum, s) => sum + s.confidence,
        0
      );
      confidence = totalConf / response.segments.length;
    }

    // Transform segments
    const segments =
      response.segments?.map((seg) => ({
        text: seg.text,
        start: seg.start_time,
        end: seg.end_time,
        confidence: seg.confidence,
        speaker: seg.speaker,
        words: seg.words?.map((w) => ({
          word: w.word,
          start: w.start_time,
          end: w.end_time,
          confidence: w.confidence,
        })),
      })) ?? [];

    // Transform words
    const words = response.words?.map((w) => ({
      word: w.word,
      start: w.start_time,
      end: w.end_time,
      confidence: w.confidence,
    }));

    return {
      text: response.text,
      language: response.language,
      duration: response.duration,
      confidence,
      segments,
      words,
      processingTime,
    };
  }
}

// Singleton instance
export const nvidiaAsrClient = new NvidiaAsrClient();
