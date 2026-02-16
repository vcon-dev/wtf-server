/**
 * Transcription routes
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  transcribeVcon,
  type TranscriptionOptions,
} from "../services/transcription.js";
import type { AsrProvider } from "../types/asr.js";

interface TranscribeQuerystring {
  provider?: AsrProvider;
  model?: string;
  language?: string;
  word_timestamps?: boolean;
  speaker_diarization?: boolean;
}

export async function transcribeRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Main transcription endpoint
  fastify.post<{
    Body: unknown;
    Querystring: TranscribeQuerystring;
  }>(
    "/transcribe",
    {
      schema: {
        description:
          "Transcribe audio dialogs in a VCON and return enriched VCON with WTF transcription",
        tags: ["transcription"],
        querystring: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["nvidia", "openai", "deepgram", "groq", "local-whisper", "mlx-whisper"],
              description:
                "ASR provider to use (defaults to ASR_PROVIDER env var or nvidia)",
            },
            model: {
              type: "string",
              description:
                "Model to use (provider-specific, e.g., whisper-1 for OpenAI, nova-2 for Deepgram)",
            },
            language: {
              type: "string",
              description: "Language code (e.g., en-US, es-MX)",
            },
            word_timestamps: {
              type: "boolean",
              default: true,
              description: "Include word-level timestamps",
            },
            speaker_diarization: {
              type: "boolean",
              default: false,
              description: "Enable speaker diarization",
            },
          },
        },
        body: {
          type: "object",
          description: "VCON document",
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true,
            description: "Enriched VCON with WTF transcription",
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          422: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const options: TranscriptionOptions = {
        provider: request.query.provider,
        model: request.query.model,
        language: request.query.language,
        wordTimestamps: request.query.word_timestamps,
        speakerDiarization: request.query.speaker_diarization,
      };

      const result = await transcribeVcon(request.body, options);

      if (!result.success) {
        // Determine appropriate status code
        const isValidationError = result.details && result.details.length > 0;
        const statusCode = isValidationError ? 400 : 422;

        return reply.status(statusCode).send({
          error: result.error,
          details: result.details,
        });
      }

      // Return enriched VCON with stats in headers
      reply.header("X-Dialogs-Processed", result.stats.dialogsProcessed);
      reply.header("X-Dialogs-Skipped", result.stats.dialogsSkipped);
      reply.header("X-Dialogs-Failed", result.stats.dialogsFailed);
      reply.header("X-Processing-Time-Ms", result.stats.totalProcessingTime);
      reply.header("X-Provider", result.stats.provider);
      if (result.stats.model) {
        reply.header("X-Model", result.stats.model);
      }

      return reply.send(result.vcon);
    }
  );

  // Batch transcription endpoint
  fastify.post<{
    Body: unknown[];
    Querystring: TranscribeQuerystring;
  }>(
    "/transcribe/batch",
    {
      schema: {
        description: "Transcribe multiple VCONs in batch",
        tags: ["transcription"],
        querystring: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["nvidia", "openai", "deepgram", "groq", "local-whisper", "mlx-whisper"],
              description: "ASR provider to use",
            },
            model: {
              type: "string",
              description: "Model to use (provider-specific)",
            },
            language: { type: "string" },
            word_timestamps: { type: "boolean", default: true },
            speaker_diarization: { type: "boolean", default: false },
          },
        },
        body: {
          type: "array",
          items: { type: "object" },
          description: "Array of VCON documents",
        },
        response: {
          200: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    vcon: { type: "object" },
                    error: { type: "string" },
                    details: { type: "array" },
                  },
                },
              },
              summary: {
                type: "object",
                properties: {
                  total: { type: "number" },
                  succeeded: { type: "number" },
                  failed: { type: "number" },
                  provider: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const vcons = request.body;
      const options: TranscriptionOptions = {
        provider: request.query.provider,
        model: request.query.model,
        language: request.query.language,
        wordTimestamps: request.query.word_timestamps,
        speakerDiarization: request.query.speaker_diarization,
      };

      // Process VCONs in parallel
      const results = await Promise.all(
        vcons.map(async (vcon) => {
          const result = await transcribeVcon(vcon, options);
          if (result.success) {
            return {
              success: true,
              vcon: result.vcon,
            };
          } else {
            return {
              success: false,
              error: result.error,
              details: result.details,
            };
          }
        })
      );

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.length - succeeded;

      return reply.send({
        results,
        summary: {
          total: results.length,
          succeeded,
          failed,
          provider: options.provider ?? "nvidia",
        },
      });
    }
  );
}
