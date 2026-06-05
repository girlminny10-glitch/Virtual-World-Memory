---
name: NPC smooth movement (lerp, no teleport)
description: How NPC movement works between server (world.ts) and frontend (Game.tsx) without the disappearing bug
---

## Rule
The `npc-arrived` WebSocket message must NOT call `group.position.set()` (teleport). It should only update `state.targetPos` so the lerp animation completes naturally.

**Why:** The server schedules `npc-arrived` based on estimated travel time at 8 units/sec. The frontend lerps at 10 units/sec. If `npc-arrived` fires before lerp finishes and teleports the NPC, it visually "disappears" or pops to the destination — especially jarring when an NPC is approaching the player.

**How to apply:**
```typescript
// CORRECT npc-arrived handler:
case "npc-arrived": {
  const n = npcsR.current[d.npcId as string];
  if (n && d.position) { n.state.targetPos = d.position as Pos; }
  break;
}
```

## Rule: NPCs must always move regardless of AI status
Add a DEDICATED movement ticker in index.ts, SEPARATE from the AI loop. The AI loop only handles dialogue/creation — movement must be independent.

**Why:** When Gemini quota is exhausted, the circuit breaker blocks all AI calls. Without a separate mover, NPCs freeze completely.

**How to apply (in index.ts):**
```typescript
let moveIdx = 0;
setInterval(() => {
  const npcList = Object.values(npcs);
  if (!npcList.length) return;
  const npc = npcList[moveIdx++ % npcList.length];
  if (!npc.isMoving) npcMove(npc);
}, 12_000); // one NPC per 12s = all 5 NPCs move within 60s
```

Also in `npcDecideAction`, always call `npcMove` AFTER AI actions (don't return early):
```typescript
// Try AI action ...
// ALWAYS move after
if (!npc.isMoving) npcMove(npc);
```

## Rule: Fallback phrases for NPC speech
When `isCircuitOpen()` returns true, skip the AI call and use a predefined phrase from `getFallbackPhrase()`. Keeps NPCs "alive" even with no quota.
