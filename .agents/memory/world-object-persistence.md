---
name: World object persistence rules
description: How NPC and player world objects are persisted, restored, and managed across server restarts.
---

# World Object Persistence

## Rules

1. **NPC objects**: saved to DB immediately via `await saveWorldObject(obj)` in `npcCreateObject()` — never use `.catch(() => {})` silently, log the error.
2. **Player objects**: saved to DB via `saveWorldObject(obj)` in the `player-create` WebSocket handler in `websocket.ts`.
3. **No auto-cleanup**: `npcCleanup()` is a no-op — objects are permanent. The old 3-hour TTL was removed.
4. **Restore on startup**: `initWorld()` loops over loaded DB objects and pushes each back into the matching NPC's `createdThings` array, so limits (e.g. `>= 50`) and AI context ("what I've already built") work correctly after restart.
5. **`worldObjectIdCounter`**: set to `max(existing ids) + 1` on startup to avoid ID collisions.

**Why:** User requirement — NPC and player creations must survive server restarts indefinitely. Without restoring `npc.createdThings`, the NPC would not know what it had already built and would keep recreating duplicates.

**How to apply:** Any new code path that creates a world object must call `saveWorldObject()`. Any new code path that deletes a world object must call `deleteWorldObject()`.

## Railway

- Health check endpoint: `/api/healthz` (not `/api/health`)
- Start command: `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build && node --enable-source-maps ./artifacts/api-server/dist/index.mjs`
- Do NOT include `pnpm run typecheck` in the Railway start command — type errors abort the deploy.
- Required env vars on Railway: `PORT`, `DATABASE_URL` (or PGXXX vars), `GEMINI_API_KEY`, `SESSION_SECRET`.
