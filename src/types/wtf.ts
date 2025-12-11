/**
 * WTF (World Transcription Format) Types
 * Based on IETF draft-howe-vcon-wtf-extension-01
 * https://datatracker.ietf.org/doc/html/draft-howe-vcon-wtf-extension-01
 */

/** Audio metadata for the transcribed content */
export interface WtfAudioMetadata {
  duration: number;
  sample_rate?: number;
  channels?: number;
  format?: string;
  bitrate?: number;
}

/** Metadata about the transcription process */
export interface WtfMetadata {
  created_at: string;
  processed_at: string;
  provider: string;
  model: string;
  processing_time?: number;
  audio?: WtfAudioMetadata;
  options?: Record<string, unknown>;
}

/** Core transcript data */
export interface WtfTranscript {
  text: string;
  language: string;
  duration: number;
  confidence: number;
}

/** Word-level timing and confidence */
export interface WtfWord {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: number | string;
  is_punctuation?: boolean;
}

/** Segment of transcription (sentence/phrase level) */
export interface WtfSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: number | string;
  words?: number[];
}

/** Speaker information */
export interface WtfSpeaker {
  id: number | string;
  label?: string;
  segments?: number[];
  total_time?: number;
  confidence?: number;
}

/** Alternative transcription hypothesis */
export interface WtfAlternative {
  text: string;
  confidence: number;
  words?: WtfWord[];
}

/** Quality assessment of the transcription */
export interface WtfQuality {
  audio_quality?: "excellent" | "good" | "fair" | "poor";
  background_noise?: number;
  multiple_speakers?: boolean;
  overlapping_speech?: boolean;
  silence_ratio?: number;
  average_confidence: number;
  low_confidence_words?: number;
  processing_warnings?: string[];
}

/** Enrichment data (entities, topics, etc.) */
export interface WtfEnrichments {
  entities?: Array<{
    text: string;
    type: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
  topics?: Array<{
    topic: string;
    confidence: number;
  }>;
  sentiment?: {
    overall: "positive" | "negative" | "neutral" | "mixed";
    score: number;
    segments?: Array<{
      segment_id: number;
      sentiment: string;
      score: number;
    }>;
  };
  keywords?: Array<{
    word: string;
    relevance: number;
    count: number;
  }>;
}

/** Provider-specific extension data */
export interface WtfExtensions {
  [provider: string]: Record<string, unknown>;
}

/** Streaming state for real-time transcription */
export interface WtfStreaming {
  is_final: boolean;
  sequence_number?: number;
  stability?: number;
}

/** Complete WTF transcription object */
export interface WtfTranscription {
  // Required sections
  transcript: WtfTranscript;
  segments: WtfSegment[];
  metadata: WtfMetadata;

  // Optional sections
  words?: WtfWord[];
  speakers?: Record<string, WtfSpeaker>;
  alternatives?: WtfAlternative[];
  quality?: WtfQuality;
  enrichments?: WtfEnrichments;
  extensions?: WtfExtensions;
  streaming?: WtfStreaming;
}

/** WTF analysis entry for VCON */
export interface WtfAnalysis {
  type: "wtf_transcription";
  dialog: number | number[];
  mediatype: "application/json";
  vendor: string;
  product?: string;
  schema: "wtf-1.0";
  body: WtfTranscription;
  encoding: "json";
}
