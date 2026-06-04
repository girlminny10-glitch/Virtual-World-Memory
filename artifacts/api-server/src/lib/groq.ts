import Groq from "groq-sdk";
import { logger } from "./logger";

let groq: Groq | null = null;

function getGroq(): Groq | null {
  if (groq) return groq;
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    logger.warn("GROQ_API_KEY não configurada — respostas de IA desativadas");
    return null;
  }
  groq = new Groq({ apiKey });
  return groq;
}

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 120
): Promise<string | null> {
  const client = getGroq();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.88,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 429) {
      logger.warn("Groq rate limit — pulando");
    } else if (e?.status === 401) {
      logger.error("GROQ_API_KEY inválida ou expirada");
      groq = null; // reset so it retries on next request
    } else {
      logger.error({ err }, "Groq AI error");
    }
    return null;
  }
}
