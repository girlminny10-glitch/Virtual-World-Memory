import Groq from "groq-sdk";
import { logger } from "./logger";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function askAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 150
): Promise<string | null> {
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.85,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error({ err }, "Groq AI error");
    return null;
  }
}
