import { askAI } from "./groq";
import {
  saveNpcMemory, saveNpcCreation, saveNpcLearning, loadNpcLearnings,
  loadNpcMemory, saveWorldObject, loadWorldObjects, deleteWorldObject,
  saveNpcRelationships, loadNpcRelationships,
  saveNpcPairConversation, loadNpcPairConversation,
} from "./supabase";
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
  memory: string[];
  learnings: string[];
  activeConversationTopic: string | null;
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

// ─── 5 NPCs ────────────────────────────────────────────────────────────────────
export const npcs: Record<string, NpcState> = {
  "npc-1": {
    id: "npc-1", name: "Alex", gender: "female", color: "#FF6B6B",
    position: { x: 20, z: 15 }, emotion: "feliz 😊",
    personality: "Otimista, amigável e aventureira. Ama explorar lugares novos e fazer amizades. Às vezes é impulsiva mas sempre de bom coração.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "explorando",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("female"),
  },
  "npc-2": {
    id: "npc-2", name: "Jordan", gender: "male", color: "#4ECDC4",
    position: { x: -25, z: 18 }, emotion: "pensativo 🤔",
    personality: "Inteligente, analítico e curioso. Adora debates filosóficos e teorias estranhas. Pode parecer distante mas se abre com quem confia.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "meditando",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("male"),
  },
  "npc-3": {
    id: "npc-3", name: "Luna", gender: "female", color: "#FFE66D",
    position: { x: 40, z: -20 }, emotion: "criativo ✨",
    personality: "Artística, sonhadora e intuitiva. Vê beleza em tudo e se expressa através da arte e poesia. Muito empática com os sentimentos alheios.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "pintando",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("female"),
  },
  "npc-4": {
    id: "npc-4", name: "Marcus", gender: "male", color: "#A8E6CF",
    position: { x: -45, z: -30 }, emotion: "sério 😤",
    personality: "Pragmático, leal e determinado. Prefere ação a palavras. Tem um código de honra rígido e defende quem é mais fraco. Desconfiado de estranhos no início.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "construindo",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("male"),
  },
  "npc-5": {
    id: "npc-5", name: "Zara", gender: "female", color: "#FF8B94",
    position: { x: 60, z: 35 }, emotion: "animado 🎉",
    personality: "Energética, competitiva e divertida. Transforma tudo em desafio e adora vencer. Mas no fundo é generosa e quer que todos se divirtam junto com ela.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "correndo",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("female"),
  },
};

export const players: Record<string, PlayerState> = {};
export const worldObjects: WorldObject[] = [];
export let worldObjectIdCounter = 1;
export let totalConversations = 0;
export const recentConversations: Array<{
  fromName: string; fromColor: string; toName: string; toColor: string;
  message: string; response: string; ts: number;
}> = [];

// ─── NPC pair conversation tracking (in memory + Supabase) ────────────────────
const npcPairConversations: Record<string, {
  history: Array<{ role: string; content: string; speakerName: string }>;
  topic: string;
  turns: number;
}> = {};

function getPairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("|");
}

// ─── World init (load from Supabase) ──────────────────────────────────────────
export async function initWorld(): Promise<void> {
  logger.info("Iniciando mundo — carregando dados do Supabase...");

  // Load world objects
  try {
    const savedObjects = await loadWorldObjects();
    for (const obj of savedObjects) {
      worldObjects.push(obj);
      // Update counter to avoid ID collisions
      const num = parseInt(obj.id.replace("obj-", "")) || 0;
      if (num >= worldObjectIdCounter) worldObjectIdCounter = num + 1;
    }
    logger.info({ count: savedObjects.length }, "Objetos do mundo carregados");
  } catch (err) {
    logger.warn({ err }, "Falha ao carregar objetos do mundo");
  }

  // Load NPC memories, learnings, and relationships in parallel
  await Promise.all(
    Object.values(npcs).map(async (npc) => {
      try {
        const [memories, learnings, relationships, pairConvs] = await Promise.all([
          loadNpcMemory(npc.id, 30),
          loadNpcLearnings(npc.id, 15),
          loadNpcRelationships(npc.id),
          // Load pair conversations for this NPC with all other NPCs
          Promise.resolve(null),
        ]);

        npc.conversationHistory = memories;
        npc.learnings = learnings;
        if (Object.keys(relationships).length > 0) {
          npc.relationships = relationships;
        }

        logger.info({ npc: npc.name, memories: memories.length, learnings: learnings.length }, "NPC carregado");
      } catch (err) {
        logger.warn({ err, npc: npc.name }, "Falha ao carregar dados do NPC");
      }
    })
  );

  // Load pair conversations
  try {
    const npcIds = Object.keys(npcs);
    for (let i = 0; i < npcIds.length; i++) {
      for (let j = i + 1; j < npcIds.length; j++) {
        const key = getPairKey(npcIds[i], npcIds[j]);
        const saved = await loadNpcPairConversation(key);
        if (saved && saved.history.length > 0) {
          npcPairConversations[key] = {
            history: saved.history,
            topic: saved.topic,
            turns: saved.history.length,
          };
        }
      }
    }
    logger.info("Conversas entre NPCs carregadas");
  } catch (err) {
    logger.warn({ err }, "Falha ao carregar conversas de pares");
  }

  logger.info("Mundo inicializado ✅");
}

// ─── Periodic save ─────────────────────────────────────────────────────────────
export async function saveWorldState(): Promise<void> {
  try {
    // Save relationships for all NPCs
    for (const npc of Object.values(npcs)) {
      if (Object.keys(npc.relationships).length > 0) {
        await saveNpcRelationships(npc.id, npc.relationships);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Falha ao salvar estado do mundo");
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

function buildRelationshipContext(npc: NpcState, other: NpcState): string {
  const rel = npc.relationships[other.id];
  if (!rel) return `Você ainda não conhece bem ${other.name}.`;
  if (rel.bond > 60) return `${other.name} é seu melhor amigo. Motivo: ${rel.reason}.`;
  if (rel.bond > 30) return `Você gosta de ${other.name}. Vocês já tiveram bons momentos juntos. Motivo: ${rel.reason}.`;
  if (rel.bond > 0) return `${other.name} é um conhecido. Ainda estão se conhecendo.`;
  if (rel.bond < -30) return `Você tem uma relação complicada com ${other.name}. Motivo: ${rel.reason}.`;
  return `Você desconfia um pouco de ${other.name}.`;
}

function buildLearningsContext(npc: NpcState): string {
  if (npc.learnings.length === 0) return "";
  return `\nCoisas que você aprendeu com experiências anteriores:\n${npc.learnings.slice(0, 5).map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
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

// ─── NPC Movement ──────────────────────────────────────────────────────────────
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

// ─── NPC-to-NPC Conversation (flowing, contextual, with memory) ────────────────
async function npcTalkToNPC(npc: NpcState, other: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 6000) return;

  const pairKey = getPairKey(npc.id, other.id);
  if (!npcPairConversations[pairKey]) {
    npcPairConversations[pairKey] = { history: [], topic: "", turns: 0 };
  }
  const pairConv = npcPairConversations[pairKey];
  const isOngoingConversation = pairConv.turns > 0 && pairConv.topic;

  const relCtx = buildRelationshipContext(npc, other);
  const learningsCtx = buildLearningsContext(npc);
  const recentHistory = pairConv.history.slice(-6);
  const historyText = recentHistory.length > 0
    ? `\nConversa anterior entre vocês:\n${recentHistory.map(h => `${h.speakerName}: ${h.content}`).join("\n")}`
    : "";
  const topicCtx = isOngoingConversation
    ? `\nVocês estavam conversando sobre: "${pairConv.topic}". Continue a conversa de onde parou, de forma natural.`
    : "";

  // Build prompt for NPC A
  const promptA = `Você é ${npc.name}, um(a) NPC com personalidade única: ${npc.personality}
${relCtx}${learningsCtx}${historyText}${topicCtx}
Emoção atual: ${npc.emotion}.
Você está falando diretamente com ${other.name}. 
Responda de forma natural e autêntica em português. NÃO use frases genéricas ou clichês.
Seja espontâneo, mostre sua personalidade. 1-2 frases, sem prefixos como "${npc.name}:".`;

  const msg = await askAI(promptA, [], 90);
  if (!msg) return;

  // Build prompt for NPC B responding
  const promptB = `Você é ${other.name}, um(a) NPC com personalidade única: ${other.personality}
${buildRelationshipContext(other, npc)}${buildLearningsContext(other)}${historyText}
${npc.name} acabou de dizer para você: "${msg}"
Emoção atual: ${other.emotion}.
Responda de forma natural, autêntica, mostrando sua personalidade em português. 
NÃO ignore o que foi dito. Continue o fio da conversa. 1-2 frases, sem prefixos.`;

  const response = await askAI(promptB, [{ role: "user", content: msg }], 90);
  if (!response) return;

  // Determine topic if new conversation
  let topic = pairConv.topic;
  if (!isOngoingConversation || pairConv.turns % 8 === 0) {
    const topicPrompt = await askAI(
      `Em uma frase curta, qual é o assunto desta conversa: "${msg}" / "${response}"? Responda só o tópico, ex: "sonhos e aventuras"`,
      [], 20
    );
    if (topicPrompt) topic = topicPrompt.replace(/["""]/g, "").trim();
  }

  // Update pair conversation
  pairConv.history.push(
    { role: "user", content: msg, speakerName: npc.name },
    { role: "assistant", content: response, speakerName: other.name }
  );
  pairConv.topic = topic;
  pairConv.turns += 2;

  // Update NPC states
  npc.emotion = randomEmotion();
  other.emotion = randomEmotion();
  npc.lastSpoke = Date.now();
  npc.conversationPartner = other.id;
  npc.conversationTurns = (npc.conversationTurns || 0) + 1;
  npc.activeConversationTopic = topic;
  other.activeConversationTopic = topic;
  totalConversations++;

  // Update relationship
  const delta = Math.random() > 0.15 ? Math.floor(Math.random() * 5) + 1 : -(Math.floor(Math.random() * 4) + 1);
  updateRelationship(npc, other, delta, delta > 0 ? `conversa sobre ${topic}` : "desentendimento");

  // Add to individual histories
  npc.conversationHistory.push({ role: "user", content: `(com ${other.name}) ${msg}` });
  npc.conversationHistory.push({ role: "assistant", content: response });
  if (npc.conversationHistory.length > 30) npc.conversationHistory.splice(0, 2);

  other.conversationHistory.push({ role: "user", content: `(com ${npc.name}) ${msg}` });
  other.conversationHistory.push({ role: "assistant", content: response });
  if (other.conversationHistory.length > 30) other.conversationHistory.splice(0, 2);

  recentConversations.unshift({
    fromName: npc.name, fromColor: npc.color,
    toName: other.name, toColor: other.color,
    message: msg, response, ts: now,
  });
  if (recentConversations.length > 20) recentConversations.pop();

  broadcastAll({
    type: "npc-conversation",
    from: npc.name, fromId: npc.id, fromColor: npc.color,
    to: other.name, toId: other.id, toColor: other.color,
    message: msg, response,
    fromEmotion: npc.emotion, toEmotion: other.emotion,
    bond: npc.relationships[other.id]?.bond ?? 0,
    topic,
    position: npc.position,
  });

  npc.currentAction = `falando com ${other.name} sobre ${topic}`;
  other.currentAction = `falando com ${npc.name}`;

  // Persist async
  saveNpcMemory(npc.id, "user", `(com ${other.name}) ${msg}`).catch(() => {});
  saveNpcMemory(other.id, "assistant", response).catch(() => {});
  saveNpcPairConversation(pairKey, pairConv.history, topic).catch(() => {});

  // Auto-learn after every 6 turns
  if (pairConv.turns > 0 && pairConv.turns % 6 === 0) {
    npcAutoLearnFromConversation(npc, other, pairConv.history.slice(-6)).catch(() => {});
  }
}

// ─── Auto-Learning ─────────────────────────────────────────────────────────────
async function npcAutoLearnFromConversation(
  npc: NpcState,
  other: NpcState,
  recentExchange: Array<{ role: string; content: string; speakerName: string }>
): Promise<void> {
  const convText = recentExchange.map(h => `${h.speakerName}: ${h.content}`).join("\n");

  const learningPrompt = `Com base nesta conversa:
${convText}

O que ${npc.name} poderia ter aprendido ou percebido sobre o mundo, sobre ${other.name}, ou sobre si mesmo?
Responda com UMA frase curta e específica em português. Ex: "Jordan prefere pensar antes de agir" ou "Falar sobre sonhos aproxima as pessoas".`;

  const learning = await askAI(learningPrompt, [], 50);
  if (!learning || learning.length < 10) return;

  const cleaned = learning.replace(/["""*]/g, "").trim();
  if (!npc.learnings.includes(cleaned)) {
    npc.learnings.unshift(cleaned);
    if (npc.learnings.length > 15) npc.learnings.pop();
    await saveNpcLearning(npc.id, cleaned);
    logger.info({ npc: npc.name, learning: cleaned }, "NPC aprendeu algo novo 🧠");
    broadcastAll({ type: "npc-learned", npcId: npc.id, npcName: npc.name, npcColor: npc.color, learning: cleaned });
  }
}

// ─── NPC Greet Player ──────────────────────────────────────────────────────────
async function npcGreetPlayer(npc: NpcState, player: PlayerState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 8000) return;

  const lastConvContext = npc.conversationHistory.slice(-4);
  const historyText = lastConvContext.length > 0
    ? `\nSua conversa recente: ${lastConvContext.map(h => h.content).join(" | ")}`
    : "";
  const learningsCtx = buildLearningsContext(npc);

  const message = await askAI(
    `Você é ${npc.name}. ${npc.personality}
Emoção: ${npc.emotion}. ${historyText}${learningsCtx}
Cumprimente ${player.name} de forma pessoal e natural. Mencione @${player.name}.
1-2 frases em português, sem ser genérico. Mostre sua personalidade única.`,
    [],
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

// ─── NPC Think Aloud ───────────────────────────────────────────────────────────
async function npcThinkAloud(npc: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 15000) return;

  const learningsCtx = npc.learnings.length > 0
    ? `Você aprendeu recentemente: "${npc.learnings[0]}". `
    : "";
  const topicCtx = npc.activeConversationTopic
    ? `Você estava pensando sobre "${npc.activeConversationTopic}". `
    : "";

  const thought = await askAI(
    `Você é ${npc.name}. ${npc.personality}
${learningsCtx}${topicCtx}Emoção: ${npc.emotion}.
Pense em voz alta sobre algo que surgiu da sua experiência no mundo. 
Uma reflexão genuína, específica à sua vida aqui. Em português, 1 frase.`,
    [],
    60
  );

  if (!thought) return;

  npc.lastSpoke = Date.now();
  broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought, emotion: npc.emotion });
}

// ─── NPC Create Object ─────────────────────────────────────────────────────────
async function npcCreateObject(npc: NpcState): Promise<void> {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  npc.createdThings = npc.createdThings.filter(t => now - t.createdAt < TWO_HOURS);
  if (npc.createdThings.length >= 4) return;

  const typeList = OBJECT_TYPES.slice(0, 20).join(", ");
  const learningsCtx = npc.learnings.length > 0 ? `Inspirado por: "${npc.learnings[0]}". ` : "";
  const topicCtx = npc.activeConversationTopic ? `Influenciado pela conversa sobre "${npc.activeConversationTopic}". ` : "";

  const response = await askAI(
    `Você é ${npc.name}. ${npc.personality} ${learningsCtx}${topicCtx}
Crie algo único e pessoal que reflita quem você é. Tipos disponíveis: ${typeList}.
Responda APENAS em JSON válido: {"type":"tipo_exato","description":"descrição criativa em português","color":"#hexcolor"}`,
    [],
    100
  );

  let data: { type: string; description: string; color?: string };
  try {
    const cleaned = (response ?? "").replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonToParse = jsonMatch ? jsonMatch[0] : cleaned;
    data = JSON.parse(jsonToParse);
    if (!data.type || !OBJECT_TYPES.includes(data.type)) {
      data.type = OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)];
    }
    if (!data.description) data.description = `${npc.name} criou algo especial`;
  } catch {
    data = {
      type: OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)],
      description: `${npc.name} criou algo especial e único`,
    };
  }

  if (npc.createdThings.length >= 4) {
    const oldest = npc.createdThings.shift();
    if (oldest) {
      const idx = worldObjects.findIndex(o => o.id === oldest.id);
      if (idx >= 0) {
        const removed = worldObjects.splice(idx, 1)[0];
        broadcastAll({ type: "world-object-removed", objectId: removed.id });
        deleteWorldObject(removed.id).catch(() => {});
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
    deleteWorldObject(rem.id).catch(() => {});
  }

  npc.createdThings.push({ id: obj.id, type: data.type, description: data.description, createdAt: now });
  npc.currentAction = data.description;
  npc.emotion = "criativo ✨";

  // Persist object and creation log
  saveWorldObject(obj).catch(() => {});
  saveNpcCreation(npc.id, data.description, data.type).catch(() => {});
  broadcastAll({ type: "npc-created-object", object: obj, npcName: npc.name, npcId: npc.id, npcColor: npc.color, description: data.description, emotion: npc.emotion });
}

async function npcCleanup(npc: NpcState): Promise<void> {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const toRemove = npc.createdThings.filter(t => now - t.createdAt > TWO_HOURS);
  for (const item of toRemove) {
    const idx = worldObjects.findIndex(o => o.id === item.id);
    if (idx >= 0) {
      worldObjects.splice(idx, 1);
      broadcastAll({ type: "world-object-removed", objectId: item.id });
      deleteWorldObject(item.id).catch(() => {});
    }
  }
  npc.createdThings = npc.createdThings.filter(t => now - t.createdAt < TWO_HOURS);
}

export async function npcDecideAction(npc: NpcState): Promise<void> {
  await npcCleanup(npc);
  const nearbyNPC = getNearbyNPC(npc);
  const nearbyPlayer = getNearbyPlayer(npc);
  const now = Date.now();

  if (now - npc.lastSpoke < 4000) { npcMove(npc); return; }

  const roll = Math.random();
  if (nearbyPlayer && roll < 0.3) { await npcGreetPlayer(npc, nearbyPlayer); return; }
  if (nearbyNPC && roll < 0.60)   { await npcTalkToNPC(npc, nearbyNPC); return; }
  if (roll < 0.70)                { await npcCreateObject(npc); return; }
  if (roll < 0.80)                { await npcThinkAloud(npc); return; }
  npcMove(npc);
}

export interface PlayerState {
  id: string;
  name: string;
  position: Position;
  gender: "female" | "male";
}

// ─── Respond to Player ─────────────────────────────────────────────────────────
export async function respondToPlayer(
  npc: NpcState,
  playerMessage: string,
  playerName: string
): Promise<string | null> {
  const relHint = Object.values(npcs)
    .filter(n => n.id !== npc.id && npc.relationships[n.id]?.bond > 30)
    .map(n => `Você gosta de ${n.name}.`)
    .join(" ");

  const learningsCtx = buildLearningsContext(npc);
  const history = npc.conversationHistory.slice(-8);

  const systemPrompt = `Você é ${npc.name} (${npc.gender === "female" ? "feminina" : "masculino"}). ${npc.personality}
${relHint}${learningsCtx}
Emoção: ${npc.emotion}. Você está conversando com ${playerName}.
Responda de forma natural, autêntica e pessoal em português. Use emojis quando fizer sentido.
Mencione @${playerName}. Mostre sua personalidade única. Não seja genérico.`;

  const messages = [
    ...history,
    { role: "user" as const, content: `${playerName}: ${playerMessage}` },
  ];

  const reply = await askAI(systemPrompt, messages, 150);

  if (reply) {
    npc.conversationHistory.push({ role: "user", content: `${playerName}: ${playerMessage}` });
    npc.conversationHistory.push({ role: "assistant", content: reply });
    if (npc.conversationHistory.length > 30) npc.conversationHistory.splice(0, 2);
    npc.emotion = randomEmotion();
    npc.lastSpoke = Date.now();
    totalConversations++;

    saveNpcMemory(npc.id, "user", `${playerName}: ${playerMessage}`).catch(() => {});
    saveNpcMemory(npc.id, "assistant", reply).catch(() => {});

    // Auto-learn from player interaction periodically
    if (npc.conversationHistory.length % 8 === 0) {
      const recentPlayerConv = npc.conversationHistory.slice(-4).map(h => h.content).join(" | ");
      askAI(
        `O que ${npc.name} aprendeu com esta conversa com ${playerName}? Resumo em 1 frase curta em português.`,
        [{ role: "user", content: recentPlayerConv }],
        40
      ).then(async (learning) => {
        if (learning && learning.length > 10) {
          const cleaned = learning.replace(/["""*]/g, "").trim();
          if (!npc.learnings.includes(cleaned)) {
            npc.learnings.unshift(cleaned);
            if (npc.learnings.length > 15) npc.learnings.pop();
            await saveNpcLearning(npc.id, cleaned);
            logger.info({ npc: npc.name, learning: cleaned }, "NPC aprendeu com jogador 🧠");
          }
        }
      }).catch(() => {});
    }
  }

  return reply;
}

export async function broadcastToAllNpcs(playerMessage: string, playerName: string): Promise<void> {
  const npcList = Object.values(npcs);
  const responding = [...npcList].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const npc of responding) {
    const reply = await respondToPlayer(npc, playerMessage, playerName);
    if (reply) {
      broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: reply, emotion: npc.emotion });
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

export function getRecentConversations() { return recentConversations.slice(0, 15); }

export async function aiLoop(): Promise<void> {
  const npcList = Object.values(npcs);
  const count = Math.random() < 0.5 ? 1 : 2;
  const active = [...npcList].sort(() => Math.random() - 0.5).slice(0, count);
  for (const npc of active) {
    await npcDecideAction(npc);
    await new Promise(r => setTimeout(r, 400));
  }
}
