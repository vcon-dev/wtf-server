import { describe, it, expect, vi, beforeEach } from "vitest";
import { NvidiaAsrProvider } from "../../src/providers/nvidia.js";
import { OpenAIAsrProvider } from "../../src/providers/openai.js";
import { DeepgramAsrProvider } from "../../src/providers/deepgram.js";
import { GroqAsrProvider } from "../../src/providers/groq.js";
import { LocalWhisperAsrProvider } from "../../src/providers/local-whisper.js";
import {
  getProvider,
  createProvider,
  getConfiguredProviderNames,
  clearProviderCache,
} from "../../src/providers/index.js";

// Mock undici for all provider tests
vi.mock("undici", () => ({
  request: vi.fn(),
}));

describe("ASR Providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderCache();
  });

  describe("NvidiaAsrProvider", () => {
    it("should create an instance with default options", () => {
      const provider = new NvidiaAsrProvider();
      expect(provider.provider).toBe("nvidia");
      expect(provider.isConfigured()).toBe(true); // NVIDIA works without API key for local deployments
    });

    it("should create an instance with custom options", () => {
      const provider = new NvidiaAsrProvider({
        baseUrl: "http://custom-nim:9000",
        apiKey: "custom-key",
        defaultModel: "parakeet-ctc-1.1b",
        timeout: 60000,
      });
      expect(provider.provider).toBe("nvidia");
    });

    it("should return unavailable health when service is down", async () => {
      const { request } = await import("undici");
      vi.mocked(request).mockRejectedValue(new Error("Connection refused"));

      const provider = new NvidiaAsrProvider();
      const health = await provider.healthCheck();

      expect(health.status).toBe("unavailable");
      expect(health.provider).toBe("nvidia");
      expect(health.message).toContain("Connection refused");
    });
  });

  describe("OpenAIAsrProvider", () => {
    it("should create an instance with default options", () => {
      const provider = new OpenAIAsrProvider();
      expect(provider.provider).toBe("openai");
    });

    it("should report unconfigured when no API key", () => {
      // Use empty string to explicitly override any env var
      const provider = new OpenAIAsrProvider({
        apiKey: "",
      });
      expect(provider.isConfigured()).toBe(false);
    });

    it("should report configured when API key provided", () => {
      const provider = new OpenAIAsrProvider({
        apiKey: "sk-test-key",
      });
      expect(provider.isConfigured()).toBe(true);
    });

    it("should return unavailable health when not configured", async () => {
      const provider = new OpenAIAsrProvider({ apiKey: "" });
      const health = await provider.healthCheck();

      expect(health.status).toBe("unavailable");
      expect(health.message).toContain("not configured");
    });

    it("should throw when transcribing without API key", async () => {
      const provider = new OpenAIAsrProvider({ apiKey: "" });

      await expect(
        provider.transcribe({
          audioBuffer: Buffer.from("test"),
          mediatype: "audio/wav",
        })
      ).rejects.toThrow("OpenAI API key not configured");
    });
  });

  describe("DeepgramAsrProvider", () => {
    it("should create an instance with default options", () => {
      const provider = new DeepgramAsrProvider();
      expect(provider.provider).toBe("deepgram");
    });

    it("should report unconfigured when no API key", () => {
      const provider = new DeepgramAsrProvider({ apiKey: "" });
      expect(provider.isConfigured()).toBe(false);
    });

    it("should report configured when API key provided", () => {
      const provider = new DeepgramAsrProvider({ apiKey: "test-key" });
      expect(provider.isConfigured()).toBe(true);
    });

    it("should return unavailable health when not configured", async () => {
      const provider = new DeepgramAsrProvider({ apiKey: "" });
      const health = await provider.healthCheck();

      expect(health.status).toBe("unavailable");
      expect(health.message).toContain("not configured");
    });

    it("should throw when transcribing without API key", async () => {
      const provider = new DeepgramAsrProvider({ apiKey: "" });

      await expect(
        provider.transcribe({
          audioBuffer: Buffer.from("test"),
          mediatype: "audio/wav",
        })
      ).rejects.toThrow("Deepgram API key not configured");
    });
  });

  describe("GroqAsrProvider", () => {
    it("should create an instance with default options", () => {
      const provider = new GroqAsrProvider();
      expect(provider.provider).toBe("groq");
    });

    it("should report unconfigured when no API key", () => {
      const provider = new GroqAsrProvider({ apiKey: "" });
      expect(provider.isConfigured()).toBe(false);
    });

    it("should report configured when API key provided", () => {
      const provider = new GroqAsrProvider({ apiKey: "gsk-test-key" });
      expect(provider.isConfigured()).toBe(true);
    });

    it("should return unavailable health when not configured", async () => {
      const provider = new GroqAsrProvider({ apiKey: "" });
      const health = await provider.healthCheck();

      expect(health.status).toBe("unavailable");
      expect(health.message).toContain("not configured");
    });

    it("should throw when transcribing without API key", async () => {
      const provider = new GroqAsrProvider({ apiKey: "" });

      await expect(
        provider.transcribe({
          audioBuffer: Buffer.from("test"),
          mediatype: "audio/wav",
        })
      ).rejects.toThrow("Groq API key not configured");
    });
  });

  describe("LocalWhisperAsrProvider", () => {
    it("should create an instance with default options", () => {
      const provider = new LocalWhisperAsrProvider();
      expect(provider.provider).toBe("local-whisper");
    });

    it("should report configured when URL is set", () => {
      const provider = new LocalWhisperAsrProvider({
        baseUrl: "http://localhost:9001",
      });
      expect(provider.isConfigured()).toBe(true);
    });

    it("should return unavailable health when service is down", async () => {
      const { request } = await import("undici");
      vi.mocked(request).mockRejectedValue(new Error("Connection refused"));

      const provider = new LocalWhisperAsrProvider({
        baseUrl: "http://localhost:9001",
      });
      const health = await provider.healthCheck();

      expect(health.status).toBe("unavailable");
      expect(health.provider).toBe("local-whisper");
    });
  });

  describe("Provider Factory", () => {
    it("should create nvidia provider", () => {
      const provider = createProvider("nvidia");
      expect(provider.provider).toBe("nvidia");
    });

    it("should create openai provider", () => {
      const provider = createProvider("openai");
      expect(provider.provider).toBe("openai");
    });

    it("should create deepgram provider", () => {
      const provider = createProvider("deepgram");
      expect(provider.provider).toBe("deepgram");
    });

    it("should create groq provider", () => {
      const provider = createProvider("groq");
      expect(provider.provider).toBe("groq");
    });

    it("should create local-whisper provider", () => {
      const provider = createProvider("local-whisper");
      expect(provider.provider).toBe("local-whisper");
    });

    it("should throw for unknown provider", () => {
      expect(() => createProvider("unknown" as any)).toThrow(
        "Unknown ASR provider"
      );
    });

    it("should cache provider instances", () => {
      const provider1 = getProvider("nvidia");
      const provider2 = getProvider("nvidia");
      expect(provider1).toBe(provider2);
    });

    it("should return different instances for different providers", () => {
      const nvidia = getProvider("nvidia");
      const openai = getProvider("openai");
      expect(nvidia).not.toBe(openai);
    });

    it("should clear cache correctly", () => {
      const provider1 = getProvider("nvidia");
      clearProviderCache();
      const provider2 = getProvider("nvidia");
      expect(provider1).not.toBe(provider2);
    });

    it("should list configured provider names", () => {
      const configured = getConfiguredProviderNames();
      // At minimum, nvidia and local-whisper should be configured (no API key required)
      expect(configured).toContain("nvidia");
      expect(configured).toContain("local-whisper");
    });
  });
});
