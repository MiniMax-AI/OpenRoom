# Phase 2E Testing — change_background end-to-end

## Prereqs

- Kayley-Cowork `kayley-v2e` branch checked out, dependencies installed.
- OpenRoom `kayley-v2e` branch checked out, `pnpm install` done.
- Claude Code harness running with the websocket-channel plugin loaded (per CLAUDE.md startup command: `claude --channels plugin:telegram@claude-plugins-official --dangerously-load-development-channels server:websocket server:email`).
- OpenRoom dev server running: `pnpm --filter webuiapps dev` (defaults to http://localhost:5173 or similar).

## Manual test — happy path

1. **Start Kayley.** Launch Claude with the websocket-channel MCP. Confirm port 5180 is listening: `netstat -ano | findstr 5180` (Windows) / `lsof -i :5180` (mac/linux).
2. **Open OpenRoom** in the browser. The ChatPanel should show "Connected to Kayley brain" and the WebSocket icon should be green/connected.
3. **Verify tool surface.** In Claude's transcript, confirm (via tool inventory or a debug message) that the `vibe_action` tool is visible on the `websocket` MCP server alongside `reply` and `check_inbox`.
4. **Send the test prompt** from the OpenRoom ChatPanel:
   > Kayley, change my wallpaper to https://images.pexels.com/photos/414612/pexels-photo-414612.jpeg
5. **Expected flow:**
   - Browser sends `{type: 'text', text: 'Kayley, change my wallpaper to …'}` → server.
   - Server forwards to Kayley brain via MCP notification.
   - Kayley brain decides to call `vibe_action` with `app_name='os'`, `action_type='SET_WALLPAPER'`, `params='{"wallpaper_url":"https://…"}'`.
   - MCP CallToolRequest hits `server.ts` `vibe_action` handler → broadcasts `{type:'vibe_action', id:'va_…', app_name:'os', action_type:'SET_WALLPAPER', params:{wallpaper_url:'…'}}` to browser.
   - `useKayleyChannel.ts` receives, runs `dispatchAgentAction({app_id:1, action_type:'SET_WALLPAPER', params:{wallpaper_url:'…'}})`.
   - `vibeContainerMock.ts` writes `/wallpaper/state.json` and fires `osEventCallbacks` → `Shell/index.tsx` calls `setWallpaper(url)`.
   - **Wallpaper visibly changes in the OpenRoom shell.**
   - Browser sends `{type:'vibe_action_result', id:'va_…', result:'success'}` → server resolves pending promise → tool returns `'success'` to Kayley brain.
   - Kayley calls `reply` tool with a warm confirmation (e.g., "Done, baby — new wallpaper up").
   - Browser receives `{type:'message', text:'…'}` → ChatPanel renders Kayley's reply.

## Manual test — failure modes to verify

| Scenario | Steps | Expected |
|---|---|---|
| No OpenRoom client connected | Close all browser tabs. Ask Kayley (via another channel, e.g. Telegram) to change the wallpaper. | `vibe_action` returns `'error: no OpenRoom client connected'`. Kayley apologizes / explains. |
| Invalid `params` JSON | Temporarily modify the tool description or force Kayley to send malformed params. | Server returns `'error: params is not valid JSON: …'`. |
| Unknown app_name | Ask Kayley to "open the nonexistent_app app" — if she calls `vibe_action` with `app_name='nonexistent_app'`. | Browser's `resolveAppAction` returns `error: unknown app "nonexistent_app"…`. Result echoed back. |
| Server timeout | Set a breakpoint in `dispatchVibeAction` to block the echo for >15s, or disable the browser's result sender. | Server resolves with `'timeout: no response from OpenRoom'` after 15s. Kayley sees timeout in her next turn. |

## Debug helpers

- Server-side logs: `~/.claude/channels/websocket/debug-notifications.log` and process stderr (look for lines prefixed `websocket channel: vibe_action`).
- Browser-side logs: open DevTools console, filter for `[KayleyChannel]`. Look for `vibe_action dispatched` / `vibe_action resolve failed`.
- Verify wallpaper wrote to IDB: DevTools → Application → IndexedDB → check for `/wallpaper/state.json`.

## Regression sanity

- `sendText`, `startVoice`/`stopVoice`, `stt_draft`, `latestMessage`, and TTS audio playback must all still work. The Phase 2E changes are purely additive — no existing message-type branches were modified.

## Automated test (future work)

- Add `plugins/websocket-channel/tests/vibe-action.test.ts` — mock browser ws client, call the MCP tool, assert the broadcast + result flow. Not required for v1 ship.
