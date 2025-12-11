/**
 * Audio Extractor Service
 * Extracts audio content from VCON dialogs
 */

import type { Dialog } from "../types/vcon.js";
import {
  extractAudioFromDialog,
  isAudioDialog,
  SUPPORTED_AUDIO_TYPES,
} from "../utils/audio.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

export interface ExtractedAudio {
  dialogIndex: number;
  buffer: Buffer;
  mediatype: string;
  duration?: number;
}

export interface ExtractionError {
  dialogIndex: number;
  error: string;
}

export interface ExtractionResult {
  extracted: ExtractedAudio[];
  errors: ExtractionError[];
  skipped: number[];
}

/**
 * Extract audio from multiple dialogs
 */
export async function extractAudioFromDialogs(
  dialogs: Array<{ index: number; dialog: Dialog }>
): Promise<ExtractionResult> {
  const maxSizeBytes = config.maxAudioSizeMb * 1024 * 1024;
  const result: ExtractionResult = {
    extracted: [],
    errors: [],
    skipped: [],
  };

  for (const { index, dialog } of dialogs) {
    // Skip non-audio dialogs
    if (!isAudioDialog(dialog)) {
      result.skipped.push(index);
      continue;
    }

    try {
      const audio = await extractAudioFromDialog(dialog);

      if (!audio) {
        result.errors.push({
          dialogIndex: index,
          error: "Failed to extract audio content",
        });
        continue;
      }

      // Check size limit
      if (audio.buffer.length > maxSizeBytes) {
        result.errors.push({
          dialogIndex: index,
          error: `Audio exceeds maximum size of ${config.maxAudioSizeMb}MB`,
        });
        continue;
      }

      result.extracted.push({
        dialogIndex: index,
        buffer: audio.buffer,
        mediatype: audio.mediatype,
        duration: dialog.duration,
      });

      logger.debug(
        {
          dialogIndex: index,
          size: audio.buffer.length,
          mediatype: audio.mediatype,
        },
        "Audio extracted from dialog"
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown extraction error";
      result.errors.push({
        dialogIndex: index,
        error: message,
      });

      logger.error({ error, dialogIndex: index }, "Audio extraction failed");
    }
  }

  logger.info(
    {
      extracted: result.extracted.length,
      errors: result.errors.length,
      skipped: result.skipped.length,
    },
    "Audio extraction completed"
  );

  return result;
}

/**
 * Validate audio content before processing
 */
export function validateAudio(audio: ExtractedAudio): string | null {
  // Check if mediatype is supported
  if (
    !SUPPORTED_AUDIO_TYPES.includes(
      audio.mediatype as (typeof SUPPORTED_AUDIO_TYPES)[number]
    )
  ) {
    return `Unsupported audio format: ${audio.mediatype}`;
  }

  // Check minimum size (avoid empty or corrupted files)
  if (audio.buffer.length < 100) {
    return "Audio content too small, likely corrupted";
  }

  return null;
}
