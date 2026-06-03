# Virtual World 3D

An AI-powered 3D social simulation browser game where 5 autonomous NPCs powered by Groq LLaMA roam, build, and converse in a shared city world.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/virtual-world run dev` — run the 3D frontend (port 21799)
- `pnpm --filter @workspace/api-server run build` — build API server bundle
- `pnpm run typecheck` — full typecheck across all packages
- Required env: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + WebSocket (`ws`)
- AI: Groq SDK (`llama-3.1-8b-instant`)
- DB: Supabase (memory persistence for NPCs)
- 3D: Three.js (React + Vite frontend)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/lib/world.ts` — NPC state, AI behavior, relationships, world objects
- `artifacts/api-server/src/lib/websocket.ts` — WebSocket message handling
- `artifacts/api-server/src/lib/groq.ts` — Groq AI integration
- `artifacts/api-server/src/lib/supabase.ts` — NPC memory persistence
- `artifacts/virtual-world/src/pages/Game.tsx` — Full 3D game UI (Three.js, all HUD)

## Architecture decisions

- **AI loop runs every 5s** to stay within Groq free-tier TPD limits (500k tokens/day). NPCs pick one action: talk to each other, move, think, or build.
- **WebGL fallback**: graceful message if WebGL unavailable (Replit preview iframe); works in full browser tab.
- **WORLD_SIZE=300** with city blocks spread at realistic distances. Player and NPCs constrained within bounds.
- **NPC relationships** use a -100 to +100 bond score that evolves through conversations, affecting what they say to each other.
- **Drawing canvas TTL = 30 minutes** — canvas auto-clears after 30 mins, NPC drawings broadcast via WebSocket.

## Product

- Name entry screen with male/female character selection (default: Minny, female)
- 5 AI NPCs with distinct personalities, genders, outfits, and relationship webs
- Real-time 3D world with Three.js: buildings, roads, stars, NPCs walking around
- Chat (individual NPC or broadcast to all), conversation feed panel showing live NPC dialogues
- 35 building tools with color picker; objects appear with scale-in animation
- Drawing canvas mode with pen/circle/rect/eraser, 30-min auto-clear, shared across all players
- Mobile support: on-screen joystick, pinch-to-zoom camera, touch drag rotation
- Speech bubbles with emotion emotes above characters; @mention alerts when NPC tags player
- Minimap (bottom right), toast notifications, UI toggle (U key)

## User preferences

- Player default name: Minny, female character
- Game UI in Portuguese (Brazilian)
- NPCs greet player with @name tag when approaching

## Gotchas

- Groq TPD limit hits fast if AI loop runs too often — keep interval ≥ 5s
- WebGL not available in Replit preview iframe; users must open in a real browser tab to play
- Supabase URL must not have `https://` prefix in the env var — the lib auto-adds it
- `broadcastToAllNpcs` and `getRecentConversations` must be exported from world.ts for websocket.ts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
