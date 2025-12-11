import { describe, it, expect } from "vitest";
import {
  isSupportedAudioType,
  isAudioDialog,
  decodeBase64Url,
  encodeBase64Url,
  getAudioFormat,
} from "../../src/utils/audio.js";
import { extractAudioFromDialogs, validateAudio } from "../../src/services/audio-extractor.js";
import type { Dialog } from "../../src/types/vcon.js";

describe("audio utilities", () => {
  describe("isSupportedAudioType", () => {
    it("should return true for supported audio types", () => {
      expect(isSupportedAudioType("audio/wav")).toBe(true);
      expect(isSupportedAudioType("audio/mp3")).toBe(true);
      expect(isSupportedAudioType("audio/mpeg")).toBe(true);
      expect(isSupportedAudioType("audio/flac")).toBe(true);
      expect(isSupportedAudioType("audio/ogg")).toBe(true);
    });

    it("should return false for unsupported types", () => {
      expect(isSupportedAudioType("video/mp4")).toBe(false);
      expect(isSupportedAudioType("text/plain")).toBe(false);
      expect(isSupportedAudioType("application/json")).toBe(false);
    });
  });

  describe("isAudioDialog", () => {
    it("should return true for audio recording dialogs", () => {
      const dialog: Dialog = {
        type: "recording",
        start: "2024-01-15T10:30:00.000Z",
        parties: [0],
        mediatype: "audio/wav",
      };

      expect(isAudioDialog(dialog)).toBe(true);
    });

    it("should return false for text dialogs", () => {
      const dialog: Dialog = {
        type: "text",
        start: "2024-01-15T10:30:00.000Z",
        parties: [0],
        mediatype: "text/plain",
      };

      expect(isAudioDialog(dialog)).toBe(false);
    });

    it("should return false for recording without mediatype", () => {
      const dialog: Dialog = {
        type: "recording",
        start: "2024-01-15T10:30:00.000Z",
        parties: [0],
      };

      expect(isAudioDialog(dialog)).toBe(false);
    });
  });

  describe("base64url encoding", () => {
    it("should decode base64url to buffer", () => {
      const encoded = "SGVsbG8gV29ybGQ"; // "Hello World" without padding
      const decoded = decodeBase64Url(encoded);

      expect(decoded.toString("utf-8")).toBe("Hello World");
    });

    it("should encode buffer to base64url", () => {
      const buffer = Buffer.from("Hello World");
      const encoded = encodeBase64Url(buffer);

      expect(encoded).toBe("SGVsbG8gV29ybGQ");
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });

    it("should handle round-trip encoding", () => {
      const original = "Test data with special chars: +/=";
      const buffer = Buffer.from(original);
      const encoded = encodeBase64Url(buffer);
      const decoded = decodeBase64Url(encoded);

      expect(decoded.toString("utf-8")).toBe(original);
    });
  });

  describe("getAudioFormat", () => {
    it("should return correct format for wav", () => {
      expect(getAudioFormat("audio/wav")).toBe("wav");
      expect(getAudioFormat("audio/wave")).toBe("wav");
      expect(getAudioFormat("audio/x-wav")).toBe("wav");
    });

    it("should return correct format for mp3", () => {
      expect(getAudioFormat("audio/mp3")).toBe("mp3");
      expect(getAudioFormat("audio/mpeg")).toBe("mp3");
    });

    it("should return correct format for flac", () => {
      expect(getAudioFormat("audio/flac")).toBe("flac");
    });

    it("should return correct format for ogg", () => {
      expect(getAudioFormat("audio/ogg")).toBe("ogg");
      expect(getAudioFormat("audio/webm")).toBe("ogg");
    });
  });
});

describe("audio-extractor service", () => {
  describe("extractAudioFromDialogs", () => {
    it("should extract audio from valid dialogs", async () => {
      const dialogs = [
        {
          index: 0,
          dialog: {
            type: "recording" as const,
            start: "2024-01-15T10:30:00.000Z",
            parties: [0],
            mediatype: "audio/wav",
            body: "SGVsbG8gV29ybGQ", // "Hello World"
            encoding: "base64url" as const,
          },
        },
      ];

      const result = await extractAudioFromDialogs(dialogs);

      expect(result.extracted).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.extracted[0]?.dialogIndex).toBe(0);
      expect(result.extracted[0]?.buffer.toString("utf-8")).toBe("Hello World");
    });

    it("should skip non-audio dialogs", async () => {
      const dialogs = [
        {
          index: 0,
          dialog: {
            type: "text" as const,
            start: "2024-01-15T10:30:00.000Z",
            parties: [0],
            mediatype: "text/plain",
          },
        },
      ];

      const result = await extractAudioFromDialogs(dialogs);

      expect(result.extracted).toHaveLength(0);
      expect(result.skipped).toContain(0);
    });

    it("should report errors for dialogs without body or url", async () => {
      const dialogs = [
        {
          index: 0,
          dialog: {
            type: "recording" as const,
            start: "2024-01-15T10:30:00.000Z",
            parties: [0],
            mediatype: "audio/wav",
            // no body or url
          },
        },
      ];

      const result = await extractAudioFromDialogs(dialogs);

      expect(result.extracted).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.dialogIndex).toBe(0);
    });
  });

  describe("validateAudio", () => {
    it("should accept valid audio", () => {
      const audio = {
        dialogIndex: 0,
        buffer: Buffer.alloc(1000),
        mediatype: "audio/wav",
      };

      const error = validateAudio(audio);

      expect(error).toBeNull();
    });

    it("should reject unsupported mediatype", () => {
      const audio = {
        dialogIndex: 0,
        buffer: Buffer.alloc(1000),
        mediatype: "video/mp4",
      };

      const error = validateAudio(audio);

      expect(error).toContain("Unsupported audio format");
    });

    it("should reject too small audio", () => {
      const audio = {
        dialogIndex: 0,
        buffer: Buffer.alloc(10),
        mediatype: "audio/wav",
      };

      const error = validateAudio(audio);

      expect(error).toContain("too small");
    });
  });
});
