---
name: Gemini quota management
description: How to handle Gemini free tier quota exhaustion and circuit breaker pattern used in this project
---

## Rule
Always wrap Gemini AI calls with a circuit breaker. When quota is exhausted (HTTP 429), pause all AI calls for 90 seconds and try alternative models before giving up.

**Why:** Gemini free tier (gemini-2.0-flash) has a daily TPD limit (~1500 RPD) that is hit quickly by an AI game loop running every 2-10 seconds with 5 NPCs. Without a circuit breaker, the server spams 429s continuously and the game loop blocks or crashes.

**How to apply:**
- `circuitOpen` flag + `circuitOpenAt` timestamp in groq.ts
- `CIRCUIT_COOLDOWN = 90_000` ms before retrying
- Try models in order: gemini-2.0-flash-lite → gemini-1.5-flash-8b → gemini-2.0-flash
- `aiQueue` mutex in world.ts prevents concurrent AI calls
- AI loop interval: 10 seconds minimum (not 2.5s)
- All NPC cooldowns: talk=20s, greet=30s, think=45s
