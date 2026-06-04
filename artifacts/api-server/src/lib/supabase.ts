import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

let rawSupabaseUrl = process.env.SUPABASE_URL?.trim() ?? "";
const supabaseKey = process.env.SUPABASE_KEY?.trim();

if (rawSupabaseUrl && !rawSupabaseUrl.startsWith("http")) {
  rawSupabaseUrl = `https://${rawSupabaseUrl}.supabase.co`;
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const supabaseUrl = rawSupabaseUrl;
const supabaseReady = !!(supabaseUrl && supabaseKey && isValidHttpUrl(supabaseUrl));

if (!supabaseReady) {
  logger.warn(
    { supabaseUrl: supabaseUrl ? supabaseUrl.slice(0, 40) : "(unset)" },
    "SUPABASE_URL/KEY inválido ou ausente — persistência desativada"
  );
} else {
  logger.info({ supabaseUrl: supabaseUrl.slice(0, 40) }, "Supabase conectado ✅");
}

export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabaseKey!)
  : null;

export interface NpcMemoryRow {
  id: string;
  npc_id: string;
  role: string;
  content: string;
  created_at: string;
}

export async function initSupabaseTables(): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc("init_npc_memory", {});
    if (error && !error.message.includes("does not exist")) {
      logger.warn({ error }, "init_npc_memory RPC — tabelas já existem ou não disponível");
    }
  } catch {
    // ignore
  }
}

// ─── NPC Memories ─────────────────────────────────────────────────────────────

export async function saveNpcMemory(
  npcId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("npc_memories").insert({
      npc_id: npcId,
      role,
      content,
      created_at: new Date().toISOString(),
    });
    if (error) logger.warn({ error, npcId }, "Falha ao salvar memória NPC");
  } catch (err) {
    logger.warn({ err }, "Supabase saveNpcMemory error");
  }
}

export async function loadNpcMemory(
  npcId: string,
  limit = 40
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("npc_memories")
      .select("role, content")
      .eq("npc_id", npcId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      logger.warn({ error, npcId }, "Falha ao carregar memória NPC");
      return [];
    }
    return ((data ?? []) as Array<{ role: "user" | "assistant"; content: string }>).reverse();
  } catch (err) {
    logger.warn({ err }, "Supabase loadNpcMemory error");
    return [];
  }
}

export async function getNpcMemoryRows(npcId: string): Promise<NpcMemoryRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("npc_memories")
      .select("*")
      .eq("npc_id", npcId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []) as NpcMemoryRow[];
  } catch {
    return [];
  }
}

export async function getNpcStats(npcId: string): Promise<{ totalConversations: number; totalCreations: number }> {
  if (!supabase) return { totalConversations: 0, totalCreations: 0 };
  try {
    const { count: conversations } = await supabase
      .from("npc_memories")
      .select("*", { count: "exact", head: true })
      .eq("npc_id", npcId)
      .eq("role", "assistant");

    const { count: creations } = await supabase
      .from("npc_creations")
      .select("*", { count: "exact", head: true })
      .eq("npc_id", npcId);

    return {
      totalConversations: conversations ?? 0,
      totalCreations: creations ?? 0,
    };
  } catch {
    return { totalConversations: 0, totalCreations: 0 };
  }
}

export async function saveNpcCreation(npcId: string, description: string, type: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("npc_creations").insert({
      npc_id: npcId,
      description,
      type,
      created_at: new Date().toISOString(),
    });
  } catch {
    // ignore
  }
}

// ─── NPC Learnings (auto-aprendizado) ─────────────────────────────────────────

export async function saveNpcLearning(npcId: string, learning: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("npc_learnings").upsert(
      { npc_id: npcId, learning, created_at: new Date().toISOString() },
      { onConflict: "npc_id,learning" }
    );
  } catch {
    // ignore
  }
}

export async function loadNpcLearnings(npcId: string, limit = 15): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("npc_learnings")
      .select("learning")
      .eq("npc_id", npcId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map((r: { learning: string }) => r.learning);
  } catch {
    return [];
  }
}

// ─── NPC Relationships ─────────────────────────────────────────────────────────

export async function saveNpcRelationships(
  npcId: string,
  relationships: Record<string, { bond: number; reason: string; lastInteraction: number }>
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("npc_relationships").upsert(
      { npc_id: npcId, data: JSON.stringify(relationships), updated_at: new Date().toISOString() },
      { onConflict: "npc_id" }
    );
  } catch {
    // ignore
  }
}

export async function loadNpcRelationships(
  npcId: string
): Promise<Record<string, { bond: number; reason: string; lastInteraction: number }>> {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from("npc_relationships")
      .select("data")
      .eq("npc_id", npcId)
      .single();
    if (error || !data) return {};
    return JSON.parse(data.data ?? "{}");
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
  if (!supabase) return;
  try {
    await supabase.from("world_objects").upsert({
      id: obj.id,
      creator: obj.creator,
      creator_id: obj.creatorId,
      creator_color: obj.creatorColor,
      type: obj.type,
      description: obj.description,
      position_x: obj.position.x,
      position_z: obj.position.z,
      color: obj.color ?? "#aaaaaa",
      scale: obj.scale ?? 1,
      created_at: new Date(obj.createdAt).toISOString(),
    }, { onConflict: "id" });
  } catch (err) {
    logger.warn({ err }, "Falha ao salvar world object");
  }
}

export async function deleteWorldObject(id: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("world_objects").delete().eq("id", id);
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
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("world_objects")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(150);
    if (error || !data) return [];
    return data.map((r: WorldObjectRow) => ({
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
  if (!supabase) return;
  try {
    await supabase.from("npc_pair_conversations").upsert(
      {
        pair_key: pairKey,
        history: JSON.stringify(history.slice(-20)),
        topic,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pair_key" }
    );
  } catch {
    // ignore
  }
}

export async function loadNpcPairConversation(pairKey: string): Promise<{
  history: Array<{ role: string; content: string; speakerName: string }>;
  topic: string;
} | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("npc_pair_conversations")
      .select("history, topic")
      .eq("pair_key", pairKey)
      .single();
    if (error || !data) return null;
    return {
      history: JSON.parse(data.history ?? "[]"),
      topic: data.topic ?? "",
    };
  } catch {
    return null;
  }
}
