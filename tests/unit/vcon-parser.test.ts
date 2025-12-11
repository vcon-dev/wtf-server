import { describe, it, expect } from "vitest";
import { parseVcon, normalizeVcon } from "../../src/services/vcon-parser.js";
import type { Vcon } from "../../src/types/vcon.js";

describe("vcon-parser", () => {
  describe("parseVcon", () => {
    it("should parse a valid VCON", () => {
      const input = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test User", role: "customer" }],
        dialog: [
          {
            type: "recording",
            start: "2024-01-15T10:30:00.000Z",
            duration: 60,
            parties: [0],
            mediatype: "audio/wav",
            body: "dGVzdA",
            encoding: "base64url",
          },
        ],
      };

      const result = parseVcon(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.vcon.uuid).toBe(input.uuid);
        expect(result.vcon.parties).toHaveLength(1);
        expect(result.audioDialogs).toHaveLength(1);
      }
    });

    it("should reject VCON with invalid UUID", () => {
      const input = {
        vcon: "0.0.2",
        uuid: "not-a-uuid",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
      };

      const result = parseVcon(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.details).toBeDefined();
        expect(result.details?.some((d) => d.path.includes("uuid"))).toBe(true);
      }
    });

    it("should reject VCON with invalid version format", () => {
      const input = {
        vcon: "1.0",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
      };

      const result = parseVcon(input);

      expect(result.success).toBe(false);
    });

    it("should reject VCON without parties", () => {
      const input = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [],
      };

      const result = parseVcon(input);

      expect(result.success).toBe(false);
    });

    it("should identify audio dialogs correctly", () => {
      const input = {
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
            body: "dGVzdA",
            encoding: "base64url",
          },
          {
            type: "text",
            start: "2024-01-15T10:31:00.000Z",
            parties: [0],
            mediatype: "text/plain",
            body: "Hello",
            encoding: "none",
          },
          {
            type: "recording",
            start: "2024-01-15T10:32:00.000Z",
            parties: [0],
            mediatype: "audio/mp3",
            body: "dGVzdDI",
            encoding: "base64url",
          },
        ],
      };

      const result = parseVcon(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.audioDialogs).toHaveLength(2);
        expect(result.audioDialogs[0]?.index).toBe(0);
        expect(result.audioDialogs[1]?.index).toBe(2);
      }
    });

    it("should accept valid party roles", () => {
      const input = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [
          { name: "Agent", role: "agent" },
          { name: "Customer", role: "customer" },
          { name: "Supervisor", role: "supervisor" },
        ],
      };

      const result = parseVcon(input);

      expect(result.success).toBe(true);
    });
  });

  describe("normalizeVcon", () => {
    it("should add empty arrays for missing optional fields", () => {
      const vcon: Vcon = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
      };

      const normalized = normalizeVcon(vcon);

      expect(normalized.dialog).toEqual([]);
      expect(normalized.analysis).toEqual([]);
      expect(normalized.attachments).toEqual([]);
    });

    it("should preserve existing arrays", () => {
      const vcon: Vcon = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
        dialog: [
          {
            type: "text",
            start: "2024-01-15T10:30:00.000Z",
            parties: [0],
          },
        ],
        analysis: [
          {
            type: "summary",
            vendor: "test",
            body: "Summary text",
          },
        ],
      };

      const normalized = normalizeVcon(vcon);

      expect(normalized.dialog).toHaveLength(1);
      expect(normalized.analysis).toHaveLength(1);
      expect(normalized.attachments).toEqual([]);
    });
  });
});
