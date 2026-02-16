/**
 * Groq ASR Provider
 * Uses Groq's Whisper API for fast speech recognition
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

export interface GroqProviderOptions {
  apiKey?: string;
  model?: string;
  timeout?: number;
}

interface GroqWord {
  word: string;
  start: number;
  end: number;
}

interface GroqSegment {
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

interface GroqVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  words?: GroqWord[];
  segments?: GroqSegment[];
}

export class GroqAsrProvider extends BaseAsrProvider {
  readonly provider = "groq" as const;

  private apiKey?: string;
  private model: string;
  private timeout: number;

  constructor(options?: GroqProviderOptions) {
    super();
    this.apiKey = options?.apiKey ?? config.groqApiKey;
    this.model = options?.model ?? config.groqModel;
    this.timeout = options?.timeout ?? config.groqTimeoutMs;
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
      // Groq uses OpenAI-compatible API, check models endpoint
      const response = await request("https://api.groq.com/openai/v1/models", {
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
      logger.error({ error }, "Groq health check failed");
      return {
        status: "unavailable",
        provider: this.provider,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async transcribe(req: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    if (!this.isConfigured()) {
      throw new Error("Groq API key not configured");
    }

    const startTime = Date.now();

    logger.info(
      {
        provider: this.provider,
        model: this.model,
        audioSize: req.audioBuffer.length,
        language: req.language,
      },
      "Starting Groq transcription"
    );

    // Create multipart form data (similar to OpenAI)
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
        "https://api.groq.com/openai/v1/audio/transcriptions",
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
          `Groq API returned ${response.statusCode}: ${errorText}`
        );
      }

      const data = (await response.body.json()) as GroqVerboseResponse;
      const processingTime = Date.now() - startTime;

      logger.info(
        {
          provider: this.provider,
          duration: data.duration,
          processingTime,
          textLength: data.text.length,
        },
        "Groq transcription completed"
      );

      return this.transformResponse(data, processingTime);
    } catch (error) {
      logger.error(
        { error, provider: this.provider },
        "Groq transcription failed"
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
    response: GroqVerboseResponse,
    processingTime: number
  ): AsrTranscribeResult {
    // Transform words
    const words: AsrWord[] | undefined = response.words?.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: 0.95, // Groq doesn't provide word confidence
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
