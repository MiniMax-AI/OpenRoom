# YouTubeApp Data Guide

The YouTube app is stateless from the Agent's perspective — there are no
cloud files for Kayley to write. She drives the app entirely through the
`SEARCH` action:

```
vibe_action(
  app_name="youtube",
  action_type="SEARCH",
  params='{"query":"fleetwood mac landslide","max_results":10}'
)
```

The app performs the search itself and renders a clickable grid of
result cards. Clicking a card embeds the YouTube player inline.

## Search backend

The app tries the `youtube-search-api` npm package first (no API key,
public scrape). If that fails in the browser (CORS, Node-only deps, or
YouTube markup changes), it falls back to a deterministic 5-item stub so
the vibe_action round-trip always completes.
