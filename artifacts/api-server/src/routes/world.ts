import { Router } from "express";
import { npcs, players, worldObjects, totalConversations } from "../lib/world";
import { getNpcMemoryRows, getNpcStats } from "../lib/supabase";
import { logger } from "../lib/logger";

const router = Router();

router.get("/world/state", (_req, res) => {
  try {
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
        outfit: n.outfit,
      })),
      worldObjects,
      totalPlayers: Object.keys(players).length,
      totalConversations,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao obter estado do mundo");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/world/objects", (_req, res) => {
  try {
    res.json(worldObjects);
  } catch (err) {
    logger.error({ err }, "Erro ao obter objetos do mundo");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/npcs", (_req, res) => {
  try {
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
        outfit: n.outfit,
        relationshipsCount: Object.keys(n.relationships).length,
      }))
    );
  } catch (err) {
    logger.error({ err }, "Erro ao listar NPCs");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/npcs/:npcId", (_req, res) => {
  try {
    const npc = npcs[_req.params.npcId];
    if (!npc) {
      res.status(404).json({ error: "NPC não encontrado" });
      return;
    }
    res.json({
      id: npc.id,
      name: npc.name,
      color: npc.color,
      gender: npc.gender,
      position: npc.position,
      emotion: npc.emotion,
      personality: npc.personality,
      currentAction: npc.currentAction,
      isMoving: npc.isMoving,
      outfit: npc.outfit,
      conversationHistoryCount: npc.conversationHistory.length,
      learningsCount: npc.learnings.length,
      createdThingsCount: npc.createdThings.length,
      relationships: Object.entries(npc.relationships).map(([id, rel]) => ({
        npcId: id,
        bond: rel.bond,
        reason: rel.reason,
      })),
    });
  } catch (err) {
    logger.error({ err, npcId: _req.params.npcId }, "Erro ao obter detalhes do NPC");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/npcs/:npcId/memory", async (req, res) => {
  try {
    const npc = npcs[req.params.npcId];
    if (!npc) {
      res.status(404).json({ error: "NPC não encontrado" });
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
  } catch (err) {
    logger.error({ err, npcId: req.params.npcId }, "Erro ao obter memória do NPC");
    res.status(500).json({ error: "Erro ao carregar memória" });
  }
});

router.get("/npcs/:npcId/stats", async (req, res) => {
  try {
    const npc = npcs[req.params.npcId];
    if (!npc) {
      res.status(404).json({ error: "NPC não encontrado" });
      return;
    }
    const stats = await getNpcStats(req.params.npcId);
    res.json({
      npcId: npc.id,
      name: npc.name,
      totalConversations: stats.totalConversations,
      totalCreations: stats.totalCreations,
      mostRecentEmotion: npc.emotion,
      learningsCount: npc.learnings.length,
      createdThingsCount: npc.createdThings.length,
    });
  } catch (err) {
    logger.error({ err, npcId: req.params.npcId }, "Erro ao obter estatísticas do NPC");
    res.status(500).json({ error: "Erro ao carregar estatísticas" });
  }
});

export default router;
