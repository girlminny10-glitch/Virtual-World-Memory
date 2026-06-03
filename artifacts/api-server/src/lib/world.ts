import { askAI } from "./groq";

// --- TIPOS ---
export type Pos = { x: number; z: number };
export type Outfit = { top: string; bottom: string; hair: string; accessory: string };
export type NpcState = {
  id: string; name: string; color: string; gender: "female" | "male";
  position: Pos; targetPosition?: Pos; emotion: string; personality: string;
  currentAction?: string; outfit: Outfit;
};
export type PlayerState = { id: string; name: string; gender: string; position: Pos };
export type WorldObject = { id: string; type: string; position: Pos; creator: string; creatorColor: string; description: string; color?: string; scale?: number };

// --- CONFIGURAÇÕES ---
const LOOP_INTERVAL = 5000; 
const WORLD_SIZE = 300;

// --- ESTADO DO MUNDO ---
export const npcs: Record<string, NpcState> = {
  "npc-1": {
    id: "npc-1", name: "Minny", color: "#ff88aa", gender: "female",
    position: { x: 10, z: 10 }, emotion: "😊 Feliz", personality: "Amigável e curiosa",
    outfit: { top: "pink_shirt", bottom: "white_skirt", hair: "long_brown", accessory: "none" }
  },
  "npc-2": {
    id: "npc-2", name: "Bob", color: "#88aaff", gender: "male",
    position: { x: -10, z: -10 }, emotion: "😐 Neutro", personality: "Analítico e calmo",
    outfit: { top: "blue_hoodie", bottom: "jeans", hair: "short_black", accessory: "glasses" }
  },
  "npc-3": {
    id: "npc-3", name: "Luna", color: "#aa88ff", gender: "female",
    position: { x: 15, z: -15 }, emotion: "🌟 Animada", personality: "Criativa e energética",
    outfit: { top: "purple_vest", bottom: "black_pants", hair: "blonde_bob", accessory: "hat" }
  },
  "npc-4": {
    id: "npc-4", name: "Leo", color: "#ffaa88", gender: "male",
    position: { x: -15, z: 15 }, emotion: "🤔 Pensativo", personality: "Sério e focado",
    outfit: { top: "orange_tshirt", bottom: "shorts", hair: "brown_spiky", accessory: "none" }
  },
  "npc-5": {
    id: "npc-5", name: "Zoe", color: "#88ffaa", gender: "female",
    position: { x: 0, z: 20 }, emotion: "🍃 Zen", personality: "Tranquila e sábia",
    outfit: { top: "green_tunic", bottom: "leggings", hair: "black_braids", accessory: "necklace" }
  }
};

export const players: Record<string, PlayerState> = {};
export const worldObjects: WorldObject[] = [];
export let worldObjectIdCounter = 1;
export const recentConversations: any[] = [];

function dist(p1: Pos, p2: Pos) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2);
}

export function getNearbyNPC(npc: NpcState, radius = 30): NpcState | null {
  let closest: NpcState | null = null;
  let minD = Infinity;
  for (const other of Object.values(npcs)) {
    if (other.id === npc.id) continue;
    const d = dist(npc.position, other.position);
    if (d < radius && d < minD) { minD = d; closest = other; }
  }
  return closest;
}

export function getNearbyPlayer(npc: NpcState): PlayerState | null {
  for (const p of Object.values(players)) {
    if (dist(npc.position, p.position) < 20) return p;
  }
  return null;
}

export async function runAiLoop(broadcast: (msg: any) => void) {
  const npcIds = Object.keys(npcs);
  const randomNpc = npcs[npcIds[Math.floor(Math.random() * npcIds.length)]];

  try {
    const nearbyNpc = getNearbyNPC(randomNpc);
    const nearbyPlayer = getNearbyPlayer(randomNpc);

    if (nearbyNpc || nearbyPlayer) {
      const response = await askAI(
        `Você é ${randomNpc.name}, personalidade: ${randomNpc.personality}.`,
        [{ role: "user", content: "O que você diz agora? Responda em uma frase curta com um emoji." }]
      );
      
      if (response) {
        broadcast({
          type: "npc-thought",
          npcId: randomNpc.id,
          npcColor: randomNpc.color,
          thought: response,
          emotion: randomNpc.emotion
        });
      }
    } else {
      const newPos = {
        x: Math.max(-WORLD_SIZE/2, Math.min(WORLD_SIZE/2, randomNpc.position.x + (Math.random() - 0.5) * 40)),
        z: Math.max(-WORLD_SIZE/2, Math.min(WORLD_SIZE/2, randomNpc.position.z + (Math.random() - 0.5) * 40))
      };
      randomNpc.targetPosition = newPos;
      broadcast({ type: "npc-move", npcId: randomNpc.id, targetPosition: newPos, emotion: randomNpc.emotion });
    }
  } catch (err) {
    console.error("Erro no loop da IA:", err);
  }

  setTimeout(() => runAiLoop(broadcast), LOOP_INTERVAL);
}

export function initWorld(broadcast: (msg: any) => void) {
  runAiLoop(broadcast);
}
