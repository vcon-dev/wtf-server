/**
 * Base ASR Provider
 * Abstract base class for all ASR providers
 */

import type {
  AsrProvider,
  AsrProviderClient,
  AsrTranscribeRequest,
  AsrTranscribeResult,
  AsrHealthStatus,
} from "../types/asr.js";
import { logger } from "../utils/logger.js";

export abstract class BaseAsrProvider implements AsrProviderClient {
  abstract readonly provider: AsrProvider;

  abstract healthCheck(): Promise<AsrHealthStatus>;
  abstract transcribe(request: AsrTranscribeRequest): Promise<AsrTranscribeResult>;
  abstract isConfigured(): boolean;

  async transcribeBatch(
    requests: AsrTranscribeRequest[]
  ): Promise<AsrTranscribeResult[]> {
    const startTime = Date.now();

    logger.info(
      { provider: this.provider, batchSize: requests.length },
      "Starting batch transcription"
    );

    // Default implementation: process in parallel
    const results = await Promise.all(
      requests.map((req) => this.transcribe(req))
    );

    const totalTime = Date.now() - startTime;
    logger.info(
      {
        provider: this.provider,
        batchSize: requests.length,
        totalTime,
        avgTime: totalTime / requests.length,
      },
      "Batch transcription completed"
    );

    return results;
  }

  protected createErrorResult(
    _error: Error,
    processingTime: number
  ): AsrTranscribeResult {
    return {
      text: "",
      language: "unknown",
      duration: 0,
      confidence: 0,
      segments: [],
      processingTime,
      provider: this.provider,
    };
  }
}
