import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

let rawSupabaseUrl = process.env.SUPABASE_URL?.trim() ?? "";
const supabaseKey = process.env.SUPABASE_KEY?.trim();

// Auto-complete URL if user provided just the project ref (e.g. "ijxcivtcmrzqenwpymzv")
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
    "SUPABASE_URL/KEY invalid or missing — memory persistence disabled"
  );
} else {
  logger.info({ supabaseUrl: supabaseUrl.slice(0, 40) }, "Supabase connected");
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
      logger.warn({ error }, "Could not call init_npc_memory RPC — tables may already exist");
    }
  } catch {
    // Tables already exist or RPC not available — that's fine
  }
}

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
    if (error) logger.warn({ error, npcId }, "Failed to save NPC memory");
  } catch (err) {
    logger.warn({ err }, "Supabase saveNpcMemory error");
  }
}

export async function loadNpcMemory(
  npcId: string,
  limit = 30
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("npc_memories")
      .select("role, content")
      .eq("npc_id", npcId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      logger.warn({ error, npcId }, "Failed to load NPC memory");
      return [];
    }
    return (data ?? []) as Array<{ role: "user" | "assistant"; content: string }>;
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
