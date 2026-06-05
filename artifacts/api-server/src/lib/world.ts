import { askAI } from "./groq";
import {
  saveNpcMemory,
  saveNpcCreation,
  saveNpcLearning,
  loadNpcLearnings,
  loadNpcMemory,
  saveWorldObject,
  loadWorldObjects,
  deleteWorldObject,
  saveNpcRelationships,
  loadNpcRelationships,
  saveNpcPairConversation,
  loadNpcPairConversation,
} from "./supabase";
import { logger } from "./logger";

export function getRecentConversations() {
  return recentConversations.slice(0, 15);
}

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

const WORLD_EVENTS = ["chuva 🌧️", "sol 🌞", "noite 🌙", "festa 🎉", "tempestade ⛈️", "amanhecer 🌅", "neblina 🌫️"];

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

// ─── Global AI Throttling ──────────────────────────────────────────────────
let isAiProcessing = false;
async function aiQueue<T>(fn: () => Promise<T>): Promise<T | null> {
  if (isAiProcessing) {
    logger.debug("IA ocupada, ignorando chamada para poupar cota.");
    return null;
  }
  isAiProcessing = true;
  try {
    const res = await fn();
    await new Promise(r => setTimeout(r, 3000));
    return res;
  } finally {
    isAiProcessing = false;
  }
}

// ─── 5 NPCs ──────────────────────────────────────────────────────────────────
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

export const players: Record<string, any> = {};
export const worldObjects: WorldObject[] = [];
export let worldObjectIdCounter = 1;
export let totalConversations = 0;
export const recentConversations: Array<{
  fromName: string; fromColor: string; toName: string; toColor: string;
  message: string; response: string; ts: number;
}> = [];

let currentWorldEvent = "sol 🌞";

const npcPairConversations: Record<string, {
  history: Array<{ role: string; content: string; speakerName: string }>;
  topic: string;
  turns: number;
}> = {};

function getPairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("|");
}

export async function initWorld(): Promise<void> {
  logger.info("Iniciando mundo — carregando dados do Supabase...");
  try {
    const savedObjects = await loadWorldObjects();
    for (const obj of savedObjects) {
      worldObjects.push(obj);
      const num = parseInt(obj.id.replace("obj-", "")) || 0;
      if (num >= worldObjectIdCounter) worldObjectIdCounter = num + 1;
    }
    logger.info({ count: savedObjects.length }, "Objetos do mundo carregados");
  } catch (err) {
    logger.warn({ err }, "Falha ao carregar objetos do mundo");
  }

  await Promise.all(
    Object.values(npcs).map(async (npc) => {
      try {
        const [memories, learnings, relationships] = await Promise.all([
          loadNpcMemory(npc.id, 30),
          loadNpcLearnings(npc.id, 15),
          loadNpcRelationships(npc.id),
        ]);
        npc.conversationHistory = memories;
        npc.learnings = learnings;
        if (Object.keys(relationships).length > 0) npc.relationships = relationships;
        logger.info({ npc: npc.name, memories: memories.length, learnings: learnings.length }, "NPC carregado");
      } catch (err) {
        logger.warn({ err, npc: npc.name }, "Falha ao carregar dados do NPC");
      }
    })
  );

  try {
    const npcIds = Object.keys(npcs);
    for (let i = 0; i < npcIds.length; i++) {
      for (let j = i + 1; j < npcIds.length; j++) {
        const key = getPairKey(npcIds[i], npcIds[j]);
        const saved = await loadNpcPairConversation(key);
        if (saved && saved.history.length > 0) {
          npcPairConversations[key] = { history: saved.history, topic: saved.topic, turns: saved.history.length };
        }
      }
    }
    logger.info("Conversas entre NPCs carregadas");
  } catch (err) {
    logger.warn({ err }, "Falha ao carregar conversas de pares");
  }
  logger.info("Mundo inicializado ✅");
}

export async function saveWorldState(): Promise<void> {
  try {
    for (const npc of Object.values(npcs)) {
      if (Object.keys(npc.relationships).length > 0) {
        await saveNpcRelationships(npc.id, npc.relationships);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Falha ao salvar estado do mundo");
  }
}

function getNearbyNPC(npc: NpcState, radius = 35): NpcState | null {
  let closest: NpcState | null = null, minD = Infinity;
  for (const other of Object.values(npcs)) {
    if (other.id === npc.id) continue;
    const d = dist(npc.position, other.position);
    if (d < radius && d < minD) { minD = d; closest = other; }
  }
  return closest;
}

function getNearbyPlayer(npc: NpcState): any | null {
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
  return `\nCoisas que você aprendeu:\n${npc.learnings.slice(0, 5).map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
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

// ─── Broadcast World Event (rain, party, night, etc.) ─────────────────────────
export function broadcastWorldEvent(): void {
  const event = WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)];
  currentWorldEvent = event;
  broadcastAll({ type: "world-event", event });
  logger.info({ event }, "Evento mundial disparado");

  // NPCs comment on the event
  const commentingNpcs = Object.values(npcs).sort(() => Math.random() - 0.5).slice(0, 2);
  let delay = 2000;
  for (const npc of commentingNpcs) {
    setTimeout(() => {
      const prompt = `Você é ${npc.name}. ${npc.personality}
Um evento aconteceu no mundo: ${event}.
Reaja a este evento em 1 frase curta e pessoal em português, usando emojis.`;
      aiQueue(() => askAI(prompt, [], 60)).then(reaction => {
        if (reaction) {
          npc.emotion = randomEmotion();
          broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought: reaction, emotion: npc.emotion });
        }
      });
    }, delay);
    delay += 4000;
  }
}

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
  }, Math.max(2000, (d / 8) * 1000));
}

async function npcTalkToNPC(npc: NpcState, other: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 20000) return;

  const pairKey = getPairKey(npc.id, other.id);
  if (!npcPairConversations[pairKey]) {
    npcPairConversations[pairKey] = { history: [], topic: "", turns: 0 };
  }
  const pairConv = npcPairConversations[pairKey];
  const isOngoingConversation = pairConv.turns > 0 && pairConv.topic;

  const relCtx = buildRelationshipContext(npc, other);
  const learningsCtx = buildLearningsContext(npc);
  const recentHistory = pairConv.history.slice(-8);
  const historyText = recentHistory.length > 0
    ? `\nConversa recente entre vocês:\n${recentHistory.map(h => `${h.speakerName}: ${h.content}`).join("\n")}`
    : "";
  const topicCtx = isOngoingConversation
    ? `\nVocês estavam conversando sobre: "${pairConv.topic}". Continue a conversa de onde parou, aprofundando o tema.`
    : `\nComece uma nova conversa interessante baseada na sua personalidade.`;
  const worldCtx = `\nEvento atual no mundo: ${currentWorldEvent}.`;

  const promptA = `Você é ${npc.name}, com personalidade: ${npc.personality}
${relCtx}${learningsCtx}${historyText}${topicCtx}${worldCtx}
Você está conversando com ${other.name}. Use memória da conversa anterior.
Resposta curta (1-2 frases), natural, pessoal, em português. Use emojis.`;

  const replyA = await aiQueue(() => askAI(promptA, [], 100));
  if (!replyA) return;

  npc.lastSpoke = now;
  npc.emotion = randomEmotion();
  npc.currentAction = `conversando com ${other.name}`;
  pairConv.history.push({ role: "assistant", content: replyA, speakerName: npc.name });
  pairConv.turns++;

  broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: replyA, emotion: npc.emotion });

  // Add to recent conversations feed
  recentConversations.unshift({
    fromName: npc.name, fromColor: npc.color,
    toName: other.name, toColor: other.color,
    message: replyA, response: "", ts: now,
  });
  if (recentConversations.length > 20) recentConversations.pop();

  // Update topic and relationships every 6 turns (longer conversations)
  if (pairConv.turns % 6 === 0) {
    const summaryPrompt = `Resuma o tópico atual da conversa entre ${npc.name} e ${other.name} em uma frase curta.`;
    const histStr = pairConv.history.slice(-6).map(h => h.content).join(" | ");
    aiQueue(() => askAI(summaryPrompt, [{ role: "user", content: histStr }], 40)).then(topic => {
      if (topic) pairConv.topic = topic.replace(/[""]/g, "").trim();
    });
    updateRelationship(npc, other, 2, "conversa agradável");
    // Fixed: correct parameter order (history, topic)
    saveNpcPairConversation(pairKey, pairConv.history, pairConv.topic).catch(() => {});
  }

  totalConversations++;
}

async function npcGreetPlayer(npc: NpcState, player: any): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 30000) return;

  const prompt = `Você é ${npc.name}. ${npc.personality}
O jogador ${player.name} está por perto. Dê um cumprimento amigável e curto em português, mencionando @${player.name}. Use emojis. 1 frase.`;

  const greeting = await aiQueue(() => askAI(prompt, [], 70));
  if (greeting) {
    npc.lastSpoke = now;
    npc.emotion = "feliz 😊";
    broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: greeting, emotion: npc.emotion });
  }
}

async function npcThinkAloud(npc: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 45000) return;

  const recentObjects = worldObjects.slice(-3).map(o => `${o.type} criado por ${o.creator}`).join(", ");
  const objectCtx = recentObjects ? `\nObjetos recentes no mundo: ${recentObjects}.` : "";

  const thought = await aiQueue(() => askAI(
    `Você é ${npc.name}. ${npc.personality}${objectCtx}
Pense em voz alta sobre algo: o mundo, um objeto criado, ou o evento atual (${currentWorldEvent}). 1 frase criativa em português.`,
    [],
    70
  ));

  if (thought) {
    npc.lastSpoke = now;
    broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought, emotion: npc.emotion });
  }
}

async function npcCreateObject(npc: NpcState): Promise<void> {
  const now = Date.now();
  if (npc.createdThings.length >= 4) return;

  const typeList = OBJECT_TYPES.slice(0, 25).join(", ");
  const response = await aiQueue(() => askAI(
    `Você é ${npc.name}. ${npc.personality}
Crie algo para o mundo baseado na sua personalidade. Tipos disponíveis: ${typeList}.
Responda APENAS JSON válido: {"type":"tipo","description":"descrição criativa curta","color":"#hexcolor"}`,
    [],
    120
  ));

  if (!response) return;

  try {
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (!jsonMatch) return;
    const data = JSON.parse(jsonMatch[0]);
    const obj: WorldObject = {
      id: `obj-${worldObjectIdCounter++}`,
      creator: npc.name, creatorId: npc.id, creatorColor: npc.color,
      type: OBJECT_TYPES.includes(data.type) ? data.type : "rock",
      description: data.description || "algo especial",
      position: { x: npc.position.x + (Math.random() - 0.5) * 15, z: npc.position.z + (Math.random() - 0.5) * 15 },
      createdAt: now,
      color: /^#[0-9a-fA-F]{3,6}$/.test(data.color) ? data.color : npc.color,
      scale: 0.6 + Math.random() * 0.7,
    };
    worldObjects.push(obj);
    npc.createdThings.push({ id: obj.id, type: obj.type, description: obj.description, createdAt: now });
    npc.currentAction = obj.description;
    saveWorldObject(obj).catch(() => {});
    saveNpcCreation(npc.id, obj.description, obj.type).catch(() => {});
    broadcastAll({ type: "npc-created-object", object: obj, npcName: npc.name, npcId: npc.id, npcColor: npc.color, description: obj.description, emotion: npc.emotion });

    // Collective intelligence: other nearby NPCs may react to this creation
    setTimeout(() => npcReactToCreation(obj, npc), 5000);
  } catch (err) {
    logger.debug({ err }, "Erro ao parsear objeto criado pela IA");
  }
}

// ─── Collective Intelligence: NPCs react to what others built ──────────────────
async function npcReactToCreation(obj: WorldObject, creator: NpcState): Promise<void> {
  const nearby = Object.values(npcs).filter(n =>
    n.id !== creator.id && dist(n.position, obj.position) < 60 && Date.now() - n.lastSpoke > 20000
  );
  if (nearby.length === 0) return;

  const reactor = nearby[Math.floor(Math.random() * nearby.length)];
  const relCtx = buildRelationshipContext(reactor, creator);

  const reaction = await aiQueue(() => askAI(
    `Você é ${reactor.name}. ${reactor.personality}
${relCtx}
${creator.name} acabou de criar: "${obj.description}" (um ${obj.type}).
Reaja em 1 frase curta e genuína em português, mostrando sua personalidade. Use emojis.`,
    [],
    80
  ));

  if (reaction) {
    reactor.lastSpoke = Date.now();
    reactor.emotion = randomEmotion();
    broadcastAll({ type: "npc-thought", npcId: reactor.id, npcName: reactor.name, npcColor: reactor.color, thought: reaction, emotion: reactor.emotion });
  }
}

async function npcCleanup(npc: NpcState): Promise<void> {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  npc.createdThings = npc.createdThings.filter(t => {
    if (now - t.createdAt > TWO_HOURS) {
      const idx = worldObjects.findIndex(o => o.id === t.id);
      if (idx >= 0) {
        const removed = worldObjects.splice(idx, 1)[0];
        broadcastAll({ type: "world-object-removed", objectId: removed.id });
        deleteWorldObject(removed.id).catch(() => {});
      }
      return false;
    }
    return true;
  });
}

export async function npcDecideAction(npc: NpcState): Promise<void> {
  try {
    await npcCleanup(npc);
    const nearbyNPC = getNearbyNPC(npc);
    const nearbyPlayer = getNearbyPlayer(npc);
    const now = Date.now();

    if (now - npc.lastSpoke < 15000) { npcMove(npc); return; }

    const roll = Math.random();
    if (nearbyPlayer && roll < 0.25) { await npcGreetPlayer(npc, nearbyPlayer); return; }
    if (nearbyNPC && roll < 0.5) { await npcTalkToNPC(npc, nearbyNPC); return; }
    if (roll < 0.65) { await npcCreateObject(npc); return; }
    if (roll < 0.78) { await npcThinkAloud(npc); return; }
    npcMove(npc);
  } catch (err) {
    logger.error({ err }, "Erro em npcDecideAction");
    npcMove(npc);
  }
}

export async function respondToPlayer(npc: NpcState, playerMessage: string, playerName: string): Promise<string | null> {
  console.log(`[CHAT] Jogador "${playerName}" → NPC "${npc.name}": "${playerMessage.slice(0, 80)}"`);

  // Build rich context for the NPC
  const recentMemory = npc.conversationHistory.slice(-10)
    .map(m => `${m.role === "user" ? playerName : npc.name}: ${m.content}`)
    .join("\n");
  const memoryCtx = recentMemory ? `\nMemória da conversa com ${playerName}:\n${recentMemory}` : "";
  const learningsCtx = buildLearningsContext(npc);

  const systemPrompt = `Você é ${npc.name}. ${npc.personality}
Emoção atual: ${npc.emotion}.
${memoryCtx}${learningsCtx}
Você está tendo uma conversa com o jogador ${playerName}.
Responda de forma natural, pessoal e envolvente em português. Pode fazer perguntas. Use emojis. 2-3 frases.`;

  const messages = npc.conversationHistory.slice(-10).concat([
    { role: "user" as const, content: `${playerName}: ${playerMessage}` }
  ]);

  const reply = await aiQueue(() => askAI(systemPrompt, messages, 180));

  if (reply) {
    console.log(`[CHAT] NPC "${npc.name}" → "${playerName}": "${reply.slice(0, 80)}"`);
    npc.conversationHistory.push({ role: "user", content: `${playerName}: ${playerMessage}` });
    npc.conversationHistory.push({ role: "assistant", content: reply });
    if (npc.conversationHistory.length > 30) npc.conversationHistory.splice(0, 2);
    npc.lastSpoke = Date.now();
    npc.emotion = randomEmotion();
    saveNpcMemory(npc.id, "user", `${playerName}: ${playerMessage}`).catch(() => {});
    saveNpcMemory(npc.id, "assistant", reply).catch(() => {});

    // Learn from long conversations
    if (npc.conversationHistory.length > 0 && npc.conversationHistory.length % 10 === 0) {
      const learningPrompt = `Da conversa com ${playerName}, o que você aprendeu de mais importante? Responda em 1 frase curta.`;
      aiQueue(() => askAI(learningPrompt, npc.conversationHistory.slice(-6), 50)).then(learning => {
        if (learning) {
          npc.learnings.push(learning);
          if (npc.learnings.length > 20) npc.learnings.shift();
          saveNpcLearning(npc.id, learning).catch(() => {});
          broadcastAll({ type: "npc-learned", npcId: npc.id, npcName: npc.name, npcColor: npc.color, learning });
        }
      });
    }
  } else {
    console.log(`[CHAT] NPC "${npc.name}" não conseguiu responder (IA ocupada ou erro)`);
  }
  return reply;
}

export async function broadcastToAllNpcs(playerMessage: string, playerName: string): Promise<void> {
  const npcList = Object.values(npcs);
  const responding = [...npcList].sort(() => Math.random() - 0.5).slice(0, 2);
  for (const npc of responding) {
    const reply = await respondToPlayer(npc, playerMessage, playerName);
    if (reply) {
      broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: reply, emotion: npc.emotion });
      await new Promise(r => setTimeout(r, 2500));
    }
  }
}

export async function aiLoop(): Promise<void> {
  const npcList = Object.values(npcs);
  // Pick 1 random NPC per loop cycle
  const active = [...npcList].sort(() => Math.random() - 0.5).slice(0, 1);
  for (const npc of active) {
    try {
      await npcDecideAction(npc);
    } catch (err) {
      logger.error({ err }, "Erro no AI loop — continuando");
    }
  }
}
