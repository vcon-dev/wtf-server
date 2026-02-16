/**
 * Deepgram ASR Provider
 * Uses Deepgram's Nova-2 and other models for speech recognition
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

export interface DeepgramProviderOptions {
  apiKey?: string;
  model?: string;
  timeout?: number;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
}

interface DeepgramParagraph {
  sentences: {
    text: string;
    start: number;
    end: number;
  }[];
  speaker?: number;
  num_words: number;
  start: number;
  end: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
  paragraphs?: {
    transcript: string;
    paragraphs: DeepgramParagraph[];
  };
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramResponse {
  metadata: {
    request_id: string;
    sha256: string;
    created: string;
    duration: number;
    channels: number;
    models: string[];
    model_info: Record<string, { name: string; version: string }>;
  };
  results: {
    channels: DeepgramChannel[];
    utterances?: {
      start: number;
      end: number;
      confidence: number;
      channel: number;
      transcript: string;
      words: DeepgramWord[];
      speaker?: number;
      id: string;
    }[];
  };
}

export class DeepgramAsrProvider extends BaseAsrProvider {
  readonly provider = "deepgram" as const;

  private apiKey?: string;
  private model: string;
  private timeout: number;

  constructor(options?: DeepgramProviderOptions) {
    super();
    this.apiKey = options?.apiKey ?? config.deepgramApiKey;
    this.model = options?.model ?? config.deepgramModel;
    this.timeout = options?.timeout ?? config.deepgramTimeoutMs;
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
      // Deepgram doesn't have a dedicated health endpoint, check projects
      const response = await request("https://api.deepgram.com/v1/projects", {
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
      logger.error({ error }, "Deepgram health check failed");
      return {
        status: "unavailable",
        provider: this.provider,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async transcribe(req: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    if (!this.isConfigured()) {
      throw new Error("Deepgram API key not configured");
    }

    const startTime = Date.now();

    logger.info(
      {
        provider: this.provider,
        model: this.model,
        audioSize: req.audioBuffer.length,
        language: req.language,
      },
      "Starting Deepgram transcription"
    );

    // Build query parameters
    const params = new URLSearchParams({
      model: this.model,
      smart_format: "true",
      punctuate: String(req.options?.punctuation ?? true),
      utterances: "true",
      paragraphs: "true",
    });

    if (req.language) {
      params.set("language", req.language.split("-")[0]!);
    }

    if (req.options?.speakerDiarization) {
      params.set("diarize", "true");
    }

    if (req.options?.profanityFilter) {
      params.set("profanity_filter", "true");
    }

    try {
      const response = await request(
        `https://api.deepgram.com/v1/listen?${params.toString()}`,
        {
          method: "POST",
          headers: {
            ...this.getHeaders(),
            "Content-Type": req.mediatype,
          },
          body: req.audioBuffer,
          bodyTimeout: this.timeout,
          headersTimeout: this.timeout,
        }
      );

      if (response.statusCode !== 200) {
        const errorText = await response.body.text();
        throw new Error(
          `Deepgram API returned ${response.statusCode}: ${errorText}`
        );
      }

      const data = (await response.body.json()) as DeepgramResponse;
      const processingTime = Date.now() - startTime;

      logger.info(
        {
          provider: this.provider,
          duration: data.metadata.duration,
          processingTime,
          channels: data.metadata.channels,
        },
        "Deepgram transcription completed"
      );

      return this.transformResponse(data, processingTime);
    } catch (error) {
      logger.error(
        { error, provider: this.provider },
        "Deepgram transcription failed"
      );
      throw error;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Token ${this.apiKey}`,
    };
  }

  private transformResponse(
    response: DeepgramResponse,
    processingTime: number
  ): AsrTranscribeResult {
    // Get the first channel's first alternative
    const channel = response.results.channels[0];
    const alternative = channel?.alternatives[0];

    if (!alternative) {
      return {
        text: "",
        language: "unknown",
        duration: response.metadata.duration,
        confidence: 0,
        segments: [],
        processingTime,
        provider: this.provider,
        model: this.model,
      };
    }

    // Transform words
    const words: AsrWord[] = alternative.words.map((w) => ({
      word: w.punctuated_word ?? w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      speaker: w.speaker !== undefined ? String(w.speaker) : undefined,
    }));

    // Build segments from utterances or paragraphs
    let segments: AsrSegment[] = [];

    if (response.results.utterances?.length) {
      segments = response.results.utterances.map((utt) => ({
        text: utt.transcript,
        start: utt.start,
        end: utt.end,
        confidence: utt.confidence,
        speaker: utt.speaker !== undefined ? String(utt.speaker) : undefined,
        words: utt.words.map((w) => ({
          word: w.punctuated_word ?? w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        })),
      }));
    } else if (alternative.paragraphs?.paragraphs.length) {
      segments = alternative.paragraphs.paragraphs.flatMap((para) =>
        para.sentences.map((sent) => {
          const sentWords = words.filter(
            (w) => w.start >= sent.start && w.end <= sent.end
          );
          const avgConfidence =
            sentWords.length > 0
              ? sentWords.reduce((sum, w) => sum + w.confidence, 0) /
                sentWords.length
              : alternative.confidence;

          return {
            text: sent.text,
            start: sent.start,
            end: sent.end,
            confidence: avgConfidence,
            speaker:
              para.speaker !== undefined ? String(para.speaker) : undefined,
            words: sentWords,
          };
        })
      );
    }

    return {
      text: alternative.transcript,
      language: "en", // Deepgram doesn't return detected language in basic response
      duration: response.metadata.duration,
      confidence: alternative.confidence,
      segments,
      words,
      processingTime,
      provider: this.provider,
      model: this.model,
    };
  }
}
