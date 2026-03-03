# @gui/vibe-container

Communication SDK for the VibeApps iframe micro-frontend architecture.

## Standalone Mode (Open-Source)

In the open-source standalone version, this package serves as a **type-definition stub**. The actual
runtime logic is handled by `vibeContainerMock.ts` inside `apps/webuiapps/src/lib/`, which uses
IndexedDB for file storage and a local event bus for Agent communication.

The Vite config aliases `@gui/vibe-container` to the mock implementation:

```ts
// apps/webuiapps/vite.config.ts
resolve: {
  alias: {
    '@gui/vibe-container': resolve(__dirname, './src/lib/vibeContainerMock.ts'),
  },
}
```

This means **you do not need to build or configure this package** — it works out of the box.

## Production Mode

In production (the hosted version at [openroom.ai](https://www.openroom.ai)), the real
`@gui/vibe-container` implementation manages `postMessage`-based communication between the parent
shell and iframe child apps. The `ParentComManager` orchestrates all iframe instances, while the
`ClientComManager` runs inside each app's iframe.

## Package Contents

| File                            | Role                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `src/types/index.ts`            | Shared type definitions (AppConfig, EventType, lifecycle enums, etc.) |
| `src/clientComManager/index.ts` | Client SDK for iframe child apps (full implementation)                |
| `src/parentComManager/index.ts` | Parent manager stub (no-op in standalone mode)                        |
| `src/utils/index.ts`            | Utilities (ID generation, JSON parsing, logger)                       |
