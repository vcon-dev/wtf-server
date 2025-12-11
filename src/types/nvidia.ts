/**
 * NVIDIA NIM ASR API Types
 * Based on NVIDIA NIM Riva ASR documentation
 * https://docs.nvidia.com/nim/riva/asr/latest/
 */

/** Supported ASR models */
export type NvidiaAsrModel =
  | "parakeet-ctc-1.1b"
  | "parakeet-ctc-0.6b"
  | "parakeet-rnnt-1.1b"
  | "parakeet-rnnt-0.6b"
  | "parakeet-tdt-1.1b"
  | "parakeet-tdt-0.6b"
  | "canary-1b"
  | "canary-0.6b";

/** Audio configuration for transcription */
export interface NvidiaAudioConfig {
  format: "pcm16" | "wav" | "mp3" | "flac" | "ogg";
  sample_rate: number;
  channels: number;
}

/** Transcription request options */
export interface NvidiaTranscribeOptions {
  language?: string;
  punctuation?: boolean;
  word_timestamps?: boolean;
  speaker_diarization?: boolean;
  profanity_filter?: boolean;
  word_boosting?: string[];
}

/** Word timing from NVIDIA response */
export interface NvidiaWord {
  word: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

/** Segment from NVIDIA response */
export interface NvidiaSegment {
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
  speaker?: string;
  words?: NvidiaWord[];
}

/** NVIDIA transcription response */
export interface NvidiaTranscribeResponse {
  text: string;
  language: string;
  duration: number;
  segments?: NvidiaSegment[];
  words?: NvidiaWord[];
  confidence?: number;
}

/** Batch transcription request */
export interface NvidiaBatchRequest {
  audio: string; // base64 encoded
  config?: NvidiaAudioConfig;
  options?: NvidiaTranscribeOptions;
}

/** Health check response */
export interface NvidiaHealthResponse {
  status: "ok" | "degraded" | "unavailable";
  model?: string;
  version?: string;
}

/** Error response from NVIDIA NIM */
export interface NvidiaErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

/** WebSocket session configuration */
export interface NvidiaSessionConfig {
  language?: string;
  model?: string;
  punctuation?: boolean;
  word_timestamps?: boolean;
  speaker_diarization?: boolean;
  profanity_filter?: boolean;
}

/** WebSocket events */
export type NvidiaWsEventType =
  | "transcription_session.update"
  | "input_audio_buffer.append"
  | "input_audio_buffer.commit"
  | "input_audio_buffer.done"
  | "input_audio_buffer.clear"
  | "conversation.created"
  | "conversation.item.input_audio_transcription.delta"
  | "conversation.item.input_audio_transcription.completed"
  | "error";

export interface NvidiaWsEvent {
  type: NvidiaWsEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}
