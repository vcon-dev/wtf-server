import { describe, it, expect } from "vitest";
import {
  WtfTranscriptionSchema,
  WtfAnalysisSchema,
  WtfSegmentSchema,
  WtfWordSchema,
} from "../../src/schemas/wtf.schema.js";

describe("WTF Schema Validation", () => {
  describe("WtfSegmentSchema", () => {
    it("should accept valid segment", () => {
      const segment = {
        id: 0,
        start: 0.0,
        end: 2.5,
        text: "Hello world",
        confidence: 0.95,
        speaker: 0,
        words: [0, 1],
      };

      const result = WtfSegmentSchema.safeParse(segment);

      expect(result.success).toBe(true);
    });

    it("should reject segment where end < start", () => {
      const segment = {
        id: 0,
        start: 5.0,
        end: 2.5,
        text: "Invalid",
        confidence: 0.95,
      };

      const result = WtfSegmentSchema.safeParse(segment);

      expect(result.success).toBe(false);
    });

    it("should reject invalid confidence score", () => {
      const segment = {
        id: 0,
        start: 0.0,
        end: 2.5,
        text: "Test",
        confidence: 1.5, // > 1.0
      };

      const result = WtfSegmentSchema.safeParse(segment);

      expect(result.success).toBe(false);
    });
  });

  describe("WtfWordSchema", () => {
    it("should accept valid word with punctuation flag", () => {
      const word = {
        id: 0,
        start: 0.0,
        end: 0.1,
        text: ",",
        confidence: 1.0,
        is_punctuation: true,
      };

      const result = WtfWordSchema.safeParse(word);

      expect(result.success).toBe(true);
    });

    it("should accept word with speaker", () => {
      const word = {
        id: 0,
        start: 0.0,
        end: 0.5,
        text: "Hello",
        confidence: 0.98,
        speaker: 1,
      };

      const result = WtfWordSchema.safeParse(word);

      expect(result.success).toBe(true);
    });
  });

  describe("WtfTranscriptionSchema", () => {
    it("should accept minimal valid transcription", () => {
      const transcription = {
        transcript: {
          text: "Hello world",
          language: "en-US",
          duration: 2.0,
          confidence: 0.95,
        },
        segments: [
          {
            id: 0,
            start: 0.0,
            end: 2.0,
            text: "Hello world",
            confidence: 0.95,
          },
        ],
        metadata: {
          created_at: "2024-01-15T10:30:00.000Z",
          processed_at: "2024-01-15T10:30:05.000Z",
          provider: "nvidia",
          model: "parakeet-tdt-1.1b",
        },
      };

      const result = WtfTranscriptionSchema.safeParse(transcription);

      expect(result.success).toBe(true);
    });

    it("should accept full transcription with all optional fields", () => {
      const transcription = {
        transcript: {
          text: "Hello world",
          language: "en-US",
          duration: 2.0,
          confidence: 0.95,
        },
        segments: [
          {
            id: 0,
            start: 0.0,
            end: 2.0,
            text: "Hello world",
            confidence: 0.95,
            speaker: 0,
            words: [0, 1],
          },
        ],
        metadata: {
          created_at: "2024-01-15T10:30:00.000Z",
          processed_at: "2024-01-15T10:30:05.000Z",
          provider: "nvidia",
          model: "parakeet-tdt-1.1b",
          processing_time: 5.0,
          audio: {
            duration: 2.0,
            sample_rate: 16000,
            channels: 1,
            format: "wav",
          },
        },
        words: [
          { id: 0, start: 0.0, end: 0.5, text: "Hello", confidence: 0.96 },
          { id: 1, start: 0.6, end: 1.0, text: "world", confidence: 0.94 },
        ],
        speakers: {
          "0": {
            id: 0,
            label: "Speaker 0",
            segments: [0],
            total_time: 2.0,
          },
        },
        quality: {
          audio_quality: "good",
          average_confidence: 0.95,
          multiple_speakers: false,
        },
      };

      const result = WtfTranscriptionSchema.safeParse(transcription);

      expect(result.success).toBe(true);
    });

    it("should reject transcription without required transcript", () => {
      const transcription = {
        segments: [],
        metadata: {
          created_at: "2024-01-15T10:30:00.000Z",
          processed_at: "2024-01-15T10:30:05.000Z",
          provider: "nvidia",
          model: "parakeet-tdt-1.1b",
        },
      };

      const result = WtfTranscriptionSchema.safeParse(transcription);

      expect(result.success).toBe(false);
    });
  });

  describe("WtfAnalysisSchema", () => {
    it("should accept valid WTF analysis entry", () => {
      const analysis = {
        type: "wtf_transcription",
        dialog: 0,
        mediatype: "application/json",
        vendor: "nvidia",
        product: "parakeet-tdt-1.1b",
        schema: "wtf-1.0",
        body: {
          transcript: {
            text: "Hello",
            language: "en-US",
            duration: 1.0,
            confidence: 0.95,
          },
          segments: [
            {
              id: 0,
              start: 0.0,
              end: 1.0,
              text: "Hello",
              confidence: 0.95,
            },
          ],
          metadata: {
            created_at: "2024-01-15T10:30:00.000Z",
            processed_at: "2024-01-15T10:30:01.000Z",
            provider: "nvidia",
            model: "parakeet-tdt-1.1b",
          },
        },
        encoding: "json",
      };

      const result = WtfAnalysisSchema.safeParse(analysis);

      expect(result.success).toBe(true);
    });

    it("should accept analysis with dialog array", () => {
      const analysis = {
        type: "wtf_transcription",
        dialog: [0, 1, 2],
        mediatype: "application/json",
        vendor: "nvidia",
        schema: "wtf-1.0",
        body: {
          transcript: {
            text: "Test",
            language: "en-US",
            duration: 1.0,
            confidence: 0.9,
          },
          segments: [],
          metadata: {
            created_at: "2024-01-15T10:30:00.000Z",
            processed_at: "2024-01-15T10:30:01.000Z",
            provider: "nvidia",
            model: "canary-1b",
          },
        },
        encoding: "json",
      };

      const result = WtfAnalysisSchema.safeParse(analysis);

      expect(result.success).toBe(true);
    });

    it("should reject analysis with wrong type", () => {
      const analysis = {
        type: "transcript", // should be "wtf_transcription"
        dialog: 0,
        mediatype: "application/json",
        vendor: "nvidia",
        schema: "wtf-1.0",
        body: {},
        encoding: "json",
      };

      const result = WtfAnalysisSchema.safeParse(analysis);

      expect(result.success).toBe(false);
    });

    it("should reject analysis with wrong schema", () => {
      const analysis = {
        type: "wtf_transcription",
        dialog: 0,
        mediatype: "application/json",
        vendor: "nvidia",
        schema: "wtf-2.0", // should be "wtf-1.0"
        body: {},
        encoding: "json",
      };

      const result = WtfAnalysisSchema.safeParse(analysis);

      expect(result.success).toBe(false);
    });
  });
});
