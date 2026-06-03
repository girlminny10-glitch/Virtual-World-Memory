import { askAI } from "./groq";

// --- CONFIGURAÇÕES ---
const LOOP_INTERVAL = 8000; // NPCs agem a cada 8 segundos
const OBJ_TYPES = ["casa", "torre", "fonte", "jardim", "estátua", "cristal", "portal", "árvore"];

export type Pos = { x: number; z: number };
export type NpcState = {
  id: string; name: string; color: string; gender: "female" | "male";
  position: Pos; targetPosition?: Pos; emotion: string; personality: string;
  outfit: any; relationships: Record<string, number>;
};

// --- ESTADO DO MUNDO ---
export const npcs: Record<string, NpcState> = {
  "npc-1": { id: "npc-1", name: "Minny", color: "#ff88aa", gender: "female", position: { x: 10, z: 10 }, emotion: "😊", personality: "Arquiteta amigável", outfit: { top: "shirt", bottom: "skirt", hair: "long", accessory: "none" }, relationships: {} },
  "npc-2": { id: "npc-2", name: "Bob", color: "#88aaff", gender: "male", position: { x: -10, z: -10 }, emotion: "😐", personality: "Construtor curioso", outfit: { top: "hoodie", bottom: "jeans", hair: "short", accessory: "glasses" }, relationships: {} },
  "npc-3": { id: "npc-3", name: "Luna", color: "#aa88ff", gender: "female", position: { x: 15, z: -15 }, emotion: "🌟", personality: "Exploradora mística", outfit: { top: "vest", bottom: "pants", hair: "bob", accessory: "hat" }, relationships: {} }
};

export const players: Record<string, any> = {};
export const worldObjects: any[] = [];
export const relationships: Record<string, any> = {};
export let totalConversations = 0;
export const recentConversations: any[] = [];
export let worldObjectIdCounter = Date.now();

let broadcastFn: (msg: any) => void = () => {};

// --- FUNÇÕES DE INTERFACE ---
export function setBroadcast(fn: (msg: any) => void) { broadcastFn = fn; }
export function getRecentConversations() { return recentConversations; }
export function broadcastToAllNpcs(msg: string) { console.log("Global:", msg); }
export function npcMove(id: string, pos: Pos) { if(npcs[id]) npcs[id].position = pos; }
export function getInitialState(playerId: string) {
  return { type: "init", playerId, npcs: Object.values(npcs), worldObjects, recentConversations, relationships: {} };
}

// --- LÓGICA DE AUTONOMIA (AÇÃO DOS NPCs) ---

export async function aiLoop() {
  const ids = Object.keys(npcs);
  const npc = npcs[ids[Math.floor(Math.random() * ids.length)]];
  
  const sorte = Math.random();
  
  try {
    if (sorte < 0.3) { 
      // AÇÃO 1: CRIAR OBJETO
      const tipo = OBJ_TYPES[Math.floor(Math.random() * OBJ_TYPES.length)];
      const prompt = `Você é ${npc.name}. Você decidiu construir um(a) ${tipo} no mundo 3D. Descreva em 5 palavras o que você criou.`;
      const desc = await askAI(prompt, [{role:"user", content:"O que você criou?"}]) || `Um(a) ${tipo} bonito(a)`;
      
      const newObj = {
        id: `obj-${worldObjectIdCounter++}`,
        type: tipo,
        position: { x: npc.position.x + 5, z: npc.position.z + 5 },
        creator: npc.name,
        creatorColor: npc.color,
        description: desc
      };
      worldObjects.push(newObj);
      broadcastFn({ type: "npc-created-object", npcId: npc.id, npcName: npc.name, npcColor: npc.color, object: newObj, description: desc });
      
    } else if (sorte < 0.6) {
      // AÇÃO 2: PENSAR/FALAR
      const res = await askAI(`Você é ${npc.name}, personalidade: ${npc.personality}`, [{ role: "user", content: "Diga algo sobre o que você está fazendo agora." }]);
      if (res) broadcastFn({ type: "npc-thought", npcId: npc.id, npcColor: npc.color, thought: res });
      
    } else {
      // AÇÃO 3: MOVER
      const newPos = { x: (Math.random()-0.5)*100, z: (Math.random()-0.5)*100 };
      npc.targetPosition = newPos;
      broadcastFn({ type: "npc-move", npcId: npc.id, targetPosition: newPos, emotion: npc.emotion });
    }
  } catch (e) {
    console.log("IA ocupada ou sem chave...");
  }
  
  setTimeout(aiLoop, LOOP_INTERVAL);
}

export async function respondToPlayer(npcId: string, playerId: string, message: string) {
  const npc = npcs[npcId];
  if (!npc) return;
  const res = await askAI(`Você é ${npc.name}. Um jogador te disse: "${message}". Responda de forma curta.`, [{ role: "user", content: message }]);
  if (res) broadcastFn({ type: "npc-thought", npcId: npc.id, npcColor: npc.color, thought: res });
}

export function initWorld(broadcast: (msg: any) => void) {
  setBroadcast(broadcast);
  aiLoop();
}
