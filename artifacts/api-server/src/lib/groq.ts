import { logger } from "./logger";

const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim();

// Try smaller model first (higher quota), fall back to flash
const MODELS = [
  process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash",
];

// ─── Circuit breaker ───────────────────────────────────────────────────────────
// When quota is hit (429), stop all AI calls for CIRCUIT_COOLDOWN ms.
const CIRCUIT_COOLDOWN = 90_000; // 90 seconds
let circuitOpen = false;
let circuitOpenAt = 0;
let consecutiveFailures = 0;
let currentModelIdx = 0;

function openCircuit() {
  circuitOpen = true;
  circuitOpenAt = Date.now();
  logger.warn(`[Circuit breaker] IA pausada por ${CIRCUIT_COOLDOWN/1000}s devido a erros de quota.`);
}

function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  if (Date.now() - circuitOpenAt > CIRCUIT_COOLDOWN) {
    circuitOpen = false;
    consecutiveFailures = 0;
    logger.info("[Circuit breaker] IA retomada — tentando novamente.");
    return false;
  }
  return true;
}

// ─── Fallback responses when AI is unavailable ────────────────────────────────
const FALLBACK_RESPONSES = [
  "Hmm, estou pensando... 🤔",
  "Que mundo interessante este! ✨",
  "Vou explorar mais por aqui! 🌍",
  "Preciso de um momento para refletir... 💭",
  "Que bom te ver por aqui! 😊",
  "Interessante... muito interessante! 🧐",
];

function getFallback(): string {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 120
): Promise<string | null> {
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY não configurada – usando resposta de fallback");
    return getFallback();
  }

  // Circuit breaker check
  if (isCircuitOpen()) {
    logger.debug("[Circuit breaker] Chamada bloqueada — quota em espera.");
    return null;
  }

  const contents = messages
    .filter(msg => msg.content && msg.content.trim().length > 0)
    .map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content.trim() }]
    }));

  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "Inicie o comportamento do NPC." }]
    });
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: Math.min(maxTokens, 256),
      temperature: 0.75,
    },
    ...(systemPrompt?.trim() ? {
      systemInstruction: { parts: [{ text: systemPrompt.trim() }] }
    } : {}),
  };

  // Try models in order until one works
  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const modelIdx = (currentModelIdx + attempt) % MODELS.length;
    const model = MODELS[modelIdx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          consecutiveFailures = 0;
          currentModelIdx = modelIdx; // Stick with working model
          return text;
        }
        return null;
      }

      const status = response.status;

      // Quota exhausted — try next model, open circuit if all fail
      if (status === 429) {
        logger.warn(`[Gemini] Quota esgotada no modelo ${model} — tentando próximo...`);
        consecutiveFailures++;
        if (attempt === MODELS.length - 1 || consecutiveFailures >= 3) {
          openCircuit();
          return null;
        }
        continue; // try next model
      }

      // Other error
      const errorText = await response.text();
      logger.error(`[Gemini] Erro ${status} no modelo ${model}: ${errorText.slice(0, 200)}`);
      return null;

    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        logger.warn(`[Gemini] Timeout no modelo ${model}`);
      } else {
        logger.error(`[Gemini] Erro de rede: ${err instanceof Error ? err.message : String(err)}`);
      }
      consecutiveFailures++;
      if (consecutiveFailures >= 5) openCircuit();
      return null;
    }
  }

  return null;
}
