/**
 * Fastify Server Setup
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { healthRoutes, transcribeRoutes } from "./routes/index.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env["NODE_ENV"] !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
    bodyLimit: config.maxVconSizeMb * 1024 * 1024,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "WTF Server - VCON Transcription API",
        description:
          "VCON transcription server with NVIDIA NIM ASR (Parakeet/Canary) and WTF format output",
        version: "1.0.0",
        contact: {
          name: "API Support",
        },
        license: {
          name: "MIT",
        },
      },
      externalDocs: {
        url: "https://datatracker.ietf.org/doc/html/draft-howe-vcon-wtf-extension-01",
        description: "WTF Extension Specification",
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: "Local development server",
        },
      ],
      tags: [
        { name: "health", description: "Health check endpoints" },
        { name: "transcription", description: "Transcription endpoints" },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(transcribeRoutes);

  // Global error handler
  fastify.setErrorHandler((error: Error & { validation?: unknown }, request, reply) => {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
      },
      "Request error"
    );

    if (error.validation) {
      return reply.status(400).send({
        error: "Validation error",
        details: error.validation,
      });
    }

    return reply.status(500).send({
      error: "Internal server error",
    });
  });

  return fastify;
}
