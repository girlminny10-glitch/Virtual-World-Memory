import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createWebSocketServer } from "./lib/websocket";
import { aiLoop } from "./lib/world";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
createWebSocketServer(server);

server.listen(port, () => {
  logger.info({ port }, "Virtual World 3D server listening");
  logger.info({ npcs: 18 }, "NPCs com IA Groq ativa");
});

setInterval(() => {
  aiLoop().catch((err) => logger.error({ err }, "AI loop error"));
}, 4000);
