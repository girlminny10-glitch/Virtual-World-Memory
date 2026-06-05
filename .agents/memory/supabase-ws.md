---
name: Supabase WebSocket transport type fix
description: TypeScript error when passing ws WebSocket class to Supabase realtime transport option
---

## Rule
Cast WebSocket to `any` when passing as Supabase realtime transport to avoid TS2322.

**Why:** `@supabase/supabase-js` declares `transport` as `WebSocketLikeConstructor` which doesn't exactly match the `ws` package's `WebSocket` class signature. The cast is safe at runtime.

**How to apply:**
```typescript
createClient(url, key, { realtime: { transport: WebSocket as any } })
```
Also requires `@types/ws` installed as devDependency.
