import { Router } from "express";
import { npcs, players, worldObjects, totalConversations } from "../lib/world";
import { getNpcMemoryRows, getNpcStats } from "../lib/supabase";

const router = Router();

router.get("/world/state", (_req, res) => {
  res.json({
    npcs: Object.values(npcs).map((n) => ({
      id: n.id,
      name: n.name,
      color: n.color,
      position: n.position,
      emotion: n.emotion,
      personality: n.personality,
      currentAction: n.currentAction,
      isMoving: n.isMoving,
      memoryCount: n.conversationHistory.length,
    })),
    worldObjects,
    totalPlayers: Object.keys(players).length,
    totalConversations,
  });
});

router.get("/world/objects", (_req, res) => {
  res.json(worldObjects);
});

router.get("/npcs", (_req, res) => {
  res.json(
    Object.values(npcs).map((n) => ({
      id: n.id,
      name: n.name,
      color: n.color,
      position: n.position,
      emotion: n.emotion,
      personality: n.personality,
      currentAction: n.currentAction,
      isMoving: n.isMoving,
      memoryCount: n.conversationHistory.length,
    }))
  );
});

router.get("/npcs/:npcId/memory", async (req, res) => {
  const npc = npcs[req.params.npcId];
  if (!npc) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }
  const rows = await getNpcMemoryRows(req.params.npcId);
  res.json(
    rows.map((r) => ({
      id: r.id,
      npcId: r.npc_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }))
  );
});

router.get("/npcs/:npcId/stats", async (req, res) => {
  const npc = npcs[req.params.npcId];
  if (!npc) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }
  const stats = await getNpcStats(req.params.npcId);
  res.json({
    npcId: npc.id,
    name: npc.name,
    totalConversations: stats.totalConversations,
    totalCreations: stats.totalCreations,
    mostRecentEmotion: npc.emotion,
  });
});

export default router;
