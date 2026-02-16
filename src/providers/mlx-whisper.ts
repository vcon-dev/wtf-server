/**
 * MLX Whisper ASR Provider (Apple Silicon)
 * Connects to the vcon-mac-wtf Python sidecar running MLX Whisper.
 * Expects an OpenAI-compatible API at the configured URL.
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

export class MlxWhisperAsrProvider extends BaseAsrProvider {
  readonly provider = "mlx-whisper" as const;

  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor() {
    super();
    this.baseUrl = config.mlxWhisperUrl;
    this.model = config.mlxWhisperModel;
    this.timeout = config.mlxWhisperTimeoutMs;
  }

  isConfigured(): boolean {
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
      const healthEndpoints = [
        `${this.baseUrl}/health`,
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
      logger.error({ error }, "MLX Whisper health check failed");
      return {
        status: "unavailable",
        provider: this.provider,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async transcribe(req: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    if (!this.isConfigured()) {
      throw new Error("MLX Whisper URL not configured");
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
      "Starting MLX Whisper transcription"
    );

    const boundary = `----FormBoundary${Date.now()}`;
    const filename = this.getFilename(req.mediatype);

    const formParts: string[] = [];

    formParts.push(`--${boundary}`);
    formParts.push(
      `Content-Disposition: form-data; name="file"; filename="${filename}"`
    );
    formParts.push(`Content-Type: ${req.mediatype}`);
    formParts.push("");

    const modelPart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="model"',
      "",
      this.model,
    ].join("\r\n");

    const formatPart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="response_format"',
      "",
      "verbose_json",
    ].join("\r\n");

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

    let languagePart = "";
    if (req.language) {
      const langCode = req.language.split("-")[0];
      languagePart = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="language"',
        "",
        langCode,
      ].join("\r\n");
    }

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

    const endpoint = `${this.baseUrl}/v1/audio/transcriptions`;

    const response = await request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      bodyTimeout: this.timeout,
      headersTimeout: this.timeout,
    });

    if (response.statusCode !== 200) {
      const errorText = await response.body.text();
      throw new Error(
        `MLX Whisper returned ${response.statusCode}: ${errorText}`
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
      "MLX Whisper transcription completed"
    );

    return this.transformResponse(data, processingTime);
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
    const words: AsrWord[] | undefined = response.words?.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: 0.95,
    }));

    const segments: AsrSegment[] =
      response.segments?.map((seg) => {
        const segmentWords = words?.filter(
          (w) => w.start >= seg.start && w.end <= seg.end
        );

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

    let confidence = 0.95;
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
