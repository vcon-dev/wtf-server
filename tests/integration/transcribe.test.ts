import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/server.js";

// Get the configured provider from environment (loaded by vitest.config.ts)
const configuredProvider = process.env.ASR_PROVIDER || "nvidia";

// Mock the providers module - data must be defined inside the factory
vi.mock("../../src/providers/index.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const providerName = process.env.ASR_PROVIDER || "nvidia";

  // Mock transcription result defined inside the factory
  const mockTranscribeResult = {
    text: "Hello, this is a test transcription.",
    language: "en-US",
    duration: 5.0,
    confidence: 0.95,
    segments: [
      {
        text: "Hello, this is a test transcription.",
        start: 0.0,
        end: 5.0,
        confidence: 0.95,
        speaker: "0",
        words: [
          { word: "Hello", start: 0.0, end: 0.5, confidence: 0.98 },
          { word: ",", start: 0.5, end: 0.55, confidence: 1.0 },
          { word: "this", start: 0.6, end: 0.9, confidence: 0.96 },
          { word: "is", start: 0.95, end: 1.1, confidence: 0.97 },
          { word: "a", start: 1.15, end: 1.25, confidence: 0.99 },
          { word: "test", start: 1.3, end: 1.6, confidence: 0.94 },
          { word: "transcription", start: 1.65, end: 2.2, confidence: 0.93 },
          { word: ".", start: 2.2, end: 2.25, confidence: 1.0 },
        ],
      },
    ],
    processingTime: 1000,
    provider: providerName,
    model: "test-model",
  };

  const mockProvider = {
    provider: providerName as const,
    isConfigured: vi.fn().mockReturnValue(true),
    healthCheck: vi
      .fn()
      .mockResolvedValue({
        status: "ok",
        provider: providerName,
        model: "test-model",
      }),
    transcribe: vi.fn().mockResolvedValue(mockTranscribeResult),
    transcribeBatch: vi
      .fn()
      .mockImplementation((requests: unknown[]) =>
        Promise.resolve(requests.map(() => mockTranscribeResult))
      ),
  };

  return {
    ...original,
    getProvider: vi.fn().mockReturnValue(mockProvider),
    createProvider: vi.fn().mockReturnValue(mockProvider),
    getConfiguredProviderNames: vi.fn().mockReturnValue([providerName]),
    getAvailableProviders: vi.fn().mockReturnValue([mockProvider]),
    clearProviderCache: vi.fn(),
    defaultProvider: mockProvider,
  };
});

describe("Transcribe API Integration Tests", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /health", () => {
    it("should return healthy status", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("GET /health/ready", () => {
    it("should return ready status with provider health", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      // Check for the configured provider (from env or default nvidia)
      expect(body.services[configuredProvider].status).toBe("ok");
    });
  });

  describe("POST /transcribe", () => {
    const validVcon = {
      vcon: "0.0.2",
      uuid: "019371a4-1234-7000-8000-000000000001",
      created_at: "2024-01-15T10:30:00.000Z",
      parties: [
        { name: "Agent", role: "agent" },
        { name: "Customer", role: "customer" },
      ],
      dialog: [
        {
          type: "recording",
          start: "2024-01-15T10:30:00.000Z",
          duration: 5.0,
          parties: [0, 1],
          mediatype: "audio/wav",
          body: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          encoding: "base64url",
        },
      ],
      analysis: [],
    };

    it("should transcribe a valid VCON and return enriched VCON", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/transcribe",
        payload: validVcon,
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);

      // Should have original VCON fields
      expect(body.vcon).toBe("0.0.2");
      expect(body.uuid).toBe(validVcon.uuid);
      expect(body.parties).toHaveLength(2);
      expect(body.dialog).toHaveLength(1);

      // Should have WTF transcription in analysis
      expect(body.analysis).toHaveLength(1);
      expect(body.analysis[0].type).toBe("wtf_transcription");
      expect(body.analysis[0].vendor).toBe(configuredProvider);
      expect(body.analysis[0].schema).toBe("wtf-1.0");
      expect(body.analysis[0].encoding).toBe("json");

      // Should have valid WTF body
      const wtf = body.analysis[0].body;
      expect(wtf.transcript.text).toBe("Hello, this is a test transcription.");
      expect(wtf.transcript.language).toBe("en-US");
      expect(wtf.transcript.confidence).toBeGreaterThan(0);
      expect(wtf.segments).toHaveLength(1);
      expect(wtf.metadata.provider).toBe(configuredProvider);

      // Should have updated_at
      expect(body.updated_at).toBeDefined();

      // Should have stats in headers
      expect(response.headers["x-dialogs-processed"]).toBe("1");
      expect(response.headers["x-provider"]).toBe(configuredProvider);
    });

    it("should accept provider parameter", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/transcribe?provider=${configuredProvider}`,
        payload: validVcon,
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.analysis).toBeDefined();
      expect(body.analysis.length).toBeGreaterThan(0);
      expect(body.analysis[0].vendor).toBe(configuredProvider);
    });

    it("should reject invalid VCON", async () => {
      const invalidVcon = {
        vcon: "invalid",
        uuid: "not-a-uuid",
        parties: [],
      };

      const response = await server.inject({
        method: "POST",
        url: "/transcribe",
        payload: invalidVcon,
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.details).toBeDefined();
    });

    it("should return 422 when no audio dialogs found", async () => {
      const noAudioVcon = {
        vcon: "0.0.2",
        uuid: "019371a4-1234-7000-8000-000000000001",
        created_at: "2024-01-15T10:30:00.000Z",
        parties: [{ name: "Test" }],
        dialog: [
          {
            type: "text",
            start: "2024-01-15T10:30:00.000Z",
            parties: [0],
            mediatype: "text/plain",
            body: "Hello",
            encoding: "none",
          },
        ],
      };

      const response = await server.inject({
        method: "POST",
        url: "/transcribe",
        payload: noAudioVcon,
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(422);

      const body = JSON.parse(response.body);
      expect(body.error).toContain("No audio dialogs");
    });
  });

  describe("POST /transcribe/batch", () => {
    it("should transcribe multiple VCONs", async () => {
      const vcons = [
        {
          vcon: "0.0.2",
          uuid: "019371a4-1234-7000-8000-000000000001",
          created_at: "2024-01-15T10:30:00.000Z",
          parties: [{ name: "Test 1" }],
          dialog: [
            {
              type: "recording",
              start: "2024-01-15T10:30:00.000Z",
              parties: [0],
              mediatype: "audio/wav",
              body: "dGVzdDE=",
              encoding: "base64url",
            },
          ],
        },
        {
          vcon: "0.0.2",
          uuid: "019371a4-1234-7000-8000-000000000002",
          created_at: "2024-01-15T10:31:00.000Z",
          parties: [{ name: "Test 2" }],
          dialog: [
            {
              type: "recording",
              start: "2024-01-15T10:31:00.000Z",
              parties: [0],
              mediatype: "audio/wav",
              body: "dGVzdDI=",
              encoding: "base64url",
            },
          ],
        },
      ];

      const response = await server.inject({
        method: "POST",
        url: "/transcribe/batch",
        payload: vcons,
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.results).toHaveLength(2);
      expect(body.summary.total).toBe(2);
      expect(body.summary.succeeded).toBe(2);
      expect(body.summary.failed).toBe(0);
    });

    it("should handle partial failures in batch", async () => {
      const vcons = [
        {
          vcon: "0.0.2",
          uuid: "019371a4-1234-7000-8000-000000000001",
          created_at: "2024-01-15T10:30:00.000Z",
          parties: [{ name: "Valid" }],
          dialog: [
            {
              type: "recording",
              start: "2024-01-15T10:30:00.000Z",
              parties: [0],
              mediatype: "audio/wav",
              body: "dGVzdA==",
              encoding: "base64url",
            },
          ],
        },
        {
          vcon: "invalid",
          uuid: "not-valid",
          parties: [],
        },
      ];

      const response = await server.inject({
        method: "POST",
        url: "/transcribe/batch",
        payload: vcons,
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.summary.total).toBe(2);
      expect(body.summary.succeeded).toBe(1);
      expect(body.summary.failed).toBe(1);
      expect(body.results[0].success).toBe(true);
      expect(body.results[1].success).toBe(false);
    });
  });

  describe("GET /docs", () => {
    it("should serve OpenAPI documentation", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      // OpenAPI version depends on @fastify/swagger version
      expect(body.openapi).toMatch(/^3\./);
      expect(body.info.title).toContain("WTF Server");
    });
  });
});
