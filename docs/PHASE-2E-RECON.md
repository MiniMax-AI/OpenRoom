# Phase 2E Recon — Aoi's Action Protocol

Recon date: 2026-04-15. Repo state: OpenRoom `main` at 3096eb0. Goal: document exactly how Aoi (the in-app local LLM) discovers and dispatches Vibe app actions so that we can bridge the Kayley brain (Claude Opus over the websocket-channel MCP server) into the same dispatch pipeline.

---

## 1. Where the action catalog is defined

### Per-app actions — `meta.yaml`
Each Vibe app ships a `meta.yaml` under its locale directory (e.g. `src/pages/Album/album_en/meta.yaml`). The schema used by OpenRoom's parser (`src/lib/appRegistry.ts`) is:

```yaml
app_id: 8
app_name: album
app_display_name: Album
version: "1.0.0"
description: >
  ...
displayDesc: >
  ...

actions:
  - type: REFRESH                       # action name
    name: Refresh Album                 # human label (unused by LLM)
    description: >                      # multi-line description fed to LLM
      After the Agent has added or deleted image files...
    params: []                          # empty = no params
```

Param shape (from `parseParamsList` in `appRegistry.ts:346-398`):

```yaml
    params:
      - name: track_id
        type: string
        description: Track identifier
        required: true
        enum: [one, two, three]         # optional
```

At boot, `seedMetaFiles()` (`src/lib/seedMeta.ts`) uses Vite's `import.meta.glob` to inline every `*_en/meta.yaml` as a string, then writes them into IDB disk storage under `apps/{appName}/meta.yaml` so the LLM can `file_read` them at runtime.

### OS-level actions — hardcoded in `appRegistry.ts`
OS (`app_id: 1`, `app_name: "os"`) has three built-in actions declared in `OS_ACTIONS` at `src/lib/appRegistry.ts:174-208`:

| type | params | effect |
|---|---|---|
| `OPEN_APP` | `{ app_id: string }` | `openWindow(appId)` |
| `CLOSE_APP` | `{ app_id: string }` | `closeWindow(appId)` |
| `SET_WALLPAPER` | `{ wallpaper_url: string }` (https URL or data URL) | writes `/wallpaper/state.json` and fires a `SET_WALLPAPER` OS event consumed by `components/Shell/index.tsx:297` |

The wallpaper listing Aoi recites to Steven ("1. Flow, 2. Factory, … 11. Electric Dreamscape") is **not hardcoded anywhere in code**. Aoi discovers it at runtime by reading files under a wallpapers directory in IDB storage via `file_list`/`file_read`. For Phase 2E's proof of concept the Kayley brain does not need to replicate that browsing step — it can pass any URL through `SET_WALLPAPER`.

---

## 2. How the in-app LLM receives the action catalog

Trace: `components/ChatPanel/index.tsx:820` → `runConversation`.

1. `await seedMetaFiles()` — writes all meta.yaml into IDB.
2. `await loadActionsFromMeta()` — parses them into `APP_REGISTRY`.
3. `const tools = [ respond_to_user, finish_target, list_apps, app_action, ...file tools, ...memory tools, (image_gen) ]` — tool definitions are assembled per turn (lines 827-835).
4. The system prompt (`buildSystemPrompt`, `ChatPanel/index.tsx:180`) teaches the LLM the mandatory workflow:

   > 1. `list_apps` — discover available apps
   > 2. `file_read("apps/{appName}/meta.yaml")` — learn the target app's available actions
   > 3. `file_read("apps/{appName}/guide.md")` — learn its data structure
   > 4. `file_list/file_read` — explore data under `apps/{appName}/data/`
   > 5. `file_write/file_delete` — mutate data
   > 6. `app_action` — notify the app to reload

5. The LLM is told OS actions use `app_name="os"` and are `OPEN_APP`, `CLOSE_APP`, `SET_WALLPAPER` (both in the `app_action` tool description at `appRegistry.ts:462-464` and in `executeListApps()` output at `appRegistry.ts:527-531`).

So the LLM does not receive the catalog as a single upfront blob — it **discovers** it: first through `list_apps`, then by reading each app's `meta.yaml` on demand. The tool surface exposed to the LLM is a small generic set (`list_apps`, `app_action`, file tools), and the per-app action detail lives in IDB-backed files.

---

## 3. Action call format from the LLM

Standard OpenAI/Anthropic **function tool_calls**. Both providers are supported in `src/lib/llmClient.ts`:

- OpenAI-style: `response.choices[0].message.tool_calls[i].function = { name, arguments }` (parsed at lines 204-272).
- Anthropic-style: `content` blocks with `type: "tool_use"` → normalized to the same `ToolCall` shape (lines 284-393). Anthropic tools are declared as `{ name, description, input_schema }` with `input_schema` being the same JSON Schema as OpenAI's `parameters` (line 314-322).

The `app_action` tool (`appRegistry.ts:450-485`) is a single generic function:

```ts
{
  name: 'app_action',
  description: "Trigger an action on an app. ...",
  parameters: {
    type: 'object',
    properties: {
      app_name:    { type: 'string', description: "The appName of the target app (from list_apps)" },
      action_type: { type: 'string', description: "The action type to trigger (e.g. REFRESH_TRACKS, SYNC_STATE, OPEN_APP)" },
      params:      { type: 'string', description: "JSON string of action parameters, e.g. '{\"trackId\":\"123\"}'" }
    },
    required: ['app_name', 'action_type']
  }
}
```

So when Aoi changes the background, her tool_call looks like:

```json
{
  "name": "app_action",
  "arguments": "{\"app_name\":\"os\",\"action_type\":\"SET_WALLPAPER\",\"params\":\"{\\\"wallpaper_url\\\":\\\"https://…/living-space.mp4\\\"}\"}"
}
```

Note the **double-encoding**: `params` is itself a JSON **string**, not an object. This is intentional (simplifies the schema) and is how the dispatch layer parses it back out.

---

## 4. Dispatch layer

`ChatPanel/index.tsx:1047-1085`:

```ts
if (tc.function.name === 'app_action') {
  const strParams = params as Record<string, string>;
  const resolved = resolveAppAction(strParams.app_name, strParams.action_type);
  //   → { appId, actionType } or "error: unknown app …"

  let actionParams: Record<string, string> = {};
  if (strParams.params) {
    try { actionParams = JSON.parse(strParams.params); } catch {}
  }

  const result = await dispatchAgentAction({
    app_id: resolved.appId,
    action_type: resolved.actionType,
    params: actionParams,
  });
  // result is a string, e.g. "success" / "timeout: no response from app" / "error: …"

  currentMessages.push({ role: 'tool', content: result, tool_call_id: tc.id });
}
```

`dispatchAgentAction` lives in `src/lib/vibeContainerMock.ts:127-246`:

- **OS actions** (`app_id === 1`) are handled inline (lines 134-163):
  - `OPEN_APP`: `openWindow(targetAppId)`
  - `CLOSE_APP`: `closeWindow(targetAppId)`
  - `SET_WALLPAPER`: writes `/wallpaper/state.json` into IDB, fires `osEventCallbacks(... type: "SET_WALLPAPER" ...)`. `Shell/index.tsx:297` listens and calls `setWallpaper(url)`.
- **App actions** (`app_id !== 1`): if the target app isn't open, open it. Post an `app_action` message via `agentMessageCallbacks` (each mounted Vibe app has a listener registered through `mockManager.onAgentMessage`). The app runs its handler and calls `mockManager.sendAgentMessage({ action_result, app_action: { action_id } })`, which this function correlates by `action_id` to resolve the promise.

---

## 5. Sync vs async, round-trip state

**Async with timeout.** The LLM turn waits for the dispatch promise to resolve before appending the tool result and invoking the next chat turn:

- OS actions resolve synchronously with `'success'`.
- App actions get 10s (listener already registered) or 20s (waiting for listener) before resolving `'timeout: no response from app'`.
- The resolved string is appended to `currentMessages` as `{ role: 'tool', content: result, tool_call_id: tc.id }` (`ChatPanel/index.tsx:1076-1080`) and `runConversation` loops — the LLM sees the result and can speak about it in its next turn (up to 10 iterations).

### User actions the other direction
`components/ChatPanel/index.tsx:721-748` listens to `onUserAction`: when the human performs something inside a Vibe app, the app calls `mockManager.sendAgentMessage({ app_action: { app_id, action_type, params, trigger_by: 1 } })`. The ChatPanel pushes `"[User performed action in {displayName} (appName: {appName})] action_type: …, params: …"` as a synthetic user message and re-runs the conversation. The LLM can then decide whether to respond (e.g. Gomoku responding to a move).

**Relevance for Phase 2E:** we will replicate the **Agent → App** path first (Kayley brain emits `app_action`, we dispatch via `dispatchAgentAction`, we return the result string back through the channel). The **App → Agent** path is out of scope for v1; Kayley doesn't need to react to user actions in Vibe apps yet.

---

## 6. Current Kayley channel wiring

`apps/webuiapps/src/hooks/useKayleyChannel.ts` connects to `ws://localhost:5180` (the Kayley-Cowork `plugins/websocket-channel/server.ts`). Messages in both directions:

Browser → server:
- `{ type: 'text', text, mid }` — forwarded to Claude via `mcp.notification('notifications/claude/channel')`
- `{ type: 'audio', data }` / `{ type: 'start_voice' }` / `{ type: 'stop_voice' }` — STT pipeline
- `{ type: 'image' | 'image_upload' }` — image relay / uploads

Server → browser:
- `{ type: 'message', text }` — Kayley's text reply
- `{ type: 'audio', data }` — TTS PCM chunks
- `{ type: 'stt_draft', text }` — Whisper transcription for confirmation
- `{ type: 'image', role, src, fileName }` — Kayley-attached image
- `{ type: 'permission_request', ... }` — MCP permission approval

Kayley's tools (in `server.ts:482-510`): `reply`, `check_inbox`. The `reply` tool is what turns Kayley's MCP output into a `{type: 'message', text}` broadcast to the browser.

ChatPanel wiring (`ChatPanel/index.tsx:472-677`): when connected, `sendMessage` calls `kayley.sendText(...)` instead of the local LLM. Kayley's reply arrives via `kayley.latestMessage` and is rendered as a plain assistant message — **no tool-call plumbing exists**. That's the gap Phase 2E fills.

---

## Summary — what has to change

1. **Server side (`plugins/websocket-channel/server.ts`):** expose a new `vibe_action` MCP tool that Kayley can call (alongside `reply`). When called, broadcast `{ type: 'vibe_action', app_name, action_type, params }` to the browser and resolve after a configurable timeout with the browser's response echo.
2. **Browser side (`useKayleyChannel.ts`):** accept `vibe_action` messages, run them through `resolveAppAction` + `dispatchAgentAction`, and send back `{ type: 'vibe_action_result', id, result }`.
3. **System prompt:** teach Kayley the catalog. Keep it light for v1: just the `os.SET_WALLPAPER` action plus a note that more will be added.
4. **UX:** surface "Actions taken" the way the local LLM does — nice-to-have, not blocking.

That is the full surface area. Design doc next.
