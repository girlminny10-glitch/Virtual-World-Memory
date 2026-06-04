import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createWebSocketServer } from "./lib/websocket";
import { aiLoop, initWorld, saveWorldState } from "./lib/world";

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
  logger.info({ npcs: 5 }, "5 NPCs com IA Groq + memória de longo prazo ativa");

  // Load persistent world state from Supabase on startup
  try {
    await initWorld();
  } catch (err) {
    logger.error({ err }, "Falha ao inicializar mundo — continuando sem dados persistidos");
  }
});

// AI loop — NPCs think and act every 2.5 seconds
setInterval(() => {
  aiLoop().catch((err) => logger.error({ err }, "AI loop error"));
}, 2500);

// Save world state (relationships etc.) every 60 seconds
setInterval(() => {
  saveWorldState().catch((err) => logger.warn({ err }, "Falha ao salvar estado do mundo"));
}, 60_000);

// Self-ping every 5 seconds to prevent hibernation on Railway/cloud
setInterval(() => {
  const req = http.request(
    { hostname: "localhost", port, path: "/api/healthz", method: "GET" },
    (res) => {
      res.resume(); // drain response
    }
  );
  req.on("error", () => {}); // ignore errors silently
  req.end();
}, 5_000);
