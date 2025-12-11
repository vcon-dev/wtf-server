import { z } from "zod";

/** Audio metadata schema */
export const WtfAudioMetadataSchema = z.object({
  duration: z.number().nonnegative(),
  sample_rate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  format: z.string().optional(),
  bitrate: z.number().int().positive().optional(),
});

/** Metadata schema */
export const WtfMetadataSchema = z.object({
  created_at: z.string().datetime(),
  processed_at: z.string().datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  processing_time: z.number().nonnegative().optional(),
  audio: WtfAudioMetadataSchema.optional(),
  options: z.record(z.unknown()).optional(),
});

/** Core transcript schema */
export const WtfTranscriptSchema = z.object({
  text: z.string(),
  language: z.string().min(2), // BCP-47 format
  duration: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
});

/** Word-level schema */
export const WtfWordSchema = z.object({
  id: z.number().int().nonnegative(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  speaker: z.union([z.number().int(), z.string()]).optional(),
  is_punctuation: z.boolean().optional(),
});

/** Segment schema */
export const WtfSegmentSchema = z
  .object({
    id: z.number().int().nonnegative(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    text: z.string(),
    confidence: z.number().min(0).max(1),
    speaker: z.union([z.number().int(), z.string()]).optional(),
    words: z.array(z.number().int().nonnegative()).optional(),
  })
  .refine((data) => data.end >= data.start, {
    message: "end time must be >= start time",
  });

/** Speaker schema */
export const WtfSpeakerSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  label: z.string().optional(),
  segments: z.array(z.number().int().nonnegative()).optional(),
  total_time: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/** Alternative transcription schema */
export const WtfAlternativeSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  words: z.array(WtfWordSchema).optional(),
});

/** Quality assessment schema */
export const WtfQualitySchema = z.object({
  audio_quality: z.enum(["excellent", "good", "fair", "poor"]).optional(),
  background_noise: z.number().min(0).max(1).optional(),
  multiple_speakers: z.boolean().optional(),
  overlapping_speech: z.boolean().optional(),
  silence_ratio: z.number().min(0).max(1).optional(),
  average_confidence: z.number().min(0).max(1),
  low_confidence_words: z.number().int().nonnegative().optional(),
  processing_warnings: z.array(z.string()).optional(),
});

/** Entity enrichment schema */
export const WtfEntitySchema = z.object({
  text: z.string(),
  type: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
});

/** Topic enrichment schema */
export const WtfTopicSchema = z.object({
  topic: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Sentiment enrichment schema */
export const WtfSentimentSchema = z.object({
  overall: z.enum(["positive", "negative", "neutral", "mixed"]),
  score: z.number().min(-1).max(1),
  segments: z
    .array(
      z.object({
        segment_id: z.number().int().nonnegative(),
        sentiment: z.string(),
        score: z.number().min(-1).max(1),
      })
    )
    .optional(),
});

/** Keyword enrichment schema */
export const WtfKeywordSchema = z.object({
  word: z.string(),
  relevance: z.number().min(0).max(1),
  count: z.number().int().positive(),
});

/** Enrichments schema */
export const WtfEnrichmentsSchema = z.object({
  entities: z.array(WtfEntitySchema).optional(),
  topics: z.array(WtfTopicSchema).optional(),
  sentiment: WtfSentimentSchema.optional(),
  keywords: z.array(WtfKeywordSchema).optional(),
});

/** Extensions schema */
export const WtfExtensionsSchema = z.record(z.record(z.unknown()));

/** Streaming state schema */
export const WtfStreamingSchema = z.object({
  is_final: z.boolean(),
  sequence_number: z.number().int().nonnegative().optional(),
  stability: z.number().min(0).max(1).optional(),
});

/** Complete WTF transcription schema */
export const WtfTranscriptionSchema = z.object({
  // Required sections
  transcript: WtfTranscriptSchema,
  segments: z.array(WtfSegmentSchema),
  metadata: WtfMetadataSchema,

  // Optional sections
  words: z.array(WtfWordSchema).optional(),
  speakers: z.record(WtfSpeakerSchema).optional(),
  alternatives: z.array(WtfAlternativeSchema).optional(),
  quality: WtfQualitySchema.optional(),
  enrichments: WtfEnrichmentsSchema.optional(),
  extensions: WtfExtensionsSchema.optional(),
  streaming: WtfStreamingSchema.optional(),
});

/** WTF analysis entry schema for VCON */
export const WtfAnalysisSchema = z.object({
  type: z.literal("wtf_transcription"),
  dialog: z.union([
    z.number().int().nonnegative(),
    z.array(z.number().int().nonnegative()),
  ]),
  mediatype: z.literal("application/json"),
  vendor: z.string().min(1),
  product: z.string().optional(),
  schema: z.literal("wtf-1.0"),
  body: WtfTranscriptionSchema,
  encoding: z.literal("json"),
});

/** Type inference helpers */
export type WtfTranscriptionInput = z.input<typeof WtfTranscriptionSchema>;
export type WtfTranscriptionOutput = z.output<typeof WtfTranscriptionSchema>;
export type WtfAnalysisInput = z.input<typeof WtfAnalysisSchema>;
export type WtfAnalysisOutput = z.output<typeof WtfAnalysisSchema>;
