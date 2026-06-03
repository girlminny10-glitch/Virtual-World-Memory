import { askAI } from "./groq";
import { saveNpcMemory, saveNpcCreation } from "./supabase";
import { logger } from "./logger";

export const WORLD_SIZE = 300;

export interface Position { x: number; z: number; }

export interface NpcRelationship {
  bond: number;
  reason: string;
  lastInteraction: number;
}

export interface NpcState {
  id: string;
  name: string;
  color: string;
  gender: "female" | "male";
  position: Position;
  emotion: string;
  personality: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  isMoving: boolean;
  targetPosition: Position | null;
  currentAction: string;
  createdThings: { id: string; type: string; description: string; createdAt: number }[];
  relationships: Record<string, NpcRelationship>;
  lastSpoke: number;
  conversationPartner: string | null;
  conversationTurns: number;
  outfit: { top: string; bottom: string; hair: string; accessory: string };
}

export interface WorldObject {
  id: string;
  creator: string;
  creatorId: string;
  creatorColor: string;
  type: string;
  description: string;
  position: Position;
  createdAt: number;
  color?: string;
  scale?: number;
}

export interface PlayerState {
  id: string;
  name: string;
  position: Position;
  gender: "female" | "male";
}

export const OBJECT_TYPES = [
  "house", "tower", "fountain", "garden", "monument",
  "chair", "table", "lamp_post", "arch", "pyramid",
  "totem", "well", "bench", "crystal", "portal",
  "statue", "painting", "car", "boat", "tree",
  "rock", "fence", "gate", "swing", "mushroom",
  "star_monument", "flower_bed", "bridge", "dome", "spiral",
  "cube_art", "sphere_art", "obelisk", "cabin", "lighthouse",
];

const EMOTIONS = [
  "feliz 😊", "pensativo 🤔", "animado 🎉", "calmo 😌", "curioso 🧐",
  "surpreso 😲", "misterioso 🌙", "criativo ✨", "sério 😤", "apaixonado ❤️",
  "triste 😢", "bravo 😠", "entusiasmado 🚀", "sonhador 💭", "grato 🙏",
];

function randomEmotion() { return EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)]; }
function randomPos(spread = WORLD_SIZE * 0.7): Position {
  return { x: (Math.random() - 0.5) * spread, z: (Math.random() - 0.5) * spread };
}
function dist(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

const OUTFITS = {
  female: {
    tops: ["camisa rosa", "blusa azul", "camiseta verde", "top roxo", "blusa amarela"],
    bottoms: ["saia", "calça jeans", "vestido", "shorts", "calça"],
    hairs: ["longo ondulado", "curto bob", "coque", "tranças", "solto"],
    accessories: ["brincos", "colar", "tiara", "óculos", "chapéu"],
  },
  male: {
    tops: ["camiseta preta", "camisa azul", "camiseta branca", "moletom", "camisa xadrez"],
    bottoms: ["calça jeans", "bermuda", "calça social", "shorts", "calça cargo"],
    hairs: ["curto", "médio", "raspado", "topknot", "ondulado"],
    accessories: ["óculos", "boné", "relógio", "mochila", "headphones"],
  },
};
function randomOutfit(gender: "female" | "male") {
  const o = OUTFITS[gender];
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return { top: pick(o.tops), bottom: pick(o.bottoms), hair: pick(o.hairs), accessory: pick(o.accessories) };
}

export const npcs: Record<string, NpcState> = {
  "npc-1":  { id: "npc-1",  name: "Alex",   gender: "female", color: "#FF6B6B", position: { x: 20,   z: 15   }, emotion: "feliz 😊",        personality: "Otimista, amigável e aventureira.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "explorando",   createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-2":  { id: "npc-2",  name: "Jordan", gender: "male",   color: "#4ECDC4", position: { x: -25,  z: 18   }, emotion: "pensativo 🤔",    personality: "Inteligente, analítico e misterioso.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando",    createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-3":  { id: "npc-3",  name: "Luna",   gender: "female", color: "#FFE66D", position: { x: 40,   z: -20  }, emotion: "criativo ✨",     personality: "Artística, sonhadora e criativa.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "pintando",     createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-4":  { id: "npc-4",  name: "Marcus", gender: "male",   color: "#A8E6CF", position: { x: -45,  z: -30  }, emotion: "sério 😤",       personality: "Sério, lógico e disciplinado.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "construindo",  createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-5":  { id: "npc-5",  name: "Zara",   gender: "female", color: "#FF8B94", position: { x: 60,   z: 35   }, emotion: "animado 🎉",     personality: "Energética, competitiva e divertida.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "correndo",     createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-6":  { id: "npc-6",  name: "Kai",    gender: "male",   color: "#B8B8FF", position: { x: -55,  z: 40   }, emotion: "calmo 😌",       personality: "Calmo, sábio e contemplativo.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando",    createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-7":  { id: "npc-7",  name: "Ivy",    gender: "female", color: "#FFDAC1", position: { x: 30,   z: -55  }, emotion: "misterioso 🌙",  personality: "Misteriosa, enigmática e perspicaz.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "escrevendo",   createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-8":  { id: "npc-8",  name: "Dante",  gender: "male",   color: "#E2F0CB", position: { x: -35,  z: -60  }, emotion: "apaixonado ❤️",  personality: "Apaixonado, expressivo e artístico.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "compondo",     createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-9":  { id: "npc-9",  name: "Aria",   gender: "female", color: "#FF9FF3", position: { x: 15,   z: -75  }, emotion: "feliz 😊",        personality: "Musical, vibrante e alegre.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "cantando",     createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-10": { id: "npc-10", name: "Leo",    gender: "male",   color: "#FECA57", position: { x: -15,  z: 70   }, emotion: "entusiasmado 🚀", personality: "Líder nato, protetor e corajoso.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "patrulhando",  createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-11": { id: "npc-11", name: "Mya",    gender: "female", color: "#48DBFB", position: { x: 75,   z: 20   }, emotion: "curioso 🧐",     personality: "Curiosa, científica e rápida.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "explorando",   createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-12": { id: "npc-12", name: "Rex",    gender: "male",   color: "#1DD1A1", position: { x: -75,  z: -25  }, emotion: "sério 😤",       personality: "Robusto, prático e direto.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "trabalhando",  createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-13": { id: "npc-13", name: "Zoe",    gender: "female", color: "#FD9644", position: { x: 50,   z: 60   }, emotion: "grato 🙏",       personality: "Amável, prestativa e gentil.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "ajudando",     createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-14": { id: "npc-14", name: "Finn",   gender: "male",   color: "#54A0FF", position: { x: -50,  z: -65  }, emotion: "animado 🎉",     personality: "Brincalhão, veloz e divertido.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "jogando",      createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-15": { id: "npc-15", name: "Lia",    gender: "female", color: "#A29BFE", position: { x: 65,   z: -45  }, emotion: "sonhador 💭",    personality: "Espiritual, profunda e mística.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando",    createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-16": { id: "npc-16", name: "Hugo",   gender: "male",   color: "#EE5253", position: { x: -65,  z: 50   }, emotion: "sério 😤",       personality: "Trabalhador, resiliente e forte.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "construindo",  createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-17": { id: "npc-17", name: "Sola",   gender: "female", color: "#F368E0", position: { x: 10,   z: 10   }, emotion: "feliz 😊",        personality: "Solar, positiva e radiante.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "dançando",     createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-18": { id: "npc-18", name: "Nox",    gender: "male",   color: "#8395a7", position: { x: -10,  z: -10  }, emotion: "misterioso 🌙",  personality: "Noturno, silencioso e observador.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "observando",   createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
};

export const players: Record<string, PlayerState> = {};
export const worldObjects: WorldObject[] = [];
export let worldObjectIdCounter = 1;
export let totalConversations = 0;
export const recentConversations: Array<{ fromName: string; fromColor: string; toName: string; toColor: string; message: string; response: string; ts: number }> = [];

function getNearbyNPC(npc: NpcState, radius = 30): NpcState | null {
  let closest: NpcState | null = null, minD = Infinity;
  for (const other of Object.values(npcs)) {
    if (other.id === npc.id) continue;
    const d = dist(npc.position, other.position);
    if (d < radius && d < minD) { minD = d; closest = other; }
  }
  return closest;
}

function getNearbyPlayer(npc: NpcState): PlayerState | null {
  for (const p of Object.values(players)) {
    if (dist(npc.position, p.position) < 20) return p;
  }
  return null;
}

function getRelationshipHint(npc: NpcState): string {
  const bonds = Object.entries(npc.relationships)
    .filter(([, r]) => r.bond > 25)
    .map(([id]) => npcs[id]?.name)
    .filter(Boolean)
    .slice(0, 2);
  const conflicts = Object.entries(npc.relationships)
    .filter(([, r]) => r.bond < -25)
    .map(([id]) => npcs[id]?.name)
    .filter(Boolean)
    .slice(0, 1);
  let s = "";
  if (bonds.length) s += `Amigo de ${bonds.join(", ")}. `;
  if (conflicts.length) s += `Evita ${conflicts.join(", ")}. `;
  return s;
}

function updateRelationship(a: NpcState, b: NpcState, delta: number, reason: string) {
  if (!a.relationships[b.id]) a.relationships[b.id] = { bond: 0, reason: "", lastInteraction: 0 };
  if (!b.relationships[a.id]) b.relationships[a.id] = { bond: 0, reason: "", lastInteraction: 0 };
  a.relationships[b.id].bond = Math.max(-100, Math.min(100, a.relationships[b.id].bond + delta));
  b.relationships[a.id].bond = Math.max(-100, Math.min(100, b.relationships[a.id].bond + delta));
  a.relationships[b.id].reason = b.relationships[a.id].reason = reason;
  a.relationships[b.id].lastInteraction = b.relationships[a.id].lastInteraction = Date.now();
}

type BroadcastFn = (data: unknown) => void;
let broadcastFn: BroadcastFn = () => {};
export function setBroadcast(fn: BroadcastFn): void { broadcastFn = fn; }
function broadcastAll(data: unknown): void { broadcastFn(data); }

export function npcMove(npc: NpcState): void {
  const target = randomPos();
  npc.targetPosition = target;
  npc.isMoving = true;
  npc.currentAction = "explorando";
  broadcastAll({ type: "npc-move", npcId: npc.id, position: npc.position, targetPosition: target, emotion: npc.emotion });
  const d = dist(npc.position, target);
  setTimeout(() => {
    npc.position = { ...target };
    npc.isMoving = false;
    broadcastAll({ type: "npc-arrived", npcId: npc.id, position: npc.position });
  }, Math.max(2000, (d / 10) * 1000));
}

async function npcTalkToNPC(npc: NpcState, other: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 12000) return;

  const relHint = npc.relationships[other.id]?.bond > 30
    ? `Você gosta de ${other.name}.`
    : npc.relationships[other.id]?.bond < -30
    ? `Você desconfia de ${other.name}.`
    : "";

  const msg = await askAI(
    `Você é ${npc.name}. ${npc.personality} ${relHint} Emoção: ${npc.emotion}. Fale com ${other.name} em 1-2 frases curtas em português.`,
    [{ role: "user", content: `Diga algo para ${other.name}.` }],
    80
  );
  if (!msg) return;

  const response = await askAI(
    `Você é ${other.name}. ${other.personality} ${npc.name} disse: "${msg}". Responda em 1-2 frases em português.`,
    [{ role: "user", content: msg }],
    80
  );

  npc.emotion = randomEmotion();
  other.emotion = randomEmotion();
  npc.lastSpoke = Date.now();
  npc.conversationPartner = other.id;
  npc.conversationTurns = (npc.conversationTurns || 0) + 1;
  totalConversations++;

  const delta = Math.random() > 0.2 ? Math.floor(Math.random() * 6) + 1 : -(Math.floor(Math.random() * 6) + 1);
  updateRelationship(npc, other, delta, delta > 0 ? "conversa amigável" : "desentendimento");

  recentConversations.unshift({ fromName: npc.name, fromColor: npc.color, toName: other.name, toColor: other.color, message: msg, response: response ?? "...", ts: Date.now() });
  if (recentConversations.length > 20) recentConversations.pop();

  broadcastAll({
    type: "npc-conversation",
    from: npc.name, fromId: npc.id, fromColor: npc.color,
    to: other.name, toId: other.id, toColor: other.color,
    message: msg, response: response ?? "...",
    fromEmotion: npc.emotion, toEmotion: other.emotion,
    bond: npc.relationships[other.id]?.bond ?? 0,
    position: npc.position,
  });

  npc.currentAction = `falando com ${other.name}`;
  other.currentAction = `falando com ${npc.name}`;

  // Save to memory async (don't await)
  saveNpcMemory(npc.id, "user", `${other.name}: ${msg}`).catch(() => {});
  saveNpcMemory(other.id, "assistant", response ?? "...").catch(() => {});
}

async function npcGreetPlayer(npc: NpcState, player: PlayerState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 20000) return;

  const message = await askAI(
    `Você é ${npc.name}. ${npc.personality} Cumprimente ${player.name} de forma única e mencione @${player.name}. 1-2 frases em português.`,
    [{ role: "user", content: "Cumprimente o jogador." }],
    80
  );
  if (!message) return;

  npc.emotion = "animado 🎉";
  npc.lastSpoke = Date.now();
  broadcastAll({
    type: "npc-greet-player",
    npcId: npc.id, npcName: npc.name, npcColor: npc.color,
    targetPlayerId: player.id, targetPlayerName: player.name,
    message, emotion: npc.emotion,
  });
  npc.currentAction = `cumprimentando ${player.name}`;
}

async function npcThinkAloud(npc: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 25000) return;

  const thought = await askAI(
    `Você é ${npc.name}. ${npc.personality} Pense em voz alta sobre algo criativo ou filosófico. Uma frase em português.`,
    [],
    60
  );
  if (!thought) return;

  npc.lastSpoke = Date.now();
  broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought, emotion: npc.emotion });
}

async function npcCreateObject(npc: NpcState): Promise<void> {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  npc.createdThings = npc.createdThings.filter(t => now - t.createdAt < TWO_HOURS);
  if (npc.createdThings.length >= 4) return; // Don't over-build

  const typeList = OBJECT_TYPES.slice(0, 20).join(", "); // Shorter list for fewer tokens
  const response = await askAI(
    `Você é ${npc.name}. ${npc.personality} Crie algo criativo. Tipos: ${typeList}. Responda só em JSON: {"type":"tipo","description":"frase criativa","color":"#hex"}`,
    [],
    90
  );

  let data: { type: string; description: string; color?: string };
  try {
    const cleaned = (response ?? "").replace(/```json|```/g, "").trim();
    data = JSON.parse(cleaned);
    if (!OBJECT_TYPES.includes(data.type)) data.type = OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)];
  } catch {
    data = { type: OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)], description: response ?? "criou algo especial" };
  }

  if (npc.createdThings.length >= 4) {
    const oldest = npc.createdThings.shift();
    if (oldest) {
      const idx = worldObjects.findIndex(o => o.id === oldest.id);
      if (idx >= 0) {
        const removed = worldObjects.splice(idx, 1)[0];
        broadcastAll({ type: "world-object-removed", objectId: removed.id });
      }
    }
  }

  const obj: WorldObject = {
    id: `obj-${worldObjectIdCounter++}`,
    creator: npc.name, creatorId: npc.id, creatorColor: npc.color,
    type: data.type, description: data.description,
    position: { x: npc.position.x + (Math.random() - 0.5) * 15, z: npc.position.z + (Math.random() - 0.5) * 15 },
    createdAt: now, color: data.color ?? npc.color, scale: 0.6 + Math.random() * 0.7,
  };

  worldObjects.push(obj);
  if (worldObjects.length > 150) {
    const rem = worldObjects.shift()!;
    broadcastAll({ type: "world-object-removed", objectId: rem.id });
  }

  npc.createdThings.push({ id: obj.id, type: data.type, description: data.description, createdAt: now });
  npc.currentAction = data.description;
  npc.emotion = "criativo ✨";

  saveNpcCreation(npc.id, data.description, data.type).catch(() => {});
  broadcastAll({ type: "npc-created-object", object: obj, npcName: npc.name, npcId: npc.id, npcColor: npc.color, description: data.description, emotion: npc.emotion });
}

async function npcCleanup(npc: NpcState): Promise<void> {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const toRemove = npc.createdThings.filter(t => now - t.createdAt > TWO_HOURS);
  for (const item of toRemove) {
    const idx = worldObjects.findIndex(o => o.id === item.id);
    if (idx >= 0) { worldObjects.splice(idx, 1); broadcastAll({ type: "world-object-removed", objectId: item.id }); }
  }
  npc.createdThings = npc.createdThings.filter(t => now - t.createdAt < TWO_HOURS);
}

export async function npcDecideAction(npc: NpcState): Promise<void> {
  await npcCleanup(npc);
  const nearbyNPC = getNearbyNPC(npc);
  const nearbyPlayer = getNearbyPlayer(npc);
  const now = Date.now();

  if (now - npc.lastSpoke < 5000) { npcMove(npc); return; }

  const roll = Math.random();
  if (nearbyPlayer && roll < 0.3) { await npcGreetPlayer(npc, nearbyPlayer); return; }
  if (nearbyNPC && roll < 0.55)   { await npcTalkToNPC(npc, nearbyNPC); return; }
  if (roll < 0.65)                { await npcCreateObject(npc); return; }
  if (roll < 0.75)                { await npcThinkAloud(npc); return; }
  npcMove(npc);
}

// ── Player response — skips Supabase load for speed, uses in-memory history only ──
export async function respondToPlayer(
  npc: NpcState,
  playerMessage: string,
  playerName: string
): Promise<string | null> {
  const relHint = getRelationshipHint(npc);
  const systemPrompt = `Você é ${npc.name} (${npc.gender === "female" ? "feminina" : "masculino"}). ${npc.personality}
${relHint}Emoção: ${npc.emotion}. Você está conversando diretamente com ${playerName}.
Responda de forma natural, autêntica e em português. Máximo 3 frases.
Mencione @${playerName} na resposta. Se houver pergunta, responda com sua perspectiva única.`;

  // Use only recent in-memory history (fast, no Supabase roundtrip)
  const history = npc.conversationHistory.slice(-6);
  history.push({ role: "user", content: `${playerName}: ${playerMessage}` });

  const reply = await askAI(systemPrompt, history, 150);

  if (reply) {
    npc.conversationHistory.push({ role: "user", content: playerMessage });
    npc.conversationHistory.push({ role: "assistant", content: reply });
    if (npc.conversationHistory.length > 16) npc.conversationHistory.splice(0, 2);
    npc.emotion = randomEmotion();
    npc.lastSpoke = Date.now();
    totalConversations++;
    // Save async
    saveNpcMemory(npc.id, "user", playerMessage).catch(() => {});
    saveNpcMemory(npc.id, "assistant", reply).catch(() => {});
  }

  return reply;
}

export async function broadcastToAllNpcs(playerMessage: string, playerName: string): Promise<void> {
  const npcList = Object.values(npcs);
  // Pick 2-3 random NPCs to respond
  const responding = [...npcList].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const npc of responding) {
    const reply = await respondToPlayer(npc, playerMessage, playerName);
    if (reply) {
      broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: reply, emotion: npc.emotion });
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

export function getRecentConversations() { return recentConversations.slice(0, 15); }

// Only 1-2 NPCs act per loop cycle to conserve Groq tokens
export async function aiLoop(): Promise<void> {
  const npcList = Object.values(npcs);
  const count = Math.random() < 0.6 ? 1 : 2;
  const active = [...npcList].sort(() => Math.random() - 0.5).slice(0, count);
  for (const npc of active) {
    await npcDecideAction(npc);
    await new Promise(r => setTimeout(r, 800));
  }
}
