import pg from "pg";
import { logger } from "./logger";

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

if (!pool) {
  logger.warn("DATABASE_URL não configurada — persistência desativada");
} else {
  logger.info("PostgreSQL conectado ✅");
}

export interface NpcMemoryRow {
  id: string;
  npc_id: string;
  role: string;
  content: string;
  created_at: string;
}

export async function initSupabaseTables(): Promise<void> {
  // Tables are created at startup via drizzle/SQL — nothing to do here
}

// ─── NPC Memories ─────────────────────────────────────────────────────────────

export async function saveNpcMemory(
  npcId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO npc_memories (npc_id, role, content, created_at) VALUES ($1, $2, $3, NOW())",
      [npcId, role, content]
    );
  } catch (err) {
    logger.warn({ err, npcId }, "Falha ao salvar memória NPC");
  }
}

export async function loadNpcMemory(
  npcId: string,
  limit = 40
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      "SELECT role, content FROM npc_memories WHERE npc_id = $1 ORDER BY created_at DESC LIMIT $2",
      [npcId, limit]
    );
    return (res.rows as Array<{ role: "user" | "assistant"; content: string }>).reverse();
  } catch (err) {
    logger.warn({ err, npcId }, "Falha ao carregar memória NPC");
    return [];
  }
}

export async function getNpcMemoryRows(npcId: string): Promise<NpcMemoryRow[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      "SELECT id::text, npc_id, role, content, created_at::text FROM npc_memories WHERE npc_id = $1 ORDER BY created_at DESC LIMIT 50",
      [npcId]
    );
    return res.rows as NpcMemoryRow[];
  } catch {
    return [];
  }
}

export async function getNpcStats(npcId: string): Promise<{ totalConversations: number; totalCreations: number }> {
  if (!pool) return { totalConversations: 0, totalCreations: 0 };
  try {
    const convRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM npc_memories WHERE npc_id = $1 AND role = 'assistant'",
      [npcId]
    );
    const creatRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM npc_creations WHERE npc_id = $1",
      [npcId]
    );
    return {
      totalConversations: convRes.rows[0]?.count ?? 0,
      totalCreations: creatRes.rows[0]?.count ?? 0,
    };
  } catch {
    return { totalConversations: 0, totalCreations: 0 };
  }
}

export async function saveNpcCreation(npcId: string, description: string, type: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO npc_creations (npc_id, description, type, created_at) VALUES ($1, $2, $3, NOW())",
      [npcId, description, type]
    );
  } catch {
    // ignore
  }
}

// ─── NPC Learnings (auto-aprendizado) ─────────────────────────────────────────

export async function saveNpcLearning(npcId: string, learning: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO npc_learnings (npc_id, learning, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (npc_id, learning) DO UPDATE SET created_at = NOW()`,
      [npcId, learning]
    );
  } catch {
    // ignore
  }
}

export async function loadNpcLearnings(npcId: string, limit = 15): Promise<string[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      "SELECT learning FROM npc_learnings WHERE npc_id = $1 ORDER BY created_at DESC LIMIT $2",
      [npcId, limit]
    );
    return res.rows.map((r: { learning: string }) => r.learning);
  } catch {
    return [];
  }
}

// ─── NPC Relationships ─────────────────────────────────────────────────────────

export async function saveNpcRelationships(
  npcId: string,
  relationships: Record<string, { bond: number; reason: string; lastInteraction: number }>
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO npc_relationships (npc_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (npc_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [npcId, JSON.stringify(relationships)]
    );
  } catch {
    // ignore
  }
}

export async function loadNpcRelationships(
  npcId: string
): Promise<Record<string, { bond: number; reason: string; lastInteraction: number }>> {
  if (!pool) return {};
  try {
    const res = await pool.query(
      "SELECT data FROM npc_relationships WHERE npc_id = $1",
      [npcId]
    );
    if (!res.rows[0]) return {};
    return JSON.parse(res.rows[0].data ?? "{}");
  } catch {
    return {};
  }
}

// ─── World Objects Persistence ─────────────────────────────────────────────────

export interface WorldObjectRow {
  id: string;
  creator: string;
  creator_id: string;
  creator_color: string;
  type: string;
  description: string;
  position_x: number;
  position_z: number;
  color: string;
  scale: number;
  created_at: string;
}

export async function saveWorldObject(obj: {
  id: string;
  creator: string;
  creatorId: string;
  creatorColor: string;
  type: string;
  description: string;
  position: { x: number; z: number };
  color?: string;
  scale?: number;
  createdAt: number;
}): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO world_objects (id, creator, creator_id, creator_color, type, description, position_x, position_z, color, scale, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         creator = EXCLUDED.creator,
         creator_id = EXCLUDED.creator_id,
         creator_color = EXCLUDED.creator_color,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         position_x = EXCLUDED.position_x,
         position_z = EXCLUDED.position_z,
         color = EXCLUDED.color,
         scale = EXCLUDED.scale,
         created_at = EXCLUDED.created_at`,
      [
        obj.id, obj.creator, obj.creatorId, obj.creatorColor,
        obj.type, obj.description, obj.position.x, obj.position.z,
        obj.color ?? "#aaaaaa", obj.scale ?? 1,
        new Date(obj.createdAt).toISOString(),
      ]
    );
  } catch (err) {
    logger.warn({ err }, "Falha ao salvar world object");
  }
}

export async function deleteWorldObject(id: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query("DELETE FROM world_objects WHERE id = $1", [id]);
  } catch {
    // ignore
  }
}

export async function loadWorldObjects(): Promise<Array<{
  id: string;
  creator: string;
  creatorId: string;
  creatorColor: string;
  type: string;
  description: string;
  position: { x: number; z: number };
  color: string;
  scale: number;
  createdAt: number;
}>> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      "SELECT * FROM world_objects ORDER BY created_at ASC LIMIT 150"
    );
    return res.rows.map((r: WorldObjectRow) => ({
      id: r.id,
      creator: r.creator,
      creatorId: r.creator_id,
      creatorColor: r.creator_color,
      type: r.type,
      description: r.description,
      position: { x: r.position_x, z: r.position_z },
      color: r.color,
      scale: r.scale,
      createdAt: new Date(r.created_at).getTime(),
    }));
  } catch (err) {
    logger.warn({ err }, "Falha ao carregar world objects");
    return [];
  }
}

// ─── NPC Pair Conversations ────────────────────────────────────────────────────

export async function saveNpcPairConversation(
  pairKey: string,
  history: Array<{ role: string; content: string; speakerName: string }>,
  topic: string
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO npc_pair_conversations (pair_key, history, topic, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (pair_key) DO UPDATE SET history = EXCLUDED.history, topic = EXCLUDED.topic, updated_at = NOW()`,
      [pairKey, JSON.stringify(history.slice(-20)), topic]
    );
  } catch {
    // ignore
  }
}

export async function loadNpcPairConversation(pairKey: string): Promise<{
  history: Array<{ role: string; content: string; speakerName: string }>;
  topic: string;
} | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      "SELECT history, topic FROM npc_pair_conversations WHERE pair_key = $1",
      [pairKey]
    );
    if (!res.rows[0]) return null;
    return {
      history: JSON.parse(res.rows[0].history ?? "[]"),
      topic: res.rows[0].topic ?? "",
    };
  } catch {
    return null;
  }
}
