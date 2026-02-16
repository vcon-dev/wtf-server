/**
 * WTF Server - VCON Transcription with Multi-Provider ASR
 * Entry point
 */

import "dotenv/config";
import { buildServer } from "./server.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    const server = await buildServer();

    await server.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(
      {
        port: config.port,
        host: config.host,
        docsUrl: `http://localhost:${config.port}/docs`,
      },
      "WTF Server started"
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutting down server...");
      await server.close();
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.fatal({ error }, "Failed to start server");
    process.exit(1);
  }
}

main();
