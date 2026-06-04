import { logger } from "./logger";

const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 120
): Promise<string | null> {
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY não configurada – respostas de IA desativadas");
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
      parts: [{ text: "Inicie o comportamento do NPC com base nas suas diretrizes." }]
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: Math.min(maxTokens, 300),
        temperature: 0.7
      }
    };

    if (systemPrompt && systemPrompt.trim().length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt.trim() }]
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Erro na API do Gemini: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as any;
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return aiResponse?.trim() || null;
  } catch (error) {
    logger.error(`Erro ao consultar a IA Gemini: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
