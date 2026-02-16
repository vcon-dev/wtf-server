/**
 * OpenAI Whisper API Provider
 * Uses OpenAI's Whisper API for speech recognition
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

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

interface OpenAIWord {
  word: string;
  start: number;
  end: number;
}

interface OpenAISegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface OpenAIVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  words?: OpenAIWord[];
  segments?: OpenAISegment[];
}

export class OpenAIAsrProvider extends BaseAsrProvider {
  readonly provider = "openai" as const;

  private apiKey?: string;
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(options?: OpenAIProviderOptions) {
    super();
    this.apiKey = options?.apiKey ?? config.openaiApiKey;
    this.baseUrl =
      options?.baseUrl ?? config.openaiBaseUrl ?? "https://api.openai.com/v1";
    this.model = options?.model ?? config.openaiModel;
    this.timeout = options?.timeout ?? config.openaiTimeoutMs;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async healthCheck(): Promise<AsrHealthStatus> {
    if (!this.isConfigured()) {
      return {
        status: "unavailable",
        provider: this.provider,
        message: "API key not configured",
      };
    }

    try {
      // OpenAI doesn't have a dedicated health endpoint, try models list
      const response = await request(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.statusCode === 200) {
        return {
          status: "ok",
          provider: this.provider,
          model: this.model,
        };
      }

      return {
        status: "unavailable",
        provider: this.provider,
        message: `HTTP ${response.statusCode}`,
      };
    } catch (error) {
      logger.error({ error }, "OpenAI health check failed");
      return {
        status: "unavailable",
        provider: this.provider,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async transcribe(req: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    if (!this.isConfigured()) {
      throw new Error("OpenAI API key not configured");
    }

    const startTime = Date.now();

    logger.info(
      {
        provider: this.provider,
        model: this.model,
        audioSize: req.audioBuffer.length,
        language: req.language,
      },
      "Starting OpenAI transcription"
    );

    // Create multipart form data
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

    // Add timestamp granularities
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

    try {
      const response = await request(
        `${this.baseUrl}/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            ...this.getHeaders(),
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body,
          bodyTimeout: this.timeout,
          headersTimeout: this.timeout,
        }
      );

      if (response.statusCode !== 200) {
        const errorText = await response.body.text();
        throw new Error(
          `OpenAI API returned ${response.statusCode}: ${errorText}`
        );
      }

      const data = (await response.body.json()) as OpenAIVerboseResponse;
      const processingTime = Date.now() - startTime;

      logger.info(
        {
          provider: this.provider,
          duration: data.duration,
          processingTime,
          textLength: data.text.length,
        },
        "OpenAI transcription completed"
      );

      return this.transformResponse(data, processingTime);
    } catch (error) {
      logger.error(
        { error, provider: this.provider },
        "OpenAI transcription failed"
      );
      throw error;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
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
    response: OpenAIVerboseResponse,
    processingTime: number
  ): AsrTranscribeResult {
    // Transform words
    const words: AsrWord[] | undefined = response.words?.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: 0.95, // OpenAI doesn't provide word confidence
    }));

    // Transform segments
    const segments: AsrSegment[] =
      response.segments?.map((seg) => {
        // Find words that belong to this segment
        const segmentWords = words?.filter(
          (w) => w.start >= seg.start && w.end <= seg.end
        );

        // Calculate confidence from avg_logprob (convert from log prob to probability)
        const confidence = Math.exp(seg.avg_logprob);

        return {
          text: seg.text.trim(),
          start: seg.start,
          end: seg.end,
          confidence: Math.min(confidence, 1), // Clamp to 1
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
