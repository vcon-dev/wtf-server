/**
 * VCON Parser Service
 * Validates and parses incoming VCON documents
 */

import { ZodError } from "zod";
import { VconSchema } from "../schemas/vcon.schema.js";
import type { Vcon, NormalizedVcon, Dialog } from "../types/vcon.js";
import { isAudioDialog } from "../utils/audio.js";
import { logger } from "../utils/logger.js";

export interface ParseResult {
  success: true;
  vcon: NormalizedVcon;
  audioDialogs: Array<{ index: number; dialog: Dialog }>;
}

export interface ParseError {
  success: false;
  error: string;
  details?: Array<{ path: string; message: string }>;
}

export type VconParseResult = ParseResult | ParseError;

/**
 * Parse and validate a VCON document
 */
export function parseVcon(input: unknown): VconParseResult {
  // Validate against schema
  const result = VconSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));

    logger.warn({ details }, "VCON validation failed");

    return {
      success: false,
      error: "Invalid VCON format",
      details,
    };
  }

  const vcon = normalizeVcon(result.data as Vcon);

  // Find audio dialogs
  const audioDialogs = vcon.dialog
    .map((dialog, index) => ({ index, dialog }))
    .filter(({ dialog }) => isAudioDialog(dialog));

  logger.info(
    {
      uuid: vcon.uuid,
      totalDialogs: vcon.dialog.length,
      audioDialogs: audioDialogs.length,
      parties: vcon.parties.length,
    },
    "VCON parsed successfully"
  );

  return {
    success: true,
    vcon,
    audioDialogs,
  };
}

/**
 * Normalize a VCON to ensure all arrays are present
 */
export function normalizeVcon(vcon: Vcon): NormalizedVcon {
  return {
    ...vcon,
    dialog: vcon.dialog ?? [],
    analysis: vcon.analysis ?? [],
    attachments: vcon.attachments ?? [],
  };
}

/**
 * Format Zod errors for API response
 */
export function formatZodError(error: ZodError): ParseError {
  return {
    success: false,
    error: "Validation failed",
    details: error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  };
}
