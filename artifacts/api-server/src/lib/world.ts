import { askAI } from "./groq";
import { saveNpcMemory, loadNpcMemory, saveNpcCreation } from "./supabase";
import { logger } from "./logger";

export const WORLD_SIZE = 120;

export interface Position {
  x: number;
  z: number;
}

export interface NpcState {
  id: string;
  name: string;
  color: string;
  position: Position;
  emotion: string;
  personality: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  isMoving: boolean;
  targetPosition: Position | null;
  currentAction: string;
  createdThings: string[];
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
}

export interface PlayerState {
  id: string;
  name: string;
  position: Position;
}

export const npcs: Record<string, NpcState> = {
  "npc-1":  { id: "npc-1",  name: "Alex",   color: "#FF6B6B", position: { x: 15,  z: 15  }, emotion: "feliz",      personality: "Otimista, amigável e aventureiro.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "explorando", createdThings: [] },
  "npc-2":  { id: "npc-2",  name: "Jordan", color: "#4ECDC4", position: { x: -20, z: 10  }, emotion: "pensativo",  personality: "Inteligente, analítico e misterioso.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando", createdThings: [] },
  "npc-3":  { id: "npc-3",  name: "Luna",   color: "#FFE66D", position: { x: 30,  z: -25 }, emotion: "criativo",   personality: "Artística, sonhadora e criativa.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "pintando", createdThings: [] },
  "npc-4":  { id: "npc-4",  name: "Marcus", color: "#A8E6CF", position: { x: -35, z: -20 }, emotion: "sério",      personality: "Sério, lógico e disciplinado.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "construindo", createdThings: [] },
  "npc-5":  { id: "npc-5",  name: "Zara",   color: "#FF8B94", position: { x: 45,  z: 25  }, emotion: "animado",    personality: "Energética e competitiva.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "treinando", createdThings: [] },
  "npc-6":  { id: "npc-6",  name: "Kai",    color: "#B8B8FF", position: { x: -45, z: 35  }, emotion: "calmo",      personality: "Calmo, sábio e contemplativo.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "observando", createdThings: [] },
  "npc-7":  { id: "npc-7",  name: "Ivy",    color: "#FFDAC1", position: { x: 55,  z: -35 }, emotion: "misterioso", personality: "Misteriosa e enigmática.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "escrevendo", createdThings: [] },
  "npc-8":  { id: "npc-8",  name: "Dante",  color: "#E2F0CB", position: { x: -55, z: -45 }, emotion: "apaixonado", personality: "Apaixonado e expressivo.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "compondo", createdThings: [] },
  "npc-9":  { id: "npc-9",  name: "Aria",   color: "#FF9FF3", position: { x: 10,  z: -50 }, emotion: "alegre",     personality: "Musical e vibrante.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "cantando", createdThings: [] },
  "npc-10": { id: "npc-10", name: "Leo",    color: "#FECA57", position: { x: -10, z: 50  }, emotion: "corajoso",   personality: "Líder nato e protetor.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "patrulhando", createdThings: [] },
  "npc-11": { id: "npc-11", name: "Mya",    color: "#48DBFB", position: { x: 60,  z: 10  }, emotion: "curiosa",    personality: "Curiosa e rápida.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "correndo", createdThings: [] },
  "npc-12": { id: "npc-12", name: "Rex",    color: "#1DD1A1", position: { x: -60, z: -10 }, emotion: "firme",      personality: "Robusto e prático.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "minerando", createdThings: [] },
  "npc-13": { id: "npc-13", name: "Zoe",    color: "#FF6B6B", position: { x: 25,  z: 40  }, emotion: "gentil",     personality: "Amável e prestativa.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "ajudando", createdThings: [] },
  "npc-14": { id: "npc-14", name: "Finn",   color: "#54A0FF", position: { x: -25, z: -40 }, emotion: "ágil",       personality: "Brincalhão e veloz.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "saltando", createdThings: [] },
  "npc-15": { id: "npc-15", name: "Lia",    color: "#5F27CD", position: { x: 40,  z: -60 }, emotion: "mística",    personality: "Espiritual e profunda.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "meditando", createdThings: [] },
  "npc-16": { id: "npc-16", name: "Hugo",   color: "#EE5253", position: { x: -40, z: 60  }, emotion: "forte",      personality: "Trabalhador e resiliente.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "carregando pedras", createdThings: [] },
  "npc-17": { id: "npc-17", name: "Sola",   color: "#F368E0", position: { x: 0,   z: 0   }, emotion: "radiante",   personality: "Solar e positiva.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "dançando", createdThings: [] },
  "npc-18": { id: "npc-18", name: "Nox",    color: "#8395a7", position: { x: 70,  z: 70  }, emotion: "sombrio",    personality: "Noturno e silencioso.", conversationHistory: [], isMoving: false, targetPosition: null, currentAction: "espreitando", createdThings: [] },
};

export const players: Record<string, PlayerState> = {};
export const worldObjects: WorldObject[] = [];
export let worldObjectIdCounter = 1;
export let totalConversations = 0;

const EMOTIONS = ["feliz", "pensativo", "animado", "calmo", "curioso", "surpreso", "misterioso", "criativo", "sério", "apaixonado"];

function randomPos(): Position {
  return {
    x: (Math.random() - 0.5) * WORLD_SIZE,
    z: (Math.random() - 0.5) * WORLD_SIZE,
  };
}

function dist(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

function getNearbyNPC(npc: NpcState): NpcState | null {
  let closest: NpcState | null = null;
  let minDist = Infinity;
  for (const other of Object.values(npcs)) {
    if (other.id === npc.id) continue;
    const d = dist(npc.position, other.position);
    if (d < 20 && d < minDist) {
      minDist = d;
      closest = other;
    }
  }
  return closest;
}

function getNearbyPlayer(npc: NpcState): PlayerState | null {
  for (const player of Object.values(players)) {
    if (dist(npc.position, player.position) < 15) return player;
  }
  return null;
}

type BroadcastFn = (data: unknown) => void;
let broadcastFn: BroadcastFn = () => {};

export function setBroadcast(fn: BroadcastFn): void {
  broadcastFn = fn;
}

function broadcastAll(data: unknown): void {
  broadcastFn(data);
}

export function npcMove(npc: NpcState): void {
  const target = randomPos();
  npc.targetPosition = target;
  npc.isMoving = true;
  const actions = [
    "caminhando pela cidade", "explorando novos lugares", "procurando algo interessante",
    "passeando", "indo visitar alguém", "voltando para casa", "observando a cidade",
  ];
  npc.currentAction = actions[Math.floor(Math.random() * actions.length)];

  broadcastAll({
    type: "npc-move",
    npcId: npc.id,
    position: npc.position,
    targetPosition: target,
    currentAction: npc.currentAction,
    emotion: npc.emotion,
  });

  const d = dist(npc.position, target);
  const speed = 8;
  const time = Math.max(1000, (d / speed) * 1000);

  setTimeout(() => {
    npc.position = { ...target };
    npc.isMoving = false;
    broadcastAll({ type: "npc-arrived", npcId: npc.id, position: npc.position });
  }, time);
}

async function npcTalkToNPC(npc: NpcState, other: NpcState): Promise<void> {
  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}
Você está no mundo virtual e encontrou ${other.name} (personalidade: ${other.personality}).
Diga algo curto e interessante para ${other.name}. Máximo 2 frases. Seja natural e em português.
Seu estado emocional atual: ${npc.emotion}.`;

  const message = await askAI(systemPrompt, [{ role: "user", content: `Diga algo para ${other.name} agora.` }]);
  if (!message) return;

  const responsePrompt = `Você é ${other.name}. Personalidade: ${other.personality}
${npc.name} disse para você: "${message}"
Responda de forma natural e curta (máximo 2 frases) em português.`;

  const response = await askAI(responsePrompt, [{ role: "user", content: message }]);

  npc.emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
  other.emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
  totalConversations++;

  broadcastAll({
    type: "npc-conversation",
    from: npc.name, fromId: npc.id, fromColor: npc.color,
    to: other.name, toId: other.id, toColor: other.color,
    message, response: response ?? "...",
    fromEmotion: npc.emotion, toEmotion: other.emotion,
    position: npc.position,
  });

  npc.currentAction = `conversando com ${other.name}`;
  other.currentAction = `conversando com ${npc.name}`;
}

async function npcTalkToPlayer(npc: NpcState, player: PlayerState): Promise<void> {
  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}
Você encontrou um jogador humano (${player.name}) no mundo virtual. Diga algo interessante e acolhedor.
Máximo 2 frases em português. Seja carismático.`;

  const message = await askAI(systemPrompt, [{ role: "user", content: "Cumprimente o jogador." }]);
  if (!message) return;

  npc.emotion = "animado";
  broadcastAll({
    type: "npc-greet-player",
    npcId: npc.id, npcName: npc.name, npcColor: npc.color,
    message, emotion: npc.emotion, position: npc.position,
  });
  npc.currentAction = "conversando com o jogador";
}

async function npcCreateObject(npc: NpcState): Promise<void> {
  const systemPrompt = `Você é ${npc.name}. Personalidade: ${npc.personality}
Você vai criar uma estrutura no mundo virtual 3D. Escolha um tipo: 'house', 'tower', 'monument', 'garden', ou 'fountain'.
Descreva em UMA frase curta o que você está criando. Ex: "construiu uma casa de madeira aconchegante".
Responda em formato JSON: {"type": "house|tower|monument|garden|fountain", "description": "sua descrição"}`;

  const response = await askAI(systemPrompt, [{ role: "user", content: "O que você vai construir agora?" }], 100);

  let data: { type: string; description: string };
  try {
    const cleaned = (response ?? "").replace(/```json|```/g, "").trim();
    data = JSON.parse(cleaned);
  } catch {
    data = { type: "monument", description: response ?? "criou algo novo" };
  }

  const obj: WorldObject = {
    id: `obj-${worldObjectIdCounter++}`,
    creator: npc.name,
    creatorId: npc.id,
    creatorColor: npc.color,
    type: data.type,
    description: data.description,
    position: {
      x: npc.position.x + (Math.random() - 0.5) * 8,
      z: npc.position.z + (Math.random() - 0.5) * 8,
    },
    createdAt: Date.now(),
  };

  worldObjects.push(obj);
  if (worldObjects.length > 150) worldObjects.shift();

  npc.createdThings.push(data.description);
  npc.currentAction = data.description;
  npc.emotion = "criativo";

  await saveNpcCreation(npc.id, data.description, data.type);

  broadcastAll({
    type: "npc-created-object",
    object: obj,
    npcName: npc.name, npcId: npc.id, npcColor: npc.color,
    emotion: npc.emotion,
  });
}

export async function npcDecideAction(npc: NpcState): Promise<void> {
  const nearbyNPC = getNearbyNPC(npc);
  const nearbyPlayer = getNearbyPlayer(npc);

  if (Math.random() < 0.12) {
    await npcCreateObject(npc);
    return;
  }
  if (nearbyPlayer && Math.random() < 0.3) {
    await npcTalkToPlayer(npc, nearbyPlayer);
    return;
  }
  if (nearbyNPC && Math.random() < 0.4) {
    await npcTalkToNPC(npc, nearbyNPC);
    return;
  }
  npcMove(npc);
}

export async function respondToPlayer(
  npc: NpcState,
  playerMessage: string
): Promise<string | null> {
  const history = await loadNpcMemory(npc.id, 20);

  const combined = [...history, ...npc.conversationHistory.slice(-10)];

  const systemPrompt = `Você é ${npc.name} em um mundo virtual 3D. Personalidade: ${npc.personality}
Responda ao jogador de forma natural, interessante e em português. Máximo 3 frases.
Seu estado emocional: ${npc.emotion}. Você está atualmente: ${npc.currentAction}.
Você tem memórias de conversas anteriores. Use-as para ser consistente.`;

  combined.push({ role: "user", content: playerMessage });
  const reply = await askAI(systemPrompt, combined);

  if (reply) {
    npc.conversationHistory.push({ role: "user", content: playerMessage });
    npc.conversationHistory.push({ role: "assistant", content: reply });
    if (npc.conversationHistory.length > 30) npc.conversationHistory.splice(0, 2);

    await saveNpcMemory(npc.id, "user", playerMessage);
    await saveNpcMemory(npc.id, "assistant", reply);
    totalConversations++;

    npc.emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
  }

  return reply;
}

export async function aiLoop(): Promise<void> {
  const npcList = Object.values(npcs);
  const shuffled = [...npcList].sort(() => Math.random() - 0.5);
  const active = shuffled.slice(0, Math.floor(Math.random() * 2) + 2);

  for (const npc of active) {
    await npcDecideAction(npc);
    await new Promise((r) => setTimeout(r, 500));
  }
}
