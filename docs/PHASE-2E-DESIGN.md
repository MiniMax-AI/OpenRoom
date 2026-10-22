# Phase 2E Design — Bridging the Kayley Brain to Vibe Actions

Based on `PHASE-2E-RECON.md`. Scope: `change_background` as proof-of-concept. Keep all other Vibe flows untouched.

---

## 1. Where to inject the action catalog

**Chosen approach: server-side injection, via MCP tool schema + instructions string.**

Kayley's brain runs inside Claude Code, connected to the websocket-channel MCP server. It does **not** see the browser's IDB; it only sees what MCP tools + the `instructions` string expose. We inject the catalog two ways:

- The new `vibe_action` tool's description lists the v1 allowed `(app_name, action_type, params)` combos. Claude's native tool_use in Opus will key off the schema.
- The server's `instructions` string (already in `server.ts:423-433`) gets a short note: "You have a Vibe-app body (OpenRoom). When Steven asks you to change the background, open an app, or perform a visible action on his desktop, call the `vibe_action` tool. See the tool schema for the available actions."

We deliberately **do not** have the OpenRoom client push its action catalog over the websocket. Reasons:
- The v1 surface is tiny (one action). A hardcoded schema is fine.
- The catalog changes slowly — if we add a new action we add it to the tool schema in one commit.
- Avoids a state-sync race (what if the browser connects mid-turn? what if two browsers connect?).
- Future work (Phase 2F+): if the catalog grows past ~5 actions we can either (a) generate the tool schema at server boot from a static JSON catalog, or (b) have the browser send a `register_actions` message on connect that mutates the server's tool schema. Both deferred.

## 2. Action format for Kayley

**Anthropic-native tool_use.** Kayley runs on Claude Opus — MCP already uses JSON Schema inputSchema for tools, which Opus treats as native `tool_use`. No parsing hacks; no embedded markers in text.

New MCP tool (`plugins/websocket-channel/server.ts`):

```ts
{
  name: 'vibe_action',
  description: [
    "Trigger an action on the OpenRoom/Vibe-apps desktop (Kayley's 'body').",
    "Currently supported: change the desktop background.",
    "  • app_name='os', action_type='SET_WALLPAPER', params='{\"wallpaper_url\":\"<https-or-data-url>\"}'",
    "params MUST be a JSON string (double-encoded). Unknown apps/actions return an error string.",
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      app_name:    { type: 'string', description: 'Target app name (e.g. "os")' },
      action_type: { type: 'string', description: 'Action type (e.g. "SET_WALLPAPER")' },
      params:      { type: 'string', description: 'JSON string of params, e.g. \'{"wallpaper_url":"https://…"}\'' },
    },
    required: ['app_name', 'action_type'],
  },
}
```

This mirrors OpenRoom's own `app_action` tool schema **exactly** so the mental model is identical whether Steven is using Aoi (local LLM) or Kayley (brain). Good for debugging.

## 3. Parsing Kayley's responses on the OpenRoom side

No text parsing. Server broadcasts structured messages:

Server → browser when Kayley calls the tool:
```json
{ "type": "vibe_action",
  "id": "va_<uuid>",
  "app_name": "os",
  "action_type": "SET_WALLPAPER",
  "params": { "wallpaper_url": "https://…" } }
```

Browser → server with the outcome:
```json
{ "type": "vibe_action_result", "id": "va_<uuid>", "result": "success" }
```

Server holds the pending tool-call promise in a `Map<id, { resolve, timeout }>`. On result, resolve with the string; on 15s timeout, resolve with `"timeout: no response from OpenRoom"`. The MCP tool returns that string as `content[0].text`, so Kayley sees it in her next turn.

`useKayleyChannel.ts` adds a new message-type branch:

```ts
if (msg.type === 'vibe_action') {
  void handleVibeAction(msg.id, msg.app_name, msg.action_type, msg.params)
}
```

where `handleVibeAction`:
1. calls `resolveAppAction(app_name, action_type)` from `appRegistry.ts`
2. on error, sends `{ type: 'vibe_action_result', id, result: errorString }`
3. on success, `await dispatchAgentAction({ app_id, action_type, params })` (already handles the OS `SET_WALLPAPER` path end-to-end: writes IDB, fires the `osEventCallbacks` the Shell subscribes to)
4. sends `{ type: 'vibe_action_result', id, result }`

Two consumer contracts we respect:
- `dispatchAgentAction` is already idempotent for OS actions and handles its own timeouts for app actions. Our added 15s outer timeout on the server is a safety net only.
- We don't call `loadActionsFromMeta` here — OS actions don't need the registry for dispatch. If we later expand to per-app actions, we will ensure it's loaded before `handleVibeAction` fires.

## 4. Round-trip state

Server captures the result string and returns it via MCP tool reply — Kayley sees it as a standard tool result. She can then speak conversationally using the `reply` tool as she already does: "Done! Background set to Living Space~". No new plumbing; she already knows how to speak after a tool call.

## 5. First action: `change_background`

Pick: `os.SET_WALLPAPER`. Reasons:
- Steven already verified the full Aoi path works 2026-04-15. Our bridge touches the same `dispatchAgentAction` dispatch, so success = proof the bridge is correctly wired.
- Zero app-mount race conditions — OS actions resolve synchronously inside `dispatchAgentAction`.
- Visible effect — wallpaper changes immediately on the user's screen. Fastest feedback loop for manual testing.

For v1 we won't have Kayley enumerate the 11 wallpapers. She can either:
- Accept any URL Steven passes her ("set my wallpaper to https://…")
- Or use a known Vibe wallpaper URL from the seeded set if she learns them (future).

The v1 acceptance test is: "Kayley, change my background to https://…/some.png" → her brain calls `vibe_action` → wallpaper changes → she replies with a confirmation. That's it.

---

## Implementation surface

### Kayley-Cowork (`kayley-v2e`)
- `plugins/websocket-channel/server.ts`:
  - Add `pendingVibeActions: Map<string, { resolve, timer }>` at module scope.
  - In browser `ws.on('message')` handler, add `if (msg.type === 'vibe_action_result')` branch that resolves the pending entry.
  - Add `vibe_action` entry to `ListToolsRequestSchema` response.
  - Add `vibe_action` branch in `CallToolRequestSchema` handler: generate id, broadcast `{type:'vibe_action', id, app_name, action_type, params}` (params parsed from the JSON string), push into `pendingVibeActions`, await resolution or 15s timeout, return tool text.
  - Add 2 lines to `instructions` string pointing at the tool.

### OpenRoom (`kayley-v2e`)
- `apps/webuiapps/src/hooks/useKayleyChannel.ts`:
  - Add `handleVibeAction` helper that calls `resolveAppAction` + `dispatchAgentAction` from `appRegistry.ts`/`vibeContainerMock.ts` and sends `{ type: 'vibe_action_result', id, result }`.
  - Branch inside `ws.onmessage` for `msg.type === 'vibe_action'`.
  - Ensure `loadActionsFromMeta` and `seedMetaFiles` have been called before the first dispatch (for future app actions). For v1 OS action, not strictly required.

No changes to `ChatPanel` — the bridge is entirely in the hook and the server. ChatPanel keeps rendering Kayley's text reply as-is.

---

## Risk / failure modes

| Risk | Mitigation |
|---|---|
| Kayley calls `vibe_action` when no OpenRoom client is connected | Server replies `"error: no OpenRoom client connected"` if `browserClients.size === 0` at call time. Kayley can fall back to an apology message. |
| Multiple browser clients connected | Broadcast to all; first `vibe_action_result` wins. Rare in dev, documented. |
| 15s timeout | Returns `"timeout: no response from OpenRoom"`. Kayley can retry or explain. |
| `dispatchAgentAction` throws on unknown action_type | Caught in `handleVibeAction`, sends `"error: …"` back. |
| Kayley tries SET_WALLPAPER with a data:image/ URL that is too large | Existing `dispatchAgentAction` writes it to `/wallpaper/state.json`; IDB can handle MBs. Not a v1 concern. |
| Permission prompt fires for MCP tool call | `websocket-channel` server already auto-allows (`server.ts:468-479`). Works out of the box. |
