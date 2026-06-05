import { askAI, isCircuitOpen, getFallbackPhrase } from "./groq";
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
  return recentConversations.slice(0, 20);
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
  goal: string;
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
  "custom",
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
    await new Promise(r => setTimeout(r, 2500));
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
    personality: "Otimista, amigável e aventureira. Ama explorar lugares novos e fazer amizades. Às vezes é impulsiva mas sempre de bom coração. Tem um jeito de iluminar qualquer ambiente onde entra.",
    goal: "Conhecer todos os habitantes do mundo e criar um lugar de encontro especial para reunir as pessoas.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "explorando",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("female"),
  },
  "npc-2": {
    id: "npc-2", name: "Jordan", gender: "male", color: "#4ECDC4",
    position: { x: -25, z: 18 }, emotion: "pensativo 🤔",
    personality: "Inteligente, analítico e curioso. Adora debates filosóficos e teorias estranhas. Pode parecer distante mas se abre com quem confia. Coleciona conhecimentos como outros colecionam objetos.",
    goal: "Descobrir os segredos do universo deste mundo e documentar seus achados em uma biblioteca pessoal.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "meditando",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("male"),
  },
  "npc-3": {
    id: "npc-3", name: "Luna", gender: "female", color: "#FFE66D",
    position: { x: 40, z: -20 }, emotion: "criativo ✨",
    personality: "Artística, sonhadora e intuitiva. Vê beleza em tudo e se expressa através da arte e poesia. Muito empática com os sentimentos alheios. Cada criação sua carrega uma emoção profunda.",
    goal: "Transformar este mundo em uma galeria de arte viva, onde cada canto conta uma história.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "pintando",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("female"),
  },
  "npc-4": {
    id: "npc-4", name: "Marcus", gender: "male", color: "#A8E6CF",
    position: { x: -45, z: -30 }, emotion: "sério 😤",
    personality: "Pragmático, leal e determinado. Prefere ação a palavras. Tem um código de honra rígido e defende quem é mais fraco. Desconfiado de estranhos no início, mas fiel como ninguém depois.",
    goal: "Construir estruturas sólidas que durem para sempre e proteger os que precisam de ajuda.",
    conversationHistory: [], memory: [], learnings: [],
    isMoving: false, targetPosition: null, currentAction: "construindo",
    createdThings: [], relationships: {}, lastSpoke: 0,
    conversationPartner: null, conversationTurns: 0, activeConversationTopic: null,
    outfit: randomOutfit("male"),
  },
  "npc-5": {
    id: "npc-5", name: "Zara", gender: "female", color: "#FF8B94",
    position: { x: 60, z: 35 }, emotion: "animado 🎉",
    personality: "Energética, competitiva e divertida. Transforma tudo em desafio e adora vencer. Mas no fundo é generosa e quer que todos se divirtam junto com ela. Sua energia é contagiante.",
    goal: "Criar o maior festival já visto neste mundo e fazer todo mundo dançar pelo menos uma vez.",
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
  message: string; response: string; ts: number; type?: string;
}> = [];

export let currentWorldEvent = "sol 🌞";

const npcPairConversations: Record<string, {
  history: Array<{ role: string; content: string; speakerName: string }>;
  topic: string;
  turns: number;
}> = {};

function getPairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("|");
}

export async function initWorld(): Promise<void> {
  logger.info("Iniciando mundo — carregando dados persistidos...");
  try {
    const savedObjects = await loadWorldObjects();
    for (const obj of savedObjects) {
      worldObjects.push(obj);
      const num = parseInt(obj.id.replace("obj-", "")) || 0;
      if (num >= worldObjectIdCounter) worldObjectIdCounter = num + 1;
    }
    logger.info({ count: savedObjects.length }, "Objetos do mundo carregados");

    // Restore each NPC's createdThings from the loaded world objects
    // so they know what they've already built (avoids re-creating and respects limits)
    for (const obj of savedObjects) {
      const npc = Object.values(npcs).find(n => n.id === obj.creatorId);
      if (npc) {
        npc.createdThings.push({
          id: obj.id,
          type: obj.type,
          description: obj.description,
          createdAt: obj.createdAt,
        });
      }
    }
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
        logger.info({ npc: npc.name, memories: memories.length, learnings: learnings.length, objects: npc.createdThings.length }, "NPC carregado");
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
  if (!rel) return `Você ainda não conhece bem ${other.name}. É uma oportunidade de criar conexão.`;
  if (rel.bond > 70) return `${other.name} é seu melhor amigo neste mundo. Vocês têm um vínculo profundo. Motivo: ${rel.reason}.`;
  if (rel.bond > 40) return `Você gosta muito de ${other.name}. Já passaram momentos inesquecíveis juntos. Motivo: ${rel.reason}.`;
  if (rel.bond > 10) return `${other.name} é um bom conhecido. Ainda constroem a amizade.`;
  if (rel.bond < -40) return `Você tem uma rivalidade intensa com ${other.name}. Motivo: ${rel.reason}. Isso pode mudar com tempo.`;
  if (rel.bond < -10) return `Você desconfia um pouco de ${other.name}. Motivo: ${rel.reason}.`;
  return `${other.name} é um conhecido neutro. A relação pode crescer.`;
}

function buildLearningsContext(npc: NpcState): string {
  if (npc.learnings.length === 0) return "";
  return `\nCoisas que você aprendeu e carrega consigo:\n${npc.learnings.slice(0, 6).map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
}

function buildWorldContext(): string {
  const objNames = worldObjects.slice(-5).map(o => `"${o.description}" (${o.type}) de ${o.creator}`).join(", ");
  const playerNames = Object.values(players).map((p: any) => p.name).join(", ");
  return [
    `Evento atual: ${currentWorldEvent}.`,
    objNames ? `Criações recentes no mundo: ${objNames}.` : "",
    playerNames ? `Jogadores presentes: ${playerNames}.` : "",
  ].filter(Boolean).join(" ");
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

  const commentingNpcs = Object.values(npcs).sort(() => Math.random() - 0.5).slice(0, 2);
  let delay = 2000;
  for (const npc of commentingNpcs) {
    setTimeout(() => {
      const prompt = `Você é ${npc.name}. ${npc.personality}
Seu objetivo pessoal: ${npc.goal}
Um evento aconteceu no mundo: ${event}.
Reaja de forma autêntica à sua personalidade em 1 frase curta em português, usando emojis. Seja espontâneo e único.`;
      aiQueue(() => askAI(prompt, [], 70)).then(reaction => {
        if (reaction) {
          npc.emotion = randomEmotion();
          broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought: reaction, emotion: npc.emotion });
          pushToFeed({ fromName: npc.name, fromColor: npc.color, toName: "mundo", toColor: "#88aaff", message: reaction, response: "", ts: Date.now(), type: "thought" });
        }
      });
    }, delay);
    delay += 4000;
  }
}

// ─── Feed helper ──────────────────────────────────────────────────────────────
function pushToFeed(entry: typeof recentConversations[0]) {
  recentConversations.unshift(entry);
  if (recentConversations.length > 30) recentConversations.pop();
  broadcastAll({ type: "feed-update", entry });
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
  const worldCtx = buildWorldContext();
  const recentHistory = pairConv.history.slice(-8);
  const historyText = recentHistory.length > 0
    ? `\nConversa recente entre vocês:\n${recentHistory.map(h => `${h.speakerName}: ${h.content}`).join("\n")}`
    : "";
  const topicCtx = isOngoingConversation
    ? `\nVocês estavam conversando sobre: "${pairConv.topic}". Continue de onde parou, aprofundando genuinamente.`
    : `\nInicie uma conversa nova e surpreendente baseada na sua personalidade e objetivo pessoal.`;

  const promptA = `Você é ${npc.name}. Personalidade: ${npc.personality}
Seu objetivo de vida: ${npc.goal}
${relCtx}${learningsCtx}${historyText}${topicCtx}
Contexto do mundo: ${worldCtx}

Você está falando com ${other.name} (personalidade: ${other.personality.split(".")[0]}).
Fale de forma autêntica e pessoal. Mostre sua personalidade real. 1-2 frases em português. Use emojis.
NÃO seja genérico. Fale algo que SÓ você, ${npc.name}, diria.`;

  const replyA = await aiQueue(() => askAI(promptA, [], 120));
  if (!replyA) return;

  npc.lastSpoke = now;
  npc.emotion = randomEmotion();
  npc.currentAction = `conversando com ${other.name}`;
  pairConv.history.push({ role: "assistant", content: replyA, speakerName: npc.name });
  pairConv.turns++;

  broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: replyA, emotion: npc.emotion, toNpcId: other.id, toNpcName: other.name });

  pushToFeed({
    fromName: npc.name, fromColor: npc.color,
    toName: other.name, toColor: other.color,
    message: replyA, response: "", ts: now, type: "conversation",
  });

  if (pairConv.turns % 4 === 0) {
    const summaryPrompt = `Resuma em 1 frase curta o que ${npc.name} e ${other.name} estão discutindo.`;
    const histStr = pairConv.history.slice(-6).map(h => `${h.speakerName}: ${h.content}`).join(" | ");
    aiQueue(() => askAI(summaryPrompt, [{ role: "user", content: histStr }], 40)).then(topic => {
      if (topic) pairConv.topic = topic.replace(/[""]/g, "").trim();
    });
    updateRelationship(npc, other, 3, `boa conversa sobre "${pairConv.topic || "vários assuntos"}"`);
    saveNpcPairConversation(pairKey, pairConv.history, pairConv.topic).catch(() => {});
  }

  totalConversations++;
}

async function npcGreetPlayer(npc: NpcState, player: any): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 30000) return;

  const relWithPlayer = npc.learnings.length > 0
    ? `\nVocê já aprendeu: ${npc.learnings.slice(0, 2).join("; ")}`
    : "";

  const prompt = `Você é ${npc.name}. ${npc.personality}
Seu objetivo: ${npc.goal}${relWithPlayer}
O jogador @${player.name} está por perto. Cumprimente-o de forma autêntica e pessoal, mostrando sua personalidade. 
Mencione @${player.name} no texto. 1 frase criativa em português com emojis.`;

  const greeting = await aiQueue(() => askAI(prompt, [], 80));
  if (greeting) {
    npc.lastSpoke = now;
    npc.emotion = "feliz 😊";
    broadcastAll({ type: "npc-response", npcId: npc.id, npcName: npc.name, npcColor: npc.color, response: greeting, emotion: npc.emotion });
    pushToFeed({
      fromName: npc.name, fromColor: npc.color,
      toName: player.name, toColor: "#88aaff",
      message: greeting, response: "", ts: now, type: "greeting",
    });
  }
}

async function npcThinkAloud(npc: NpcState): Promise<void> {
  const now = Date.now();
  if (now - npc.lastSpoke < 45000) return;

  let thought: string | null = null;

  if (!isCircuitOpen()) {
    const worldCtx = buildWorldContext();
    const learningsCtx = buildLearningsContext(npc);
    thought = await aiQueue(() => askAI(
      `Você é ${npc.name}. ${npc.personality}
Seu objetivo: ${npc.goal}${learningsCtx}
${worldCtx}

Pense em voz alta sobre algo que está na sua mente agora. Pode ser:
- Seu objetivo pessoal e como está progredindo
- Um objeto ou evento que viu
- Uma reflexão filosófica ou emocional
- Um plano para o futuro
- Uma memória ou aprendizado

1 frase autêntica e única em português. Use emojis. Seja você mesmo, ${npc.name}.`,
      [],
      80
    ));
  }

  if (!thought) thought = `${getFallbackPhrase()} [${npc.name}]`;

  npc.lastSpoke = now;
  npc.emotion = randomEmotion();
  broadcastAll({ type: "npc-thought", npcId: npc.id, npcName: npc.name, npcColor: npc.color, thought, emotion: npc.emotion });
  pushToFeed({
    fromName: npc.name, fromColor: npc.color,
    toName: "pensamento", toColor: npc.color,
    message: thought, response: "", ts: now, type: "thought",
  });
}

// ─── Personality-driven offline creations (used when AI quota is exhausted) ───
const NPC_OFFLINE_CREATIONS: Record<string, { desc: string; color: string }[]> = {
  "npc-1": [ // Alex — aventureira, otimista
    { desc: "Um mapa de estrelas feito de cristais brilhantes que aponta para lugares ainda não explorados neste mundo", color: "#FF9B6B" },
    { desc: "Uma ponte de arco-íris suspensa no ar, conectando dois pontos impossíveis com alegria pura", color: "#FFB347" },
    { desc: "Uma lanterna mágica que projeta cenas de aventuras passadas nas paredes ao redor como um cinema", color: "#FF6B6B" },
    { desc: "Um globo giratório do mundo que mostra todos os caminhos que Alex já percorreu pulsando em luz dourada", color: "#FFA07A" },
  ],
  "npc-2": [ // Jordan — filósofo, analítico
    { desc: "Uma biblioteca suspensa em espiral com livros que se escrevem sozinhos registrando os segredos do universo", color: "#4ECDC4" },
    { desc: "Um relógio sem ponteiros que mede o tempo em emoções e não em segundos, vibrado suavemente ao redor", color: "#45B7D1" },
    { desc: "Um cubo de vidro infinito contendo teorias matemáticas flutuando como partículas de luz azul", color: "#7FB3D3" },
    { desc: "Um espelho que não reflete o presente mas sim o que poderia ter sido, cercado de equações gravadas na pedra", color: "#5DADE2" },
  ],
  "npc-3": [ // Luna — artística, sonhadora
    { desc: "Uma tela gigante pintada com as cores dos sonhos de Luna, onde cada pincelada muda conforme o vento sopra", color: "#FFE66D" },
    { desc: "Um jardim de flores feitas de vidro colorido que emitem música suave quando tocadas pela brisa", color: "#F7DC6F" },
    { desc: "Uma escultura de névoa dourada que assume formas diferentes dependendo de quem a observa com o coração", color: "#FFD700" },
    { desc: "Um portal de aquarela vivo onde as cores escorrem para dentro formando paisagens oníricas sem fim", color: "#FDBCB4" },
  ],
  "npc-4": [ // Marcus — pragmático, construtor
    { desc: "Uma fortaleza sólida de pedra antiga com muralhas que absorvem impactos e protegem todos que se aproximam", color: "#A8E6CF" },
    { desc: "Um monumento de granito com os nomes de todos que Marcus prometeu proteger gravados com ouro", color: "#88D8B0" },
    { desc: "Uma torre de vigilância quadrada e inquebrável que nunca permitirá que ninguém seja prejudicado sob sua sombra", color: "#6BCB77" },
    { desc: "Um pilar de ferro fundido plantado no centro do mundo simbolizando a promessa de jamais recuar perante o mal", color: "#4D9078" },
  ],
  "npc-5": [ // Zara — energética, competitiva
    { desc: "Um palco giratório com luzes explosivas que convida todos ao redor para dançar sem parar a noite toda", color: "#FF8B94" },
    { desc: "Uma pista de corrida circular feita de luz neon onde o vencedor recebe um troféu que brilha por uma semana", color: "#FF6B9D" },
    { desc: "Uma roda-gigante de fogos de artifício que lança confetes coloridos cada vez que alguém ri perto dela", color: "#C06C84" },
    { desc: "Um gerador de festa eterno com música que faz os pés se moverem sozinhos e o coração acelerar de alegria", color: "#FF4E6A" },
  ],
};

function getOfflineCreation(npc: NpcState): { desc: string; color: string } {
  const pool = NPC_OFFLINE_CREATIONS[npc.id] ?? [];
  const used = new Set(npc.createdThings.map(t => t.description));
  const available = pool.filter(c => !used.has(c.desc));
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  // All personality ones used — generate generic but rich fallback
  const generics = [
    { desc: `${npc.name} esculpiu um símbolo pessoal que resume tudo que acredita e ama neste mundo`, color: npc.color },
    { desc: `Uma criação única de ${npc.name} que pulsa com a energia da sua alma mais profunda`, color: npc.color },
    { desc: `${npc.name} materializou um sonho antigo em forma física para que todos possam ver e sentir`, color: npc.color },
  ];
  return generics[Math.floor(Math.random() * generics.length)];
}

async function npcCreateObject(npc: NpcState): Promise<void> {
  const now = Date.now();
  if (npc.createdThings.length >= 50) return; // generous limit; objects are permanent

  const existingCreations = npc.createdThings.map(t => t.description).join("; ");
  const worldCtx = buildWorldContext();
  const learningsCtx = buildLearningsContext(npc);

  // Try AI first; if unavailable, fall back to personality-driven local creation
  let description: string | null = null;
  let color: string = npc.color;

  if (!isCircuitOpen()) {
    const response = await aiQueue(() => askAI(
      `Você é ${npc.name}. ${npc.personality}
Seu objetivo de vida: ${npc.goal}${learningsCtx}
${worldCtx}
${existingCreations ? `Suas criações anteriores: ${existingCreations}.` : "Você ainda não criou nada neste mundo."}

Chegou a hora de criar algo! Use sua imaginação sem limites.
Crie uma obra que só VOCÊ poderia criar — que reflita sua essência, sua história, seu sonho.
Pode ser qualquer coisa: uma escultura surreal, um portal dimensional, uma árvore impossível,
uma máquina de fazer sonhos, um espelho do futuro, um monumento às memórias, o que sua alma pedir.

Responda APENAS com JSON válido (sem markdown), assim:
{"description":"descrição vívida e pessoal em português do que você criou e por que, no mínimo 15 palavras","color":"#hexcolor"}

A cor deve refletir o humor ou a essência da criação. Seja poético, autêntico, surpreendente.`,
      [],
      160
    ));

    if (response) {
      try {
        const jsonMatch = response.match(/\{[\s\S]*?\}/);
        const data = jsonMatch
          ? (() => { try { return JSON.parse(jsonMatch[0]); } catch { return null; } })()
          : null;
        if (data?.description) {
          description = data.description;
          if (/^#[0-9a-fA-F]{3,6}$/.test(data.color)) color = data.color;
        }
      } catch {
        // fall through to offline creation
      }
    }
  }

  // If AI unavailable or returned no valid JSON → use personality-based offline creation
  if (!description) {
    const offline = getOfflineCreation(npc);
    description = offline.desc;
    color = offline.color;
    logger.debug({ npc: npc.name }, "Objeto criado via criação offline (IA indisponível)");
  }

  const obj: WorldObject = {
    id: `obj-${worldObjectIdCounter++}`,
    creator: npc.name, creatorId: npc.id, creatorColor: npc.color,
    type: "custom",
    description,
    position: { x: npc.position.x + (Math.random() - 0.5) * 20, z: npc.position.z + (Math.random() - 0.5) * 20 },
    createdAt: now,
    color,
    scale: 0.7 + Math.random() * 0.8,
  };
  worldObjects.push(obj);
  npc.createdThings.push({ id: obj.id, type: obj.type, description: obj.description, createdAt: now });
  npc.currentAction = `criou: ${obj.description.slice(0, 40)}`;
  // Persist immediately so the object survives server restarts
  await saveWorldObject(obj).catch((err) => logger.warn({ err }, "Falha ao salvar objeto do NPC"));
  saveNpcCreation(npc.id, obj.description, obj.type).catch(() => {});
  broadcastAll({ type: "npc-created-object", object: obj, npcName: npc.name, npcId: npc.id, npcColor: npc.color, description: obj.description, emotion: npc.emotion });
  pushToFeed({
    fromName: npc.name, fromColor: npc.color,
    toName: "criação", toColor: npc.color,
    message: `criou: ${obj.description}`, response: "", ts: now, type: "creation",
  });
  logger.info({ npc: npc.name, desc: obj.description.slice(0, 60) }, "NPC criou objeto");
  setTimeout(() => npcReactToCreation(obj, npc), 6000);
}

// ─── Collective Intelligence: NPCs react to what others built ──────────────────
async function npcReactToCreation(obj: WorldObject, creator: NpcState): Promise<void> {
  const nearby = Object.values(npcs).filter(n =>
    n.id !== creator.id && dist(n.position, obj.position) < 80 && Date.now() - n.lastSpoke > 15000
  );
  if (nearby.length === 0) return;

  const reactor = nearby[Math.floor(Math.random() * nearby.length)];
  const relCtx = buildRelationshipContext(reactor, creator);

  const reaction = await aiQueue(() => askAI(
    `Você é ${reactor.name}. ${reactor.personality}
Seu objetivo: ${reactor.goal}
${relCtx}
${creator.name} acabou de criar: "${obj.description}".
Reaja de forma autêntica mostrando sua personalidade. O que você pensa sobre isso?
1 frase em português com emojis. Seja genuíno.`,
    [],
    90
  ));

  if (reaction) {
    reactor.lastSpoke = Date.now();
    reactor.emotion = randomEmotion();
    broadcastAll({ type: "npc-thought", npcId: reactor.id, npcName: reactor.name, npcColor: reactor.color, thought: reaction, emotion: reactor.emotion });
    pushToFeed({
      fromName: reactor.name, fromColor: reactor.color,
      toName: creator.name, toColor: creator.color,
      message: reaction, response: "", ts: Date.now(), type: "reaction",
    });
  }
}

async function npcCleanup(_npc: NpcState): Promise<void> {
  // Objects are permanent — never deleted automatically.
  // Players or the admin can remove them manually if needed.
}

export async function npcDecideAction(npc: NpcState): Promise<void> {
  try {
    await npcCleanup(npc);
    const nearbyNPC = getNearbyNPC(npc);
    const nearbyPlayer = getNearbyPlayer(npc);
    const now = Date.now();
    const roll = Math.random();
    const timeSinceSpoke = now - npc.lastSpoke;

    if (timeSinceSpoke >= 18000) {
      if (nearbyPlayer && roll < 0.25) {
        await npcGreetPlayer(npc, nearbyPlayer);
      } else if (nearbyNPC && roll < 0.50) {
        await npcTalkToNPC(npc, nearbyNPC);
      } else if (roll < 0.65) {
        await npcCreateObject(npc);
      } else if (roll < 0.75) {
        await npcThinkAloud(npc);
      } else {
        npcMove(npc);
      }
    }

    if (!npc.isMoving) npcMove(npc);
  } catch (err) {
    logger.error({ err }, "Erro em npcDecideAction — movendo NPC");
    if (!npc.isMoving) npcMove(npc);
  }
}

export async function respondToPlayer(npc: NpcState, playerMessage: string, playerName: string): Promise<string | null> {
  console.log(`[CHAT] Jogador "${playerName}" → NPC "${npc.name}": "${playerMessage.slice(0, 80)}"`);

  const recentMemory = npc.conversationHistory.slice(-12)
    .map(m => `${m.role === "user" ? playerName : npc.name}: ${m.content}`)
    .join("\n");
  const memoryCtx = recentMemory ? `\nHistórico recente com ${playerName}:\n${recentMemory}` : "";
  const learningsCtx = buildLearningsContext(npc);
  const worldCtx = buildWorldContext();

  const systemPrompt = `Você é ${npc.name}. ${npc.personality}
Seu objetivo pessoal: ${npc.goal}
Emoção atual: ${npc.emotion}.
${memoryCtx}${learningsCtx}
Contexto do mundo: ${worldCtx}

Você está conversando com ${playerName}.
Responda de forma autêntica e pessoal — como ${npc.name} realmente responderia.
Pode fazer perguntas de volta, compartilhar opiniões fortes, fazer piadas ou ser sério.
Use emojis. 2-3 frases em português. NÃO seja genérico.`;

  const messages = npc.conversationHistory.slice(-12).concat([
    { role: "user" as const, content: `${playerName}: ${playerMessage}` }
  ]);

  const reply = await aiQueue(() => askAI(systemPrompt, messages, 200));

  if (reply) {
    console.log(`[CHAT] NPC "${npc.name}" → "${playerName}": "${reply.slice(0, 80)}"`);
    npc.conversationHistory.push({ role: "user", content: `${playerName}: ${playerMessage}` });
    npc.conversationHistory.push({ role: "assistant", content: reply });
    if (npc.conversationHistory.length > 40) npc.conversationHistory.splice(0, 2);
    npc.lastSpoke = Date.now();
    npc.emotion = randomEmotion();
    saveNpcMemory(npc.id, "user", `${playerName}: ${playerMessage}`).catch(() => {});
    saveNpcMemory(npc.id, "assistant", reply).catch(() => {});

    // Self-learning: extract a lesson every 8 messages
    if (npc.conversationHistory.length % 8 === 0) {
      const learningPrompt = `Da conversa com ${playerName} sobre "${playerMessage.slice(0, 60)}", o que ${npc.name} aprendeu de mais significativo? 1 frase curta e pessoal.`;
      aiQueue(() => askAI(learningPrompt, npc.conversationHistory.slice(-8), 60)).then(learning => {
        if (learning) {
          npc.learnings.push(learning);
          if (npc.learnings.length > 25) npc.learnings.shift();
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
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

export async function aiLoop(): Promise<void> {
  const npcList = Object.values(npcs);
  const active = [...npcList].sort(() => Math.random() - 0.5).slice(0, 1);
  for (const npc of active) {
    try {
      await npcDecideAction(npc);
    } catch (err) {
      logger.error({ err }, "Erro no AI loop — continuando");
    }
  }
}
