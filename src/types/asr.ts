/**
 * ASR Provider Types
 * Common types for all ASR providers
 */

/** Supported ASR providers */
export type AsrProvider =
  | "nvidia"
  | "openai"
  | "deepgram"
  | "groq"
  | "local-whisper"
  | "mlx-whisper";

/** Common transcription request options */
export interface AsrTranscribeOptions {
  language?: string;
  punctuation?: boolean;
  wordTimestamps?: boolean;
  speakerDiarization?: boolean;
  profanityFilter?: boolean;
}

/** Common transcription request */
export interface AsrTranscribeRequest {
  audioBuffer: Buffer;
  mediatype: string;
  language?: string;
  options?: AsrTranscribeOptions;
}

/** Word-level timing */
export interface AsrWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

/** Segment-level timing */
export interface AsrSegment {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
  words?: AsrWord[];
}

/** Common transcription result */
export interface AsrTranscribeResult {
  text: string;
  language: string;
  duration: number;
  confidence: number;
  segments: AsrSegment[];
  words?: AsrWord[];
  processingTime: number;
  provider: AsrProvider;
  model?: string;
}

/** Provider health status */
export interface AsrHealthStatus {
  status: "ok" | "degraded" | "unavailable";
  provider: AsrProvider;
  model?: string;
  version?: string;
  message?: string;
}

/** ASR Provider interface */
export interface AsrProviderClient {
  /** Provider name */
  readonly provider: AsrProvider;

  /** Check if the provider is healthy/available */
  healthCheck(): Promise<AsrHealthStatus>;

  /** Transcribe a single audio file */
  transcribe(request: AsrTranscribeRequest): Promise<AsrTranscribeResult>;

  /** Transcribe multiple audio files in batch */
  transcribeBatch(requests: AsrTranscribeRequest[]): Promise<AsrTranscribeResult[]>;

  /** Check if provider is configured (has required credentials) */
  isConfigured(): boolean;
}
