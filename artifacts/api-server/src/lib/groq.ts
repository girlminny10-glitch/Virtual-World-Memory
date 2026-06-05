import { logger } from "./logger";

const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim();

// Gemini models to try in order — only 2.0 models work with this key
const MODELS = [
  process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-exp",
];

// ─── Circuit breaker ───────────────────────────────────────────────────────────
// When quota is hit (429), stop all AI calls for CIRCUIT_COOLDOWN ms.
const CIRCUIT_COOLDOWN = 120_000; // 2 minutes
let circuitOpen = false;
let circuitOpenAt = 0;
let consecutiveFailures = 0;
let currentModelIdx = 0;

function openCircuit() {
  if (circuitOpen) return; // already open
  circuitOpen = true;
  circuitOpenAt = Date.now();
  logger.warn(`[Circuit breaker] IA pausada por ${CIRCUIT_COOLDOWN / 1000}s — quota esgotada.`);
}

export function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  if (Date.now() - circuitOpenAt > CIRCUIT_COOLDOWN) {
    circuitOpen = false;
    consecutiveFailures = 0;
    logger.info("[Circuit breaker] IA retomada — tentando novamente.");
    return false;
  }
  return true;
}

// ─── Predefined NPC actions for when AI is unavailable ─────────────────────────
const FALLBACK_PHRASES = [
  "Que lugar incrível! ✨",
  "Preciso explorar mais por aqui! 🌍",
  "Hmm, algo interessante por aí... 🤔",
  "Que bom ter você por perto! 😊",
  "Estou observando o mundo ao redor... 💭",
  "Este mundo muda a cada dia! 🌟",
  "Vou ver o que tem além daquelas construções! 🏙️",
  "Incrível como este lugar cresce! 🌱",
  "Sinto que algo especial vai acontecer... 🔮",
  "Adoro este lugar! ❤️",
];

export function getFallbackPhrase(): string {
  return FALLBACK_PHRASES[Math.floor(Math.random() * FALLBACK_PHRASES.length)];
}

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 120
): Promise<string | null> {
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY não configurada");
    return null;
  }

  // Circuit breaker check
  if (isCircuitOpen()) {
    return null;
  }

  const contents = messages
    .filter(msg => msg.content && msg.content.trim().length > 0)
    .map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content.trim() }],
    }));

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Inicie o comportamento do NPC." }] });
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: Math.min(maxTokens, 300),
      temperature: 0.75,
      topP: 0.9,
    },
    ...(systemPrompt?.trim()
      ? { systemInstruction: { parts: [{ text: systemPrompt.trim() }] } }
      : {}),
  };

  // Try models in round-robin order until one works
  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const modelIdx = (currentModelIdx + attempt) % MODELS.length;
    const model = MODELS[modelIdx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          consecutiveFailures = 0;
          currentModelIdx = modelIdx;
          return text;
        }
        return null;
      }

      const status = response.status;

      if (status === 429) {
        logger.warn(`[Gemini] Quota esgotada no modelo ${model}`);
        consecutiveFailures++;
        // Try next model
        continue;
      }

      if (status === 401) {
        logger.error(`[Gemini] Token inválido (401) — verifique GEMINI_API_KEY`);
        consecutiveFailures = 0;
        return null;
      }

      if (status === 503) {
        logger.warn(`[Gemini] Serviço indisponível (503) no modelo ${model} — tentando próximo`);
        consecutiveFailures++;
        continue;
      }

      if (status === 404) {
        logger.warn(`[Gemini] Modelo ${model} não encontrado — removendo da lista`);
        // Skip this model permanently by advancing index
        currentModelIdx = (modelIdx + 1) % MODELS.length;
        continue;
      }

      // Other errors
      logger.error(`[Gemini] Erro ${status} no modelo ${model}`);
      return null;

    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        logger.warn(`[Gemini] Timeout no modelo ${model}`);
      } else {
        logger.error(`[Gemini] Erro de rede: ${err instanceof Error ? err.message : String(err)}`);
      }
      consecutiveFailures++;
    }
  }

  // All models failed — open circuit if too many failures
  if (consecutiveFailures >= 2) {
    openCircuit();
  }
  return null;
}
