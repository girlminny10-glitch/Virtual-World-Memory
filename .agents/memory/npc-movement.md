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
// WRONG — do NOT do this:
// n.group.position.set(...); n.state.targetPos = undefined;
```

Lerp speed in animate loop: `const move = Math.min(10 * dt, dd);` — snap when `dd < 0.3`.
