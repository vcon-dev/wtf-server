/**
 * NVIDIA NIM ASR Provider
 * Handles communication with NVIDIA NIM microservices for speech recognition
 * Optimized for H200 GPU inference
 */

import { request } from "undici";
import { BaseAsrProvider } from "./base.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { getAudioFormat } from "../utils/audio.js";
import type {
  AsrTranscribeRequest,
  AsrTranscribeResult,
  AsrHealthStatus,
} from "../types/asr.js";
import type {
  NvidiaAsrModel,
  NvidiaTranscribeResponse,
} from "../types/nvidia.js";

export interface NvidiaProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: NvidiaAsrModel;
  timeout?: number;
}

export class NvidiaAsrProvider extends BaseAsrProvider {
  readonly provider = "nvidia" as const;

  private baseUrl: string;
  private apiKey?: string;
  private defaultModel: NvidiaAsrModel;
  private timeout: number;

  constructor(options?: NvidiaProviderOptions) {
    super();
    this.baseUrl = options?.baseUrl ?? config.nimAsrUrl;
    this.apiKey = options?.apiKey ?? config.nimApiKey;
    this.defaultModel = options?.defaultModel ?? config.nimDefaultModel;
    this.timeout = options?.timeout ?? config.nimTimeoutMs;
  }

  isConfigured(): boolean {
    // NVIDIA NIM can work without API key for local deployments
    return true;
  }

  async healthCheck(): Promise<AsrHealthStatus> {
    try {
      const response = await request(`${this.baseUrl}/v1/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.statusCode !== 200) {
        return {
          status: "unavailable",
          provider: this.provider,
          message: `HTTP ${response.statusCode}`,
        };
      }

      const data = (await response.body.json()) as {
        status?: string;
        model?: string;
        version?: string;
      };

      return {
        status: data.status === "ok" ? "ok" : "degraded",
        provider: this.provider,
        model: data.model ?? this.defaultModel,
        version: data.version,
      };
    } catch (error) {
      logger.error({ error }, "NVIDIA NIM health check failed");
      return {
        status: "unavailable",
        provider: this.provider,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async transcribe(req: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    const startTime = Date.now();
    const format = getAudioFormat(req.mediatype);

    logger.info(
      {
        provider: this.provider,
        model: this.defaultModel,
        format,
        audioSize: req.audioBuffer.length,
        language: req.language,
      },
      "Starting NVIDIA transcription"
    );

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
        word_timestamps: req.options?.wordTimestamps ?? true,
        speaker_diarization: req.options?.speakerDiarization ?? false,
        profanity_filter: req.options?.profanityFilter ?? false,
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
          `NVIDIA NIM returned ${response.statusCode}: ${errorText}`
        );
      }

      const data = (await response.body.json()) as NvidiaTranscribeResponse;
      const processingTime = Date.now() - startTime;

      logger.info(
        {
          provider: this.provider,
          duration: data.duration,
          processingTime,
          textLength: data.text.length,
        },
        "NVIDIA transcription completed"
      );

      return this.transformResponse(data, processingTime);
    } catch (error) {
      logger.error(
        { error, provider: this.provider },
        "NVIDIA transcription failed"
      );
      throw error;
    }
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
  ): AsrTranscribeResult {
    let confidence = response.confidence ?? 0;
    if (!confidence && response.segments?.length) {
      const totalConf = response.segments.reduce(
        (sum, s) => sum + s.confidence,
        0
      );
      confidence = totalConf / response.segments.length;
    }

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
      provider: this.provider,
      model: this.defaultModel,
    };
  }
}
