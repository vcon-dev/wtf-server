/**
 * Provider Integration Tests
 *
 * These tests run against real ASR APIs when the corresponding API keys
 * are configured in the environment. Tests are skipped when keys are missing.
 *
 * Environment Variables:
 * - OPENAI_API_KEY: OpenAI API key for Whisper
 * - DEEPGRAM_API_KEY: Deepgram API key
 * - GROQ_API_KEY: Groq API key
 * - NIM_ASR_URL: NVIDIA NIM ASR endpoint (default: http://localhost:9000)
 * - LOCAL_WHISPER_URL: Local Whisper server URL (default: http://localhost:9001)
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { OpenAIAsrProvider } from "../../src/providers/openai.js";
import { DeepgramAsrProvider } from "../../src/providers/deepgram.js";
import { GroqAsrProvider } from "../../src/providers/groq.js";
import { NvidiaAsrProvider } from "../../src/providers/nvidia.js";
import { LocalWhisperAsrProvider } from "../../src/providers/local-whisper.js";

// Helper to check if a provider should be tested
function shouldTest(provider: string): boolean {
  switch (provider) {
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "deepgram":
      return !!process.env.DEEPGRAM_API_KEY;
    case "groq":
      return !!process.env.GROQ_API_KEY;
    case "nvidia":
      // Skip by default unless explicitly running NIM
      return process.env.TEST_NVIDIA === "true";
    case "local-whisper":
      // Skip by default unless explicitly running local whisper
      return process.env.TEST_LOCAL_WHISPER === "true";
    default:
      return false;
  }
}

// Test audio file (a simple WAV with silence or minimal audio)
// This is base64-encoded minimal WAV header with silence
const MINIMAL_WAV_BASE64 =
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// For real tests, we'd use actual audio
let testAudioBuffer: Buffer;

beforeAll(() => {
  // Try to load a test audio file if it exists
  const testAudioPath = path.join(__dirname, "../fixtures/test-audio.wav");
  if (fs.existsSync(testAudioPath)) {
    testAudioBuffer = fs.readFileSync(testAudioPath);
  } else {
    // Use minimal WAV for basic connectivity tests
    testAudioBuffer = Buffer.from(MINIMAL_WAV_BASE64, "base64");
  }
});

describe("Provider Integration Tests", () => {
  describe("OpenAI Whisper Provider", () => {
    const runTests = shouldTest("openai");

    it.skipIf(!runTests)("should check health successfully", async () => {
      const provider = new OpenAIAsrProvider();
      const health = await provider.healthCheck();

      expect(health.status).toBe("ok");
      expect(health.provider).toBe("openai");
      expect(health.model).toBe("whisper-1");
    });

    it.skipIf(!runTests)("should transcribe audio", async () => {
      const provider = new OpenAIAsrProvider();

      // Use a longer test audio file if available
      const result = await provider.transcribe({
        audioBuffer: testAudioBuffer,
        mediatype: "audio/wav",
        language: "en",
      });

      expect(result.provider).toBe("openai");
      expect(result.language).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });

  describe("Deepgram Provider", () => {
    const runTests = shouldTest("deepgram");

    it.skipIf(!runTests)("should check health successfully", async () => {
      const provider = new DeepgramAsrProvider();
      const health = await provider.healthCheck();

      expect(health.status).toBe("ok");
      expect(health.provider).toBe("deepgram");
    });

    it.skipIf(!runTests)("should transcribe audio", async () => {
      const provider = new DeepgramAsrProvider();

      const result = await provider.transcribe({
        audioBuffer: testAudioBuffer,
        mediatype: "audio/wav",
        language: "en",
      });

      expect(result.provider).toBe("deepgram");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });

  describe("Groq Provider", () => {
    const runTests = shouldTest("groq");

    it.skipIf(!runTests)("should check health successfully", async () => {
      const provider = new GroqAsrProvider();
      const health = await provider.healthCheck();

      expect(health.status).toBe("ok");
      expect(health.provider).toBe("groq");
    });

    it.skipIf(!runTests)("should transcribe audio", async () => {
      const provider = new GroqAsrProvider();

      const result = await provider.transcribe({
        audioBuffer: testAudioBuffer,
        mediatype: "audio/wav",
        language: "en",
      });

      expect(result.provider).toBe("groq");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });

  describe("NVIDIA NIM Provider", () => {
    const runTests = shouldTest("nvidia");

    it.skipIf(!runTests)("should check health successfully", async () => {
      const provider = new NvidiaAsrProvider();
      const health = await provider.healthCheck();

      expect(health.status).toBe("ok");
      expect(health.provider).toBe("nvidia");
    });

    it.skipIf(!runTests)("should transcribe audio", async () => {
      const provider = new NvidiaAsrProvider();

      const result = await provider.transcribe({
        audioBuffer: testAudioBuffer,
        mediatype: "audio/wav",
        language: "en-US",
      });

      expect(result.provider).toBe("nvidia");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });

  describe("Local Whisper Provider", () => {
    const runTests = shouldTest("local-whisper");

    it.skipIf(!runTests)("should check health successfully", async () => {
      const provider = new LocalWhisperAsrProvider();
      const health = await provider.healthCheck();

      expect(health.status).toBe("ok");
      expect(health.provider).toBe("local-whisper");
    });

    it.skipIf(!runTests)("should transcribe audio", async () => {
      const provider = new LocalWhisperAsrProvider();

      const result = await provider.transcribe({
        audioBuffer: testAudioBuffer,
        mediatype: "audio/wav",
        language: "en",
      });

      expect(result.provider).toBe("local-whisper");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });

  // Summary test to show which providers are available
  describe("Provider Availability", () => {
    it("should report which providers are available for testing", () => {
      const availability = {
        openai: shouldTest("openai"),
        deepgram: shouldTest("deepgram"),
        groq: shouldTest("groq"),
        nvidia: shouldTest("nvidia"),
        "local-whisper": shouldTest("local-whisper"),
      };

      console.log("\nProvider Availability for Integration Tests:");
      console.log("-------------------------------------------");
      for (const [provider, available] of Object.entries(availability)) {
        console.log(`  ${provider}: ${available ? "✓ Available" : "✗ Skipped"}`);
      }
      console.log("");

      // This test always passes - it's just informational
      expect(true).toBe(true);
    });
  });
});
