/**
 * Health check routes
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { checkHealth } from "../services/transcription.js";

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

  // Readiness check (includes NIM service status)
  fastify.get(
    "/health/ready",
    {
      schema: {
        description: "Readiness check including external dependencies",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              services: {
                type: "object",
                properties: {
                  nim: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                    },
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
        services: {
          nim: health.nim,
        },
      });
    }
  );
}
