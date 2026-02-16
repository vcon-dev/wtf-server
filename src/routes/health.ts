/**
 * Health check routes
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  checkHealth,
  checkAllProvidersHealth,
} from "../services/transcription.js";
import { getConfiguredProviderNames } from "../providers/index.js";

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Basic liveness check
  fastify.get(
    "/health",
    {
      schema: {
        description: "Basic health check",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    }
  );

  // Readiness check (includes ASR provider status)
  fastify.get(
    "/health/ready",
    {
      schema: {
        description: "Readiness check including ASR provider status",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              services: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              services: { type: "object" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const health = await checkHealth();
      const status = health.healthy ? "ok" : "degraded";
      const statusCode = health.healthy ? 200 : 503;

      return reply.status(statusCode).send({
        status,
        timestamp: new Date().toISOString(),
        services: health.providers,
      });
    }
  );

  // All providers health check
  fastify.get(
    "/health/providers",
    {
      schema: {
        description: "Health check for all configured ASR providers",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              configured: {
                type: "array",
                items: { type: "string" },
              },
              providers: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    model: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const configured = getConfiguredProviderNames();
      const health = await checkAllProvidersHealth();

      return reply.send({
        timestamp: new Date().toISOString(),
        configured,
        providers: health.providers,
      });
    }
  );
}
