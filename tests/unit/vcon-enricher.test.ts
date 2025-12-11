import { describe, it, expect } from "vitest";
import {
  createWtfTranscription,
  createWtfAnalysis,
  enrichVconWithTranscriptions,
  type EnrichmentInput,
} from "../../src/services/vcon-enricher.js";
import type { NormalizedVcon } from "../../src/types/vcon.js";
import type { TranscribeResult } from "../../src/services/nvidia-asr.js";

describe("vcon-enricher", () => {
  const mockTranscribeResult: TranscribeResult = {
    text: "Hello, how can I help you today?",
    language: "en-US",
    duration: 3.0,
    confidence: 0.95,
    segments: [
      {
        text: "Hello, how can I help you today?",
        start: 0.0,
        end: 3.0,
        confidence: 0.95,
        speaker: "0",
        words: [
          { word: "Hello", start: 0.0, end: 0.3, confidence: 0.98 },
          { word: ",", start: 0.3, end: 0.35, confidence: 1.0 },
          { word: "how", start: 0.4, end: 0.6, confidence: 0.96 },
          { word: "can", start: 0.65, end: 0.85, confidence: 0.94 },
          { word: "I", start: 0.9, end: 1.0, confidence: 0.99 },
          { word: "help", start: 1.05, end: 1.3, confidence: 0.95 },
          { word: "you", start: 1.35, end: 1.5, confidence: 0.93 },
          { word: "today", start: 1.55, end: 1.9, confidence: 0.92 },
          { word: "?", start: 1.9, end: 1.95, confidence: 1.0 },
        ],
      },
    ],
    processingTime: 500,
  };

  describe("createWtfTranscription", () => {
    it("should create a valid WTF transcription from NVIDIA result", () => {
      const input: EnrichmentInput = {
        dialogIndex: 0,
        transcription: mockTranscribeResult,
        model: "parakeet-tdt-1.1b",
        audioDuration: 3.0,
      };

      const wtf = createWtfTranscription(input);

      // Check required fields
      expect(wtf.transcript.text).toBe(mockTranscribeResult.text);
      expect(wtf.transcript.language).toBe("en-US");
      expect(wtf.transcript.duration).toBe(3.0);
      expect(wtf.transcript.confidence).toBe(0.95);

      // Check segments
      expect(wtf.segments).toHaveLength(1);
      expect(wtf.segments[0]?.text).toBe(mockTranscribeResult.text);

      // Check metadata
      expect(wtf.metadata.provider).toBe("nvidia");
      expect(wtf.metadata.model).toBe("parakeet-tdt-1.1b");
      expect(wtf.metadata.processing_time).toBe(0.5); // 500ms -> 0.5s

      // Check words
      expect(wtf.words).toBeDefined();
      expect(wtf.words?.length).toBeGreaterThan(0);

      // Check punctuation detection
      const comma = wtf.words?.find((w) => w.text === ",");
      expect(comma?.is_punctuation).toBe(true);

      // Check quality
      expect(wtf.quality?.average_confidence).toBe(0.95);
    });

    it("should handle transcription without word-level data", () => {
      const simpleResult: TranscribeResult = {
        text: "Simple transcription",
        language: "en-US",
        duration: 2.0,
        confidence: 0.9,
        segments: [
          {
            text: "Simple transcription",
            start: 0.0,
            end: 2.0,
            confidence: 0.9,
          },
        ],
        processingTime: 300,
      };

      const input: EnrichmentInput = {
        dialogIndex: 0,
        transcription: simpleResult,
        model: "parakeet-ctc-1.1b",
      };

      const wtf = createWtfTranscription(input);

      expect(wtf.transcript.text).toBe("Simple transcription");
      expect(wtf.segments).toHaveLength(1);
      // Words may be empty when not provided
    });

    it("should detect multiple speakers", () => {
      const multiSpeakerResult: TranscribeResult = {
        text: "Hello. Hi there.",
        language: "en-US",
        duration: 4.0,
        confidence: 0.92,
        segments: [
          {
            text: "Hello.",
            start: 0.0,
            end: 1.5,
            confidence: 0.95,
            speaker: "0",
          },
          {
            text: "Hi there.",
            start: 2.0,
            end: 4.0,
            confidence: 0.89,
            speaker: "1",
          },
        ],
        processingTime: 400,
      };

      const input: EnrichmentInput = {
        dialogIndex: 0,
        transcription: multiSpeakerResult,
        model: "parakeet-tdt-1.1b",
      };

      const wtf = createWtfTranscription(input);

      expect(wtf.speakers).toBeDefined();
      expect(Object.keys(wtf.speakers || {})).toHaveLength(2);
      expect(wtf.quality?.multiple_speakers).toBe(true);
    });
  });

  describe("createWtfAnalysis", () => {
    it("should create a valid WTF analysis entry", () => {
      const input: EnrichmentInput = {
        dialogIndex: 0,
        transcription: mockTranscribeResult,
        model: "parakeet-tdt-1.1b",
      };

      const wtf = createWtfTranscription(input);
      const analysis = createWtfAnalysis(0, wtf, "parakeet-tdt-1.1b");

      expect(analysis.type).toBe("wtf_transcription");
      expect(analysis.dialog).toBe(0);
      expect(analysis.mediatype).toBe("application/json");
      expect(analysis.vendor).toBe("nvidia");
      expect(analysis.product).toBe("parakeet-tdt-1.1b");
      expect(analysis.schema).toBe("wtf-1.0");
      expect(analysis.encoding).toBe("json");
      expect(analysis.body).toBe(wtf);
    });
  });

  describe("enrichVconWithTranscriptions", () => {
    it("should add WTF analysis to VCON", () => {
      const vcon: NormalizedVcon = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
        dialog: [
          {
            type: "recording",
            start: "2024-01-15T10:30:00.000Z",
            duration: 3.0,
            parties: [0],
            mediatype: "audio/wav",
          },
        ],
        analysis: [],
        attachments: [],
      };

      const enrichments: EnrichmentInput[] = [
        {
          dialogIndex: 0,
          transcription: mockTranscribeResult,
          model: "parakeet-tdt-1.1b",
          audioDuration: 3.0,
        },
      ];

      const enriched = enrichVconWithTranscriptions(vcon, enrichments);

      expect(enriched.analysis).toHaveLength(1);
      expect(enriched.analysis[0]?.type).toBe("wtf_transcription");
      expect(enriched.updated_at).toBeDefined();
    });

    it("should preserve existing analysis entries", () => {
      const vcon: NormalizedVcon = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
        dialog: [],
        analysis: [
          {
            type: "summary",
            vendor: "other",
            body: "Existing summary",
          },
        ],
        attachments: [],
      };

      const enrichments: EnrichmentInput[] = [
        {
          dialogIndex: 0,
          transcription: mockTranscribeResult,
          model: "parakeet-tdt-1.1b",
        },
      ];

      const enriched = enrichVconWithTranscriptions(vcon, enrichments);

      expect(enriched.analysis).toHaveLength(2);
      expect(enriched.analysis[0]?.type).toBe("summary");
      expect(enriched.analysis[1]?.type).toBe("wtf_transcription");
    });

    it("should handle multiple dialog transcriptions", () => {
      const vcon: NormalizedVcon = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
        dialog: [
          {
            type: "recording",
            start: "2024-01-15T10:30:00.000Z",
            parties: [0],
            mediatype: "audio/wav",
          },
          {
            type: "recording",
            start: "2024-01-15T10:35:00.000Z",
            parties: [0],
            mediatype: "audio/wav",
          },
        ],
        analysis: [],
        attachments: [],
      };

      const enrichments: EnrichmentInput[] = [
        {
          dialogIndex: 0,
          transcription: mockTranscribeResult,
          model: "parakeet-tdt-1.1b",
        },
        {
          dialogIndex: 1,
          transcription: {
            ...mockTranscribeResult,
            text: "Second dialog",
          },
          model: "parakeet-tdt-1.1b",
        },
      ];

      const enriched = enrichVconWithTranscriptions(vcon, enrichments);

      expect(enriched.analysis).toHaveLength(2);
      expect((enriched.analysis[0] as any).dialog).toBe(0);
      expect((enriched.analysis[1] as any).dialog).toBe(1);
    });
  });
});
