---
name: Gemini quota management
description: How to handle Gemini free tier quota exhaustion and circuit breaker pattern used in this project
---

## Rule
Always wrap Gemini AI calls with a circuit breaker. When quota is exhausted (HTTP 429), pause all AI calls for 120 seconds and try alternative models before giving up.

**Why:** Gemini free tier has a daily TPD limit that is hit quickly by an AI game loop running every 15s with 5 NPCs. Without a circuit breaker, the server spams 429s continuously.

**How to apply:**
- `circuitOpen` flag + `circuitOpenAt` timestamp in groq.ts
- `CIRCUIT_COOLDOWN = 120_000` ms before retrying
- Try models in order: gemini-2.0-flash → gemini-2.0-flash-lite → gemini-2.0-flash-exp
- Export `isCircuitOpen()` so world.ts can check before calling AI
- AI loop interval: 15 seconds minimum
- All NPC cooldowns: talk=20s, greet=30s, think=45s

## Valid models on this API key
Only Gemini 2.0 models work — Gemini 1.5 models (`gemini-1.5-flash`, `gemini-1.5-flash-8b`) return 404 on this key.
- ✅ `gemini-2.0-flash` — quota exhausted daily but valid
- ✅ `gemini-2.0-flash-lite` — quota exhausted daily but valid
- ✅ `gemini-2.0-flash-exp` — experimental, may or may not work
- ❌ `gemini-1.5-flash` — 404 not found on this key
- ❌ `gemini-1.5-flash-8b` — 404 not found on this key

## Weather event on connection
When player connects, server sends `currentWeather` in the `init` message. Frontend must apply it immediately so late-joining players see the correct weather/sky state.
