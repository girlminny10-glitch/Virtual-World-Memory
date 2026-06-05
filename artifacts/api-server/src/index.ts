import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { createWebSocketServer } from "./lib/websocket";
import { aiLoop, initWorld, saveWorldState, broadcastWorldEvent, npcs, npcMove } from "./lib/world";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

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

  // ─── Start all NPC movement immediately after init ──────────────────────────
  const npcList = Object.values(npcs);
  npcList.forEach((npc, i) => {
    // Stagger initial movement so they don't all move at once
    setTimeout(() => { npcMove(npc); }, i * 2000);
  });
});

// ─── Dedicated NPC movement ticker (every 12s per NPC, independent of AI) ──────
// This ensures NPCs always walk around even when AI quota is exhausted.
let moveIdx = 0;
setInterval(() => {
  const npcList = Object.values(npcs);
  if (npcList.length === 0) return;
  const npc = npcList[moveIdx % npcList.length];
  moveIdx++;
  if (!npc.isMoving) {
    npcMove(npc);
  }
}, 12_000);

// ─── AI loop — NPCs think/talk/build every 15 seconds ──────────────────────────
setInterval(() => {
  aiLoop().catch((err) => logger.error({ err }, "AI loop error"));
}, 15_000);

// ─── Save world state every 2 minutes ──────────────────────────────────────────
setInterval(() => {
  saveWorldState().catch((err) => logger.warn({ err }, "Falha ao salvar estado do mundo"));
}, 120_000);

// ─── World events (rain, party, night, etc.) — first at 3 min, then 10-15 min ─
setTimeout(() => {
  broadcastWorldEvent();
  function scheduleNext() {
    const delay = (10 + Math.random() * 5) * 60 * 1000;
    setTimeout(() => { broadcastWorldEvent(); scheduleNext(); }, delay);
  }
  scheduleNext();
}, 3 * 60 * 1000);
