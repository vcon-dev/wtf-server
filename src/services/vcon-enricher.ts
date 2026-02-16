/**
 * VCON Enricher Service
 * Adds WTF transcription analysis to VCON documents
 */

import type { NormalizedVcon, Analysis } from "../types/vcon.js";
import type {
  WtfTranscription,
  WtfSegment,
  WtfWord,
  WtfSpeaker,
  WtfQuality,
  WtfAnalysis,
} from "../types/wtf.js";
import type { AsrProvider, AsrTranscribeResult } from "../types/asr.js";
import { logger } from "../utils/logger.js";

export interface EnrichmentInput {
  dialogIndex: number;
  transcription: AsrTranscribeResult;
  provider: AsrProvider;
  model?: string;
  audioDuration?: number;
}

/**
 * Create a WTF transcription object from ASR result
 */
export function createWtfTranscription(
  input: EnrichmentInput
): WtfTranscription {
  const { transcription, provider, model, audioDuration } = input;
  const now = new Date().toISOString();

  // Build words array
  const words: WtfWord[] = [];
  let wordId = 0;

  if (transcription.words) {
    for (const w of transcription.words) {
      words.push({
        id: wordId++,
        start: w.start,
        end: w.end,
        text: w.word,
        confidence: w.confidence,
        is_punctuation: /^[.,!?;:'"()-]$/.test(w.word),
      });
    }
  } else if (transcription.segments) {
    // Extract words from segments if top-level words not available
    for (const seg of transcription.segments) {
      if (seg.words) {
        for (const w of seg.words) {
          words.push({
            id: wordId++,
            start: w.start,
            end: w.end,
            text: w.word,
            confidence: w.confidence,
            speaker: seg.speaker ? parseInt(seg.speaker, 10) : undefined,
            is_punctuation: /^[.,!?;:'"()-]$/.test(w.word),
          });
        }
      }
    }
  }

  // Build segments array
  const segments: WtfSegment[] = transcription.segments.map((seg, idx) => {
    // Find word indices that belong to this segment
    const segmentWordIds = words
      .filter((w) => w.start >= seg.start && w.end <= seg.end)
      .map((w) => w.id);

    return {
      id: idx,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: seg.confidence,
      speaker: seg.speaker ? parseInt(seg.speaker, 10) : undefined,
      words: segmentWordIds.length > 0 ? segmentWordIds : undefined,
    };
  });

  // Build speakers map
  const speakers: Record<string, WtfSpeaker> = {};
  const speakerSegments = new Map<string, number[]>();
  const speakerTimes = new Map<string, number>();

  for (const seg of segments) {
    if (seg.speaker !== undefined) {
      const speakerId = String(seg.speaker);
      if (!speakerSegments.has(speakerId)) {
        speakerSegments.set(speakerId, []);
        speakerTimes.set(speakerId, 0);
      }
      speakerSegments.get(speakerId)!.push(seg.id);
      speakerTimes.set(
        speakerId,
        speakerTimes.get(speakerId)! + (seg.end - seg.start)
      );
    }
  }

  for (const [speakerId, segIds] of speakerSegments) {
    speakers[speakerId] = {
      id: parseInt(speakerId, 10),
      label: `Speaker ${speakerId}`,
      segments: segIds,
      total_time: speakerTimes.get(speakerId),
    };
  }

  // Calculate quality metrics
  const lowConfidenceWords = words.filter((w) => w.confidence < 0.7).length;
  const quality: WtfQuality = {
    average_confidence: transcription.confidence,
    low_confidence_words: lowConfidenceWords,
    multiple_speakers: Object.keys(speakers).length > 1,
    processing_warnings:
      lowConfidenceWords > words.length * 0.1
        ? ["High number of low-confidence words"]
        : [],
  };

  const wtf: WtfTranscription = {
    transcript: {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration,
      confidence: transcription.confidence,
    },
    segments,
    metadata: {
      created_at: now,
      processed_at: now,
      provider,
      model,
      processing_time: transcription.processingTime / 1000, // Convert to seconds
      audio: audioDuration
        ? {
            duration: audioDuration,
          }
        : undefined,
    },
    words: words.length > 0 ? words : undefined,
    speakers: Object.keys(speakers).length > 0 ? speakers : undefined,
    quality,
  };

  return wtf;
}

/**
 * Create a WTF analysis entry for VCON
 */
export function createWtfAnalysis(
  dialogIndex: number,
  wtf: WtfTranscription,
  provider: AsrProvider,
  model?: string
): WtfAnalysis {
  return {
    type: "wtf_transcription",
    dialog: dialogIndex,
    mediatype: "application/json",
    vendor: provider,
    product: model ?? provider,
    schema: "wtf-1.0",
    body: wtf,
    encoding: "json",
  };
}

/**
 * Enrich a VCON with WTF transcription analysis
 */
export function enrichVconWithTranscriptions(
  vcon: NormalizedVcon,
  enrichments: EnrichmentInput[]
): NormalizedVcon {
  const newAnalyses: Analysis[] = [];

  for (const input of enrichments) {
    const wtf = createWtfTranscription(input);
    const analysis = createWtfAnalysis(
      input.dialogIndex,
      wtf,
      input.provider,
      input.model
    );

    newAnalyses.push(analysis as unknown as Analysis);

    logger.debug(
      {
        dialogIndex: input.dialogIndex,
        provider: input.provider,
        textLength: wtf.transcript.text.length,
        segments: wtf.segments.length,
        words: wtf.words?.length ?? 0,
      },
      "Created WTF analysis for dialog"
    );
  }

  const enrichedVcon: NormalizedVcon = {
    ...vcon,
    updated_at: new Date().toISOString(),
    analysis: [...vcon.analysis, ...newAnalyses],
  };

  logger.info(
    {
      uuid: vcon.uuid,
      newAnalyses: newAnalyses.length,
      totalAnalyses: enrichedVcon.analysis.length,
    },
    "VCON enriched with transcriptions"
  );

  return enrichedVcon;
}
