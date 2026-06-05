import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "./logger";
import {
  npcs, players, worldObjects, respondToPlayer, broadcastToAllNpcs,
  setBroadcast, npcMove, getRecentConversations, currentWorldEvent,
} from "./world";

let _wss: WebSocketServer | null = null;

export function broadcast(data: unknown, excludeWs?: WebSocket): void {
  if (!_wss) return;
  const msg = JSON.stringify(data);
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(msg);
    }
  });
}

export function createWebSocketServer(server: import("http").Server): WebSocketServer {
  _wss = new WebSocketServer({ server });
  setBroadcast((data) => broadcast(data));

  _wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    logger.info({ playerId, ip: req.socket.remoteAddress }, "Player connected");

    players[playerId] = { id: playerId, name: "Jogador", position: { x: 0, z: 0 }, gender: "female" };

    ws.send(JSON.stringify({
      type: "init",
      playerId,
      npcs: Object.values(npcs).map((n) => ({
        id: n.id, name: n.name, color: n.color, gender: n.gender,
        position: n.position, emotion: n.emotion, personality: n.personality,
        currentAction: n.currentAction, isMoving: n.isMoving,
        outfit: n.outfit,
        relationships: Object.fromEntries(
          Object.entries(n.relationships).map(([id, r]) => [id, { bond: r.bond, reason: r.reason }])
        ),
      })),
      worldObjects,
      players: Object.values(players),
      recentConversations: getRecentConversations(),
      currentWeather: currentWorldEvent,
    }));

    broadcast({ type: "player-joined", playerId, player: players[playerId] }, ws);

    ws.on("message", async (raw) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(raw.toString()); } catch { return; }

      if (data.type === "player-move") {
        if (players[playerId]) {
          players[playerId].position = data.position as { x: number; z: number };
          broadcast({ type: "player-update", playerId, position: data.position }, ws);
        }
      }

      if (data.type === "player-name") {
        if (players[playerId]) {
          players[playerId].name = String(data.name ?? "Jogador");
          players[playerId].gender = (data.gender as "female" | "male") ?? "female";
        }
      }

      if (data.type === "player-chat") {
        const npc = npcs[data.npcId as string];
        if (!npc) return;
        const playerName = players[playerId]?.name ?? "Jogador";
        const reply = await respondToPlayer(npc, String(data.message), playerName);
        if (reply) {
          broadcast({
            type: "npc-response",
            npcId: npc.id, npcName: npc.name, npcColor: npc.color,
            message: data.message, response: reply, emotion: npc.emotion,
            targetPlayerId: playerId,
          });
        }
      }

      if (data.type === "player-chat-all") {
        const playerName = players[playerId]?.name ?? "Jogador";
        broadcast({
          type: "player-broadcast",
          playerId, playerName,
          message: data.message,
        }, ws);
        await broadcastToAllNpcs(String(data.message), playerName);
      }

      if (data.type === "player-create") {
        const pos = data.position as { x: number; z: number };
        const obj = {
          id: `obj-${Date.now()}`,
          creator: players[playerId]?.name ?? "Jogador",
          creatorId: playerId,
          creatorColor: "#4ECDC4",
          type: String(data.objType),
          description: `${players[playerId]?.name ?? "Jogador"} criou um(a) ${data.objType}`,
          position: pos,
          createdAt: Date.now(),
          color: String(data.color ?? "#4ECDC4"),
          scale: Number(data.scale ?? 1),
        };
        worldObjects.push(obj);
        if (worldObjects.length > 200) worldObjects.shift();
        broadcast({ type: "npc-created-object", object: obj, npcName: obj.creator, npcId: playerId, npcColor: "#4ECDC4", description: obj.description, emotion: "feliz 😊" });
      }

      if (data.type === "canvas-drawing") {
        broadcast({ type: "canvas-drawing", drawing: data.drawing, authorId: playerId, authorName: players[playerId]?.name ?? "Jogador" }, ws);
      }

      if (data.type === "npc-change-outfit") {
        const npc = npcs[data.npcId as string];
        if (npc && data.outfit) {
          npc.outfit = data.outfit as typeof npc.outfit;
          broadcast({ type: "npc-outfit-changed", npcId: npc.id, outfit: npc.outfit });
        }
      }
    });

    ws.on("close", () => {
      logger.info({ playerId }, "Player disconnected");
      delete players[playerId];
      broadcast({ type: "player-left", playerId });
    });
  });

  return _wss;
}
