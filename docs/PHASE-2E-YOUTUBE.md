# Phase 2E — YouTube Vibe App

Phase 2E extends the `vibe_action` bridge from wallpaper-only (Phase 1) to
driving the new **YouTube** Vibe app. Kayley can search YouTube in natural
language, the OpenRoom UI renders results as a clickable card grid, and
clicking a card embeds the YouTube player inline.

## What changed

- `apps/webuiapps/src/pages/MusicApp/` → `apps/webuiapps/src/pages/YouTubeApp/`
  (renamed via `git mv`; history preserved)
- `appId: 3` is now `appName: 'youtube'` with route `/youtube`
  (was `musicPlayer` → `/musicPlayer`)
- Icon switched from `Music` (lucide `#1db954`) to `Youtube` (`#ff0000`)
- All action plumbing replaced — only one action left: `SEARCH`
- New dependency: [`youtube-search-api`](https://www.npmjs.com/package/youtube-search-api)
  (no API key required, battle-tested public-scrape package)

## Action contract

```
vibe_action(
  app_name="youtube",
  action_type="SEARCH",
  params='{"query":"fleetwood mac landslide","max_results":10}'
)
```

| Param         | Type   | Required | Description                                    |
|---------------|--------|----------|------------------------------------------------|
| `query`       | string | yes      | Free-text YouTube search query                 |
| `max_results` | number | no       | 1–25, default 10                               |

The tool returns `"success: <N> results (backend=youtube-search-api|stub)"`
once the search dispatches. Rendering happens entirely inside OpenRoom —
Kayley's brain doesn't see the results.

## Rendering

Each result is a card with:

- Thumbnail (`https://i.ytimg.com/vi/<video_id>/hqdefault.jpg` — fallback if
  the scraper didn't provide one)
- Title (2-line clamp)
- Channel name
- Duration pill (bottom-right corner of the thumbnail, omitted for live streams)

Styling matches YouTube's dark theme (`#0f0f0f` background, `#212121` header).

## Click-to-play

Clicking any card sets `playingVideoId` and swaps the grid for an
`<iframe>` pointing at:

```
https://www.youtube.com/embed/<video_id>?autoplay=1
```

The `allow` attribute covers autoplay, fullscreen, PiP, encrypted media,
and clipboard writes so the embedded player behaves like youtube.com.
A "Back to results" button restores the grid.

## Known limits

- **Public scrape, not the official Data API.** No API key is required,
  but search is rate-limited by YouTube and the scraper can break when
  YouTube changes its markup.
- **Browser CORS / Node-only deps.** `youtube-search-api` was designed
  for Node. The component attempts it via dynamic import inside a
  try/catch. If it throws (CORS, missing Node polyfills, markup drift),
  the component falls back to a **deterministic 5-item stub** so the
  `vibe_action` round-trip always completes end-to-end. Stub results are
  prefixed with the query string so the UI is still query-aware.
- **No pagination.** v1 only fetches the first page.
- **Embed restrictions.** Some videos disable embedding (copyright,
  region locks). The iframe will show YouTube's "Video unavailable"
  frame — not a bug in the app.

## Test plan

1. Open the OpenRoom desktop, click the YouTube icon — the app opens
   with an empty search bar.
2. Send a message to Kayley (dashboard or Telegram voice): "Search
   YouTube for Fleetwood Mac Landslide live." She invokes
   `vibe_action(app_name='youtube', action_type='SEARCH', params='{"query":"fleetwood mac landslide live"}')`.
   The app populates with result cards within a few seconds.
3. Click any card. The grid is replaced by an embedded player; the
   video autoplays. "Back to results" returns to the grid.
