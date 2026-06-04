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
  if (!client) {
    logger.warn("Groq client não disponível");
    return null;
  }

  try {
    // Add timeout de 15 segundos para evitar travamentos
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Groq request timeout")), 15000)
    );

    const responsePromise = client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: Math.min(maxTokens, 300), // Cap máximo de 300 tokens
      temperature: 0.88,
      top_p: 0.9,
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);
    
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      logger.warn("Resposta vazia do Groq");
      return null;
    }
    
    return content;
  } catch (err: unknown) {
    const error = err as any;
    const errMsg = error?.message || JSON.stringify(error);
    
    if (errMsg.includes("timeout")) {
      logger.warn("Groq request timeout — pulando");
    } else if (error?.status === 429) {
      logger.warn("Groq rate limit — pulando");
    } else if (error?.status === 401) {
      logger.error("GROQ_API_KEY inválida ou expirada");
      groq = null; // reset para retornar próxima vez
    } else if (error?.status === 503) {
      logger.warn("Groq serviço indisponível — tentando novamente depois");
    } else {
      logger.error({ err }, "Groq AI error");
    }
    return null;
  }
}
