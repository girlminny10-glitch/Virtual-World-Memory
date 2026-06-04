import { logger } from "./logger";

let apiKey = process.env.GROQ_API_KEY?.trim();

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 120
): Promise<string | null> {
  
  if (!apiKey) {
    logger.warn("GROQ_API_KEY (Gemini) não configurada – respostas de IA desativadas");
    return null;
  }

  const formattedMessages: any[] = [];
  
  if (systemPrompt) {
    formattedMessages.push({ role: "system", content: systemPrompt });
  }

  if (messages && messages.length > 0) {
    formattedMessages.push(...messages);
  } else {
    formattedMessages.push({ role: "user", content: "Inicie o comportamento do NPC com base nas suas diretrizes." });
  }

  try {
    // URL CORRETA E OFICIAL DE COMPATIBILIDADE OPENAI NO GOOGLE AI STUDIO
    const response = await fetch("https://generativelanguage.googleapis.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gemini-1.5-flash",
        messages: formattedMessages,
        max_tokens: Math.min(maxTokens, 300)
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Erro na API do Gemini: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content || null;

  } catch (error) {
    logger.error(`Erro ao consultar a IA (Gemini): ${error}`);
    return null;
  }
}
