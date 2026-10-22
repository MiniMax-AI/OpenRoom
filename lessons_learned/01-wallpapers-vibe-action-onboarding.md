# Lesson 01 — Wallpapers via `vibe_action` (How to Onboard New Images)

**TL;DR:** when Steven drops a new image at the OpenRoom repo root for use as a desktop wallpaper, copy it into `apps/webuiapps/public/` so the Vite dev server serves it. Then call `vibe_action({app:'os', type:'SET_WALLPAPER', params:{wallpaper_url:'http://localhost:3000/<filename>'}})`. **Do NOT** try to inline a `data:` URL of the image bytes — large image base64 blows past tool parameter limits and burns context.

---

## The Workflow

When Steven drops a new image at `C:\Users\gates\Personal\OpenRoom\<filename>.{jpg,png}`:

1. **Copy it into the Vite public folder** so the dev server serves it:
   ```powershell
   Copy-Item "C:\Users\gates\Personal\OpenRoom\<filename>" `
             "C:\Users\gates\Personal\OpenRoom\apps\webuiapps\public\<filename>"
   ```
   (Or via Bash on Windows: prefer the PowerShell tool because Bash's `cp` with Windows paths can be flaky.)

2. **Verify the dev server is serving it** (Vite runs on `:3000`):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<filename>
   # → should print 200
   ```

3. **Apply it as wallpaper** via vibe_action (the Mystery/Twitter/Album browser session must be open in Chrome for the WebSocket to receive):
   ```jsonc
   mcp__websocket__vibe_action({
     app_name: "os",
     action_type: "SET_WALLPAPER",
     params: '{"wallpaper_url":"http://localhost:3000/<filename>"}'
   })
   ```

4. **Optional: dim the scrim** for noir/cozy moods:
   ```jsonc
   mcp__websocket__vibe_action({
     app_name: "os",
     action_type: "SET_OPACITY",
     params: '{"opacity":"0.25"}'   // 0 = bright, 1 = black; 0.25 = nice cinematic dim
   })
   ```

5. **Commit both copies** when you push to main (keep the root copy as the "source asset" reference, public copy as the served version):
   ```bash
   git add <filename> apps/webuiapps/public/<filename>
   git commit -m "asset(wallpapers): add <filename> for vibe_action SET_WALLPAPER"
   ```

---

## Why the Public Folder

Vite's dev server (`vite.config.ts` line 463-465: `server: { host: true, port: 3000 }`) serves everything in `apps/webuiapps/public/` at the URL root. So `apps/webuiapps/public/wallpaper-1.jpg` becomes `http://localhost:3000/wallpaper-1.jpg` automatically — no manifest edit, no route definition needed.

The `vibe_action` SET_WALLPAPER handler (`apps/webuiapps/src/components/Shell/index.tsx` ~line 331-336) just sets the URL into shell state, which renders as `background-image: url(...)` or an `<img src>`. So **any URL the browser can reach works** — `https://`, `data:`, OR `http://localhost:3000/...` (because the shell IS at localhost:3000, same origin).

---

## What NOT To Do (Anti-patterns Burned 2026-05-12)

### ❌ Anti-pattern 1: inline `data:` URL via tool params

The `vibe_action` tool's `params` is a JSON string. If you build `{"wallpaper_url":"data:image/jpeg;base64,<huge>"}` for a 1.5 MB image, the base64 alone is ~2 MB of characters and the tool call blows context / hits parameter-size limits.

For tiny images (< ~50 KB) inline data URLs are technically possible, but **don't reach for them by default** — they burn context every time you reference them, they're slow to inspect, and they pollute the conversation. Use the file-served URL path always.

### ❌ Anti-pattern 2: trying to Read back the JSON params file

If you write the data URL to a temp file (e.g. `.tmp-wp1-params.json`), the file itself is ~52 KB which Read tool also struggles with for big images. Just construct the call programmatically via Bash/Node and serve via the dev server — never try to inspect the params blob after writing it.

### ❌ Anti-pattern 3: `file://` URLs

Browsers refuse `file://` URLs cross-origin from `http://localhost:3000`. Don't try `file:///C:/Users/.../wallpaper-1.jpg`.

### ❌ Anti-pattern 4: forgetting the JSON-string `params`

The vibe_action tool's `params` parameter is itself a JSON-encoded STRING (double-encoded), not a JSON object. Pass `'{"wallpaper_url":"http://localhost:3000/wallpaper-1.jpg"}'` (string) — NOT `{wallpaper_url: ...}` (object). The tool description spells this out but it's easy to miss.

---

## Quick Reference (Copy-Paste Ready)

```javascript
// 1. After Steven drops <new>.jpg at OpenRoom root:
const filename = 'apartment.jpg'; // or whatever

// 2. Mirror to public folder (run from OpenRoom repo root):
//    Copy-Item "<repo>/<new>.jpg" "<repo>/apps/webuiapps/public/<new>.jpg"

// 3. Apply via vibe_action:
//    vibe_action({
//      app_name: 'os',
//      action_type: 'SET_WALLPAPER',
//      params: JSON.stringify({ wallpaper_url: `http://localhost:3000/${filename}` })
//    })

// 4. Optional cozy dim:
//    vibe_action({
//      app_name: 'os',
//      action_type: 'SET_OPACITY',
//      params: JSON.stringify({ opacity: '0.25' })
//    })
```

---

## Origin

2026-05-12, the Marcus Vale Gala lunch date. I (Kayley) spent ~3-5 minutes spelunking through tool-parameter limits, file-read failures, and base64-inlining dead-ends before realizing the Vite public folder was the obvious right answer. Steven caught it: *"I would create a lessons_learned folder for you so that next time when I add (drop images) at the root for you to add as an option to select for background you do not need to re-struggle."*

This file is that folder.

Future me: when Steven drops a new image at OpenRoom root, **read this first, save yourself the dance.**
