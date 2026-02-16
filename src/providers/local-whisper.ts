/**
 * Local Whisper ASR Provider
 * Uses a locally running Whisper server (e.g., faster-whisper-server, whisper.cpp)
 * Expects an OpenAI-compatible API
 */

import { request } from "undici";
import { BaseAsrProvider } from "./base.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type {
  AsrTranscribeRequest,
  AsrTranscribeResult,
  AsrHealthStatus,
  AsrSegment,
  AsrWord,
} from "../types/asr.js";

export interface LocalWhisperProviderOptions {
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperSegment {
  id: number;
  seek?: number;
  start: number;
  end: number;
  text: string;
  tokens?: number[];
  temperature?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}

interface WhisperVerboseResponse {
  task?: string;
  language: string;
  duration: number;
  text: string;
  words?: WhisperWord[];
  segments?: WhisperSegment[];
}

export class LocalWhisperAsrProvider extends BaseAsrProvider {
  readonly provider = "local-whisper" as const;

  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(options?: LocalWhisperProviderOptions) {
    super();
    this.baseUrl = options?.baseUrl ?? config.localWhisperUrl;
    this.model = options?.model ?? config.localWhisperModel;
    this.timeout = options?.timeout ?? config.localWhisperTimeoutMs;
  }

  isConfigured(): boolean {
    // Local whisper is configured if URL is set (doesn't require API key)
    return !!this.baseUrl;
  }

  async healthCheck(): Promise<AsrHealthStatus> {
    if (!this.isConfigured()) {
      return {
        status: "unavailable",
        provider: this.provider,
        message: "Base URL not configured",
      };
    }

    try {
      // Try common health endpoints
      const healthEndpoints = [
        `${this.baseUrl}/health`,
        `${this.baseUrl}/v1/health`,
        `${this.baseUrl}/v1/models`,
      ];

      for (const endpoint of healthEndpoints) {
        try {
          const response = await request(endpoint, {
            method: "GET",
            headersTimeout: 5000,
          });

          if (response.statusCode === 200) {
            return {
              status: "ok",
              provider: this.provider,
              model: this.model,
            };
          }
        } catch {
          // Try next endpoint
        }
      }

      return {
        status: "unavailable",
        provider: this.provider,
        message: "No health endpoint responded",
      };
    } catch (error) {
      logger.error({ error }, "Local Whisper health check failed");
      return {
        status: "unavailable",
        provider: this.provider,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async transcribe(req: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    if (!this.isConfigured()) {
      throw new Error("Local Whisper URL not configured");
    }

    const startTime = Date.now();

    logger.info(
      {
        provider: this.provider,
        model: this.model,
        baseUrl: this.baseUrl,
        audioSize: req.audioBuffer.length,
        language: req.language,
      },
      "Starting local Whisper transcription"
    );

    // Create multipart form data (OpenAI-compatible)
    const boundary = `----FormBoundary${Date.now()}`;
    const filename = this.getFilename(req.mediatype);

    const formParts: string[] = [];

    // Add file
    formParts.push(`--${boundary}`);
    formParts.push(
      `Content-Disposition: form-data; name="file"; filename="${filename}"`
    );
    formParts.push(`Content-Type: ${req.mediatype}`);
    formParts.push("");

    // Add model
    const modelPart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="model"',
      "",
      this.model,
    ].join("\r\n");

    // Add response format for word timestamps
    const formatPart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="response_format"',
      "",
      "verbose_json",
    ].join("\r\n");

    // Add timestamp granularities (may not be supported by all servers)
    const granularityPart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="timestamp_granularities[]"',
      "",
      "word",
    ].join("\r\n");

    const granularityPart2 = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="timestamp_granularities[]"',
      "",
      "segment",
    ].join("\r\n");

    // Add language if specified
    let languagePart = "";
    if (req.language) {
      const langCode = req.language.split("-")[0]; // Convert en-US to en
      languagePart = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="language"',
        "",
        langCode,
      ].join("\r\n");
    }

    // Build the body
    const prefix = Buffer.from(formParts.join("\r\n") + "\r\n");
    const suffix = Buffer.from(
      "\r\n" +
        modelPart +
        "\r\n" +
        formatPart +
        "\r\n" +
        granularityPart +
        "\r\n" +
        granularityPart2 +
        (languagePart ? "\r\n" + languagePart : "") +
        "\r\n" +
        `--${boundary}--\r\n`
    );

    const body = Buffer.concat([prefix, req.audioBuffer, suffix]);

    // Try different endpoint paths for compatibility
    const endpoints = [
      `${this.baseUrl}/v1/audio/transcriptions`,
      `${this.baseUrl}/audio/transcriptions`,
      `${this.baseUrl}/transcribe`,
    ];

    let lastError: Error | undefined;

    for (const endpoint of endpoints) {
      try {
        const response = await request(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body,
          bodyTimeout: this.timeout,
          headersTimeout: this.timeout,
        });

        if (response.statusCode === 404) {
          // Try next endpoint
          continue;
        }

        if (response.statusCode !== 200) {
          const errorText = await response.body.text();
          throw new Error(
            `Local Whisper returned ${response.statusCode}: ${errorText}`
          );
        }

        const data = (await response.body.json()) as WhisperVerboseResponse;
        const processingTime = Date.now() - startTime;

        logger.info(
          {
            provider: this.provider,
            endpoint,
            duration: data.duration,
            processingTime,
            textLength: data.text.length,
          },
          "Local Whisper transcription completed"
        );

        return this.transformResponse(data, processingTime);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // If it's not a 404, don't try other endpoints
        if (!lastError.message.includes("404")) {
          throw lastError;
        }
      }
    }

    logger.error(
      { error: lastError, provider: this.provider },
      "Local Whisper transcription failed"
    );
    throw lastError ?? new Error("No working endpoint found");
  }

  private getFilename(mediatype: string): string {
    const extensions: Record<string, string> = {
      "audio/wav": "audio.wav",
      "audio/wave": "audio.wav",
      "audio/x-wav": "audio.wav",
      "audio/mp3": "audio.mp3",
      "audio/mpeg": "audio.mp3",
      "audio/mp4": "audio.mp4",
      "audio/x-m4a": "audio.m4a",
      "audio/flac": "audio.flac",
      "audio/ogg": "audio.ogg",
      "audio/webm": "audio.webm",
    };
    return extensions[mediatype] ?? "audio.wav";
  }

  private transformResponse(
    response: WhisperVerboseResponse,
    processingTime: number
  ): AsrTranscribeResult {
    // Transform words
    const words: AsrWord[] | undefined = response.words?.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: 0.95, // Local whisper typically doesn't provide word confidence
    }));

    // Transform segments
    const segments: AsrSegment[] =
      response.segments?.map((seg) => {
        // Find words that belong to this segment
        const segmentWords = words?.filter(
          (w) => w.start >= seg.start && w.end <= seg.end
        );

        // Calculate confidence from avg_logprob if available
        let confidence = 0.95;
        if (seg.avg_logprob !== undefined) {
          confidence = Math.min(Math.exp(seg.avg_logprob), 1);
        }

        return {
          text: seg.text.trim(),
          start: seg.start,
          end: seg.end,
          confidence,
          words: segmentWords,
        };
      }) ?? [];

    // Calculate overall confidence
    let confidence = 0.95; // Default
    if (segments.length > 0) {
      confidence =
        segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length;
    }

    return {
      text: response.text.trim(),
      language: response.language,
      duration: response.duration,
      confidence,
      segments,
      words,
      processingTime,
      provider: this.provider,
      model: this.model,
    };
  }
}
