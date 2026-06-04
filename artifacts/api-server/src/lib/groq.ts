import { logger } from "./logger";

let apiKey = process.env.GROQ_API_KEY?.trim();

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 120
): Promise<string | null> {

  if (!apiKey) {
    logger.warn("GROQ_API_KEY não configurada – respostas de IA desativadas");
    return null;
  }

  try {
    // URL oficial e atualizada para chat completions no OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Este ID é mantido pelo OpenRouter e funciona sempre
        model: "google/gemma-4-31b-it:free",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        max_tokens: Math.min(maxTokens, 300)
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Erro na API do OpenRouter: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content || null;

  } catch (error) {
    logger.error(`Erro ao consultar a IA: ${error}`);
    return null;
  }
}
