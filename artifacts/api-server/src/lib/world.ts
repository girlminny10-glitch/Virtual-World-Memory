import { askAI } from "./groq";
import { saveNpcMemory, loadNpcMemory, saveNpcCreation } from "./supabase";
import { logger } from "./logger";

export const WORLD_SIZE = 300;

export interface Position { x: number; z: number; }

export interface NpcRelationship {
  bond: number; // -100 to 100 (negative = conflict, positive = friendship)
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

const EMOTIONS = ["feliz 😊", "pensativo 🤔", "animado 🎉", "calmo 😌", "curioso 🧐",
  "surpreso 😲", "misterioso 🌙", "criativo ✨", "sério 😤", "apaixonado ❤️",
  "triste 😢", "bravo 😠", "entusiasmado 🚀", "sonhador 💭", "grato 🙏"];

const EMOTION_EMOTES: Record<string, string> = {
  "feliz 😊": "😊", "pensativo 🤔": "🤔", "animado 🎉": "🎉", "calmo 😌": "😌",
  "curioso 🧐": "🧐", "surpreso 😲": "😲", "misterioso 🌙": "🌙", "criativo ✨": "✨",
  "sério 😤": "😤", "apaixonado ❤️": "❤️", "triste 😢": "😢", "bravo 😠": "😠",
  "entusiasmado 🚀": "🚀", "sonhador 💭": "💭", "grato 🙏": "🙏"
};

export function getEmote(emotion: string): string {
  return EMOTION_EMOTES[emotion] ?? "💬";
}

function randomEmotion() { return EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)]; }

function randomPos(spread = WORLD_SIZE * 0.8): Position {
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
  }
};

function randomOutfit(gender: "female" | "male") {
  const o = OUTFITS[gender];
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return { top: pick(o.tops), bottom: pick(o.bottoms), hair: pick(o.hairs), accessory: pick(o.accessories) };
}

export const npcs: Record<string, NpcState> = {
  "npc-1":  { id: "npc-1",  name: "Alex",   gender: "female", color: "#FF6B6B", position: { x: 80,  z: 80  }, emotion: "feliz 😊",       personality: "Otimista, amigável e aventureira.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "explorando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-2":  { id: "npc-2",  name: "Jordan", gender: "male",   color: "#4ECDC4", position: { x: -90, z: 60  }, emotion: "pensativo 🤔",   personality: "Inteligente, analítico e misterioso.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-3":  { id: "npc-3",  name: "Luna",   gender: "female", color: "#FFE66D", position: { x: 120, z: -80 }, emotion: "criativo ✨",    personality: "Artística, sonhadora e criativa.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "pintando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-4":  { id: "npc-4",  name: "Marcus", gender: "male",   color: "#A8E6CF", position: { x: -100,z: -90 }, emotion: "sério 😤",      personality: "Sério, lógico e disciplinado.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "construindo", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-5":  { id: "npc-5",  name: "Zara",   gender: "female", color: "#FF8B94", position: { x: 60,  z: 110 }, emotion: "animado 🎉",    personality: "Energética, competitiva e divertida.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "correndo", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-6":  { id: "npc-6",  name: "Kai",    gender: "male",   color: "#B8B8FF", position: { x: -110,z: 70  }, emotion: "calmo 😌",      personality: "Calmo, sábio e contemplativo.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-7":  { id: "npc-7",  name: "Ivy",    gender: "female", color: "#FFDAC1", position: { x: 90,  z: -120}, emotion: "misterioso 🌙",  personality: "Misteriosa, enigmática e perspicaz.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "escrevendo", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-8":  { id: "npc-8",  name: "Dante",  gender: "male",   color: "#E2F0CB", position: { x: -80, z: -110}, emotion: "apaixonado ❤️", personality: "Apaixonado, expressivo e artístico.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "compondo", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-9":  { id: "npc-9",  name: "Aria",   gender: "female", color: "#FF9FF3", position: { x: 40,  z: -130}, emotion: "feliz 😊",       personality: "Musical, vibrante e alegre.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "cantando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-10": { id: "npc-10", name: "Leo",    gender: "male",   color: "#FECA57", position: { x: -40, z: 130 }, emotion: "entusiasmado 🚀",personality: "Líder nato, protetor e corajoso.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "patrulhando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-11": { id: "npc-11", name: "Mya",    gender: "female", color: "#48DBFB", position: { x: 130, z: 50  }, emotion: "curioso 🧐",    personality: "Curiosa, científica e rápida.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "explorando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-12": { id: "npc-12", name: "Rex",    gender: "male",   color: "#1DD1A1", position: { x: -130,z: -50 }, emotion: "sério 😤",      personality: "Robusto, prático e direto.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "trabalhando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-13": { id: "npc-13", name: "Zoe",    gender: "female", color: "#FF6B6B", position: { x: 70,  z: 90  }, emotion: "grato 🙏",      personality: "Amável, prestativa e gentil.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "ajudando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-14": { id: "npc-14", name: "Finn",   gender: "male",   color: "#54A0FF", position: { x: -70, z: -90 }, emotion: "animado 🎉",    personality: "Brincalhão, veloz e divertido.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "jogando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-15": { id: "npc-15", name: "Lia",    gender: "female", color: "#5F27CD", position: { x: 100, z: -70 }, emotion: "sonhador 💭",   personality: "Espiritual, profunda e mística.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-16": { id: "npc-16", name: "Hugo",   gender: "male",   color: "#EE5253", position: { x: -100,z: 80  }, emotion: "sério 😤",      personality: "Trabalhador, resiliente e forte.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "construindo", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
  "npc-17": { id: "npc-17", name: "Sola",   gender: "female", color: "#F368E0", position: { x: 20,  z: 30  }, emotion: "feliz 😊",       personality: "Solar, positiva e radiante.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "dançando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("female") },
  "npc-18": { id: "npc-18", name: "Nox",    gender: "male",   color: "#8395a7", position: { x: -20, z: -30 }, emotion: "misterioso 🌙",  personality: "Noturno, silencioso e observador.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "observando", createdThings: [], relationships: {}, lastSpoke: 0, conversationPartner: null, conversationTurns: 0, outfit: randomOutfit("male") },
};

export const players: Record<string, PlayerState> = {};
export const worldObjects: WorldObject[] = [];
export let worldObjectIdCounter = 1;
export let totalConversations = 0;
export const recentConversations: Array<{ fromName: string; fromColor: string; toName: string; toColor: string; message: string; response: string; ts: number }> = [];

function getNearbyNPC(npc: NpcState, radius = 35): NpcState | null {
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
    if (dist(npc.position, p.position) < 25) return p;
  }
  return null;
}

function getRelationshipSummary(npc: NpcState): string {
  const entries = Object.entries(npc.relationships);
  if (entries.length === 0) return "";
  const bonds = entries.filter(([, r]) => r.bond > 20).map(([id]) => npcs[id]?.name).filter(Boolean);
  const conflicts = entries.filter(([, r]) => r.bond < -20).map(([id]) => npcs[id]?.name).filter(Boolean);
  let s = "";
  if (bonds.length) s += `Você tem amizade com: ${bonds.join(", ")}. `;
  if (conflicts.length) s += `Você tem conflito com: ${conflicts.join(", ")}. `;
  return s;
}

function updateRelationship(a: NpcState, b: NpcState, delta: number, reason: string) {
  if (!a.relationships[b.id]) a.relationships[b.id] = { bond: 0, reason: "", lastInteraction: 0 };
  if (!b.relationships[a.id]) b.relationships[a.id] = { bond: 0, reason: "", lastInteraction: 0 };
  a.relationships[b.id].bond = Math.max(-100, Math.min(100, a.relationships[b.id].bond + delta));
  b.relationships[a.id].bond = Math.max(-100, Math.min(100, b.relationships[a.id].bond + delta));
  a.relationships[b.id].reason = reason;
  b.relationships[a.id].reason = reason;
  a.relationships[b.id].lastInteraction = Date.now();
  b.relationships[a.id].lastInteraction = Date.now();
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
  if (now - npc.lastSpoke < 8000) return;
  if (npc.conversationTurns >= 3) {
    npc.conversationPartner = null;
    npc.conversationTurns = 0;
    return;
  }

  const rel = npc.relationships[other.id];
  const relHint = rel ? (rel.bond > 30 ? `Você gosta muito de ${other.name}.` : rel.bond < -30 ? `Você não confia em ${other.name}.` : "") : "";

  const systemPrompt = `Você é ${npc.name} (${npc.gender === "female" ? "feminina" : "masculino"}). Personalidade: ${npc.personality}
${getRelationshipSummary(npc)} ${relHint}
Emoção atual: ${npc.emotion}. Fale com ${other.name} de forma natural, curta e autêntica. Máximo 2 frases em português.
Seja criativo e espontâneo — pode fazer uma pergunta, compartilhar um pensamento, ou comentar algo do mundo.`;

  const msg = await askAI(systemPrompt, [{ role: "user", content: `Diga algo para ${other.name}.` }], 120);
  if (!msg) return;

  const respPrompt = `Você é ${other.name} (${other.gender === "female" ? "feminina" : "masculino"}). Personalidade: ${other.personality}
${getRelationshipSummary(other)}
${npc.name} disse: "${msg}"
Responda de forma natural e curta (máximo 2 frases) em português. Seja autêntico à sua personalidade.`;

  const response = await askAI(respPrompt, [{ role: "user", content: msg }], 120);

  npc.emotion = randomEmotion();
  other.emotion = randomEmotion();
  npc.lastSpoke = Date.now();
  npc.conversationPartner = other.id;
  npc.conversationTurns = (npc.conversationTurns || 0) + 1;
  totalConversations++;

  // Update relationship based on tone (simplistic positive for now, AI could determine)
  const delta = Math.random() > 0.15 ? Math.floor(Math.random() * 8) + 1 : -(Math.floor(Math.random() * 8) + 1);
  updateRelationship(npc, other, delta, delta > 0 ? "conversa agradável" : "desentendimento");

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

  // Save to memory
  await saveNpcMemory(npc.id, "user", `${other.name} está perto.`);
  await saveNpcMemory(npc.id, "assistant", msg);
  await saveNpcMemory(other.id, "user", msg);
  await saveNpcMemory(other.id, "assistant", response ?? "...");
}

async function npcGreetPlayer(npc: NpcState, player: PlayerState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 15000) return;

  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}
Você encontrou ${player.name} (humano jogando o jogo) no mundo virtual.
Diga algo interessante, acolhedor e mencione o nome dela/dele diretamente (@${player.name}).
Máximo 2 frases em português. Seja carismático e único.`;

  const message = await askAI(systemPrompt, [{ role: "user", content: "Cumprimente o jogador agora." }], 120);
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
  if (now - npc.lastSpoke < 20000) return;

  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}
Emotion: ${npc.emotion}. ${getRelationshipSummary(npc)}
Pense em voz alta sobre algo criativo, filosófico ou curioso sobre o mundo. Uma frase curta em português.
Pode ser sobre uma ideia nova, uma criação, ou um sentimento. Seja único e inesperado.`;

  const thought = await askAI(systemPrompt, [], 80);
  if (!thought) return;

  npc.lastSpoke = Date.now();
  broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought, emotion: npc.emotion });
}

async function npcCreateObject(npc: NpcState): Promise<void> {
  const typeList = OBJECT_TYPES.join(", ");
  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}. Emoção: ${npc.emotion}.
Você vai criar algo ÚNICO e criativo no mundo virtual 3D.
Tipos disponíveis: ${typeList}.
Escolha o tipo que mais combina com sua personalidade e descreva em UMA frase o que você está criando.
Responda APENAS em JSON: {"type": "um_dos_tipos_acima", "description": "descrição criativa em português", "color": "#hexcolor"}
A cor deve refletir o humor e personalidade. Seja verdadeiramente criativo — não apenas o óbvio.`;

  const response = await askAI(systemPrompt, [], 120);

  let data: { type: string; description: string; color?: string };
  try {
    const cleaned = (response ?? "").replace(/```json|```/g, "").trim();
    data = JSON.parse(cleaned);
    if (!OBJECT_TYPES.includes(data.type)) data.type = OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)];
  } catch {
    data = { type: OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)], description: response ?? "criou algo novo" };
  }

  // Limit creations per NPC to 5 active, clean up old ones
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  npc.createdThings = npc.createdThings.filter(t => now - t.createdAt < TWO_HOURS);

  if (npc.createdThings.length >= 5) {
    // Remove oldest
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
    creator: npc.name,
    creatorId: npc.id,
    creatorColor: npc.color,
    type: data.type,
    description: data.description,
    position: {
      x: npc.position.x + (Math.random() - 0.5) * 20,
      z: npc.position.z + (Math.random() - 0.5) * 20,
    },
    createdAt: now,
    color: data.color ?? npc.color,
    scale: 0.6 + Math.random() * 0.8,
  };

  worldObjects.push(obj);
  if (worldObjects.length > 200) {
    const rem = worldObjects.shift()!;
    broadcastAll({ type: "world-object-removed", objectId: rem.id });
  }

  npc.createdThings.push({ id: obj.id, type: data.type, description: data.description, createdAt: now });
  npc.currentAction = data.description;
  npc.emotion = "criativo ✨";

  await saveNpcCreation(npc.id, data.description, data.type);

  broadcastAll({
    type: "npc-created-object",
    object: obj,
    npcName: npc.name, npcId: npc.id, npcColor: npc.color,
    description: data.description, emotion: npc.emotion,
  });
}

// NPCs can delete own old objects
async function npcCleanup(npc: NpcState): Promise<void> {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  const toRemove = npc.createdThings.filter(t => now - t.createdAt > TWO_HOURS);
  for (const item of toRemove) {
    const idx = worldObjects.findIndex(o => o.id === item.id);
    if (idx >= 0) {
      worldObjects.splice(idx, 1);
      broadcastAll({ type: "world-object-removed", objectId: item.id });
    }
  }
  npc.createdThings = npc.createdThings.filter(t => now - t.createdAt < TWO_HOURS);
}

export async function npcDecideAction(npc: NpcState): Promise<void> {
  await npcCleanup(npc);

  const nearbyNPC = getNearbyNPC(npc);
  const nearbyPlayer = getNearbyPlayer(npc);
  const now = Date.now();
  const timeSinceSpoke = now - npc.lastSpoke;

  // Don't act too fast
  if (timeSinceSpoke < 5000) { npcMove(npc); return; }

  const roll = Math.random();

  if (nearbyPlayer && roll < 0.25) {
    await npcGreetPlayer(npc, nearbyPlayer);
    return;
  }
  if (nearbyNPC && roll < 0.55) {
    await npcTalkToNPC(npc, nearbyNPC);
    return;
  }
  if (roll < 0.65) {
    await npcCreateObject(npc);
    return;
  }
  if (roll < 0.75) {
    await npcThinkAloud(npc);
    return;
  }
  npcMove(npc);
}

export async function respondToPlayer(
  npc: NpcState,
  playerMessage: string,
  playerName: string
): Promise<string | null> {
  const history = await loadNpcMemory(npc.id, 15);
  const combined = [...history, ...npc.conversationHistory.slice(-8)];

  const relSummary = getRelationshipSummary(npc);
  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}
${relSummary}
${playerName} está falando com você diretamente. Responda de forma natural e em português.
Máximo 3 frases. Emoção atual: ${npc.emotion}.
Se for uma pergunta, responda com sua perspectiva única. Se for um cumprimento, seja caloroso.
Use @${playerName} na resposta para mostrar que está falando diretamente com a pessoa.`;

  combined.push({ role: "user", content: `${playerName}: ${playerMessage}` });
  const reply = await askAI(systemPrompt, combined, 200);

  if (reply) {
    npc.conversationHistory.push({ role: "user", content: playerMessage });
    npc.conversationHistory.push({ role: "assistant", content: reply });
    if (npc.conversationHistory.length > 20) npc.conversationHistory.splice(0, 2);
    npc.emotion = randomEmotion();
    npc.lastSpoke = Date.now();
    totalConversations++;

    await saveNpcMemory(npc.id, "user", playerMessage);
    await saveNpcMemory(npc.id, "assistant", reply);
  }

  return reply;
}

export async function broadcastToAllNpcs(
  playerMessage: string,
  playerName: string
): Promise<void> {
  const npcList = Object.values(npcs);
  const responding = npcList.filter(() => Math.random() < 0.4).slice(0, 4);
  for (const npc of responding) {
    const reply = await respondToPlayer(npc, playerMessage, playerName);
    if (reply) {
      broadcastAll({
        type: "npc-response",
        npcId: npc.id, npcName: npc.name, npcColor: npc.color,
        response: reply, emotion: npc.emotion,
      });
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

export function getRecentConversations() { return recentConversations.slice(0, 15); }

export async function aiLoop(): Promise<void> {
  const npcList = Object.values(npcs);
  const shuffled = [...npcList].sort(() => Math.random() - 0.5);
  const active = shuffled.slice(0, Math.floor(Math.random() * 3) + 2);
  for (const npc of active) {
    await npcDecideAction(npc);
    await new Promise(r => setTimeout(r, 600));
  }
}
