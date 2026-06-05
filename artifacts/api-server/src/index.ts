import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createWebSocketServer } from "./lib/websocket";
import { aiLoop, initWorld, saveWorldState, broadcastWorldEvent } from "./lib/world";

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

server.listen(port, async () => {
  logger.info({ port }, "Virtual World 3D server listening");
  logger.info({ npcs: 5 }, "5 NPCs com IA Gemini + memória de longo prazo ativa");

  try {
    await initWorld();
  } catch (err) {
    logger.error({ err }, "Falha ao inicializar mundo — continuando sem dados persistidos");
  }
});

// AI loop — NPCs think and act every 10 seconds (conserve API quota)
setInterval(() => {
  aiLoop().catch((err) => logger.error({ err }, "AI loop error"));
}, 10_000);

// Save world state every 2 minutes
setInterval(() => {
  saveWorldState().catch((err) => logger.warn({ err }, "Falha ao salvar estado do mundo"));
}, 120_000);

// World events (rain, party, dia, noite) every 8-15 minutes randomly
function scheduleNextEvent() {
  const delay = (8 + Math.random() * 7) * 60 * 1000;
  setTimeout(() => {
    broadcastWorldEvent();
    scheduleNextEvent();
  }, delay);
}
scheduleNextEvent();
