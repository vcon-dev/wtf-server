/**
 * Audio utility functions for extracting and processing audio from VCON dialogs
 */

import { request } from "undici";
import type { Dialog } from "../types/vcon.js";

/** Supported audio MIME types */
export const SUPPORTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/flac",
  "audio/ogg",
  "audio/webm",
  "audio/x-m4a",
  "audio/mp4",
] as const;

export type SupportedAudioType = (typeof SUPPORTED_AUDIO_TYPES)[number];

/** Check if a media type is a supported audio format */
export function isSupportedAudioType(mediatype: string): boolean {
  return SUPPORTED_AUDIO_TYPES.includes(mediatype as SupportedAudioType);
}

/** Check if a dialog contains audio */
export function isAudioDialog(dialog: Dialog): boolean {
  if (dialog.type !== "recording") return false;
  if (!dialog.mediatype) return false;
  return isSupportedAudioType(dialog.mediatype);
}

/** Decode base64url to Buffer */
export function decodeBase64Url(base64url: string): Buffer {
  // Convert base64url to base64
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/** Encode Buffer to base64url */
export function encodeBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Extract audio bytes from a dialog */
export async function extractAudioFromDialog(
  dialog: Dialog
): Promise<{ buffer: Buffer; mediatype: string } | null> {
  if (!isAudioDialog(dialog)) {
    return null;
  }

  const mediatype = dialog.mediatype!;

  // Handle inline body
  if (dialog.body) {
    const encoding = dialog.encoding ?? "base64url";

    if (encoding === "base64url") {
      return {
        buffer: decodeBase64Url(dialog.body),
        mediatype,
      };
    } else if (encoding === "none") {
      // Raw binary in body (unusual but possible)
      return {
        buffer: Buffer.from(dialog.body, "binary"),
        mediatype,
      };
    }
  }

  // Handle URL reference
  if (dialog.url) {
    const response = await request(dialog.url, {
      method: "GET",
      throwOnError: true,
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
    }

    return {
      buffer: Buffer.concat(chunks),
      mediatype,
    };
  }

  return null;
}

/** Get audio format from MIME type for NVIDIA NIM */
export function getAudioFormat(
  mediatype: string
): "pcm16" | "wav" | "mp3" | "flac" | "ogg" {
  const type = mediatype.toLowerCase();

  if (type.includes("wav") || type.includes("wave")) {
    return "wav";
  }
  if (type.includes("mp3") || type.includes("mpeg")) {
    return "mp3";
  }
  if (type.includes("flac")) {
    return "flac";
  }
  if (type.includes("ogg") || type.includes("webm")) {
    return "ogg";
  }

  // Default to wav for unknown types
  return "wav";
}

/** Estimate audio duration from file size (rough estimate) */
export function estimateAudioDuration(
  sizeBytes: number,
  mediatype: string
): number {
  // Very rough estimates based on typical bitrates
  const bytesPerSecond: Record<string, number> = {
    "audio/wav": 176400, // 44.1kHz, 16-bit, stereo
    "audio/wave": 176400,
    "audio/x-wav": 176400,
    "audio/mp3": 16000, // 128kbps
    "audio/mpeg": 16000,
    "audio/flac": 88200, // ~50% of wav
    "audio/ogg": 16000,
  };

  const bps = bytesPerSecond[mediatype] ?? 16000;
  return sizeBytes / bps;
}
