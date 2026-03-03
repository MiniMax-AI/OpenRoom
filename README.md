# VibeApps

[中文](./README_zh.md) | English

> Imagine a desktop that lives in your browser — and an AI that knows how to use every app on it.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

**[Website](https://www.openroom.ai)** · **[X / Twitter](https://x.com/openroom_ai_)**


## What is VibeApps?

VibeApps brings a full desktop experience into your browser — windows you can drag and resize, apps you can open side by side, all wrapped in a clean macOS-inspired interface. But what makes it different is the **AI Agent** sitting inside.

Instead of clicking through menus, just tell it what you want:

> *"Play some jazz"* — and the Music app starts playing.
>
> *"Write a diary entry about today's hiking trip"* — Diary opens, a new entry appears.
>
> *"Let's play chess"* — the board is ready.

The Agent doesn't just launch apps — it **operates** them. It reads data, triggers actions, and updates state, all through a structured Action system that every app speaks.

Everything runs locally in your browser. No backend, no accounts, no setup headaches. Your data stays in IndexedDB, right where it belongs.

## Built-in Apps

Out of the box, you get a suite of apps ready to explore:

| App | Description |
|-----|-------------|
| 🎵 Music | Full-featured player with playlists, playback controls, and album art |
| ♟️ Chess | Classic chess with complete rule enforcement |
| ⚫ Gomoku | Five-in-a-row — simple rules, deep strategy |
| 🃏 FreeCell | The solitaire game that's all skill, no luck |
| 📧 Email | Inbox, sent, drafts — a familiar email experience |
| 📔 Diary | Journal with mood tracking to capture your days |
| 🐦 Twitter | A social feed you actually control |
| 📷 Album | Browse and organize your photo collections |
| 📰 CyberNews | Stay informed with a curated news aggregator |

Each app is fully integrated with the AI Agent — meaning you can interact with any of them through natural language.

## Getting Started

### Prerequisites

| Tool | Version | Check | Install |
|------|---------|-------|---------|
| **Node.js** | 18+ | `node -v` | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 9+ | `pnpm -v` | `npm install -g pnpm@9` |

> **In China?** Uncomment the mirror lines in `.npmrc` for faster downloads via npmmirror.

### Up and Running in 60 Seconds

```bash
# Clone & enter the project
git clone https://github.com/MiniMax-AI/OpenRoom.git
cd OpenRoom

# Install dependencies
pnpm install

# (Optional) Set up environment variables
cp apps/webuiapps/.env.example apps/webuiapps/.env

# Launch
pnpm dev
```

Open `http://localhost:3000` — you'll see a desktop with app icons. **Double-click** to open any app.

### Meet the AI Agent (In-App Chat)

Click the **chat icon** in the bottom-right corner. A panel slides open — that's your Agent.

Type naturally: *"play the next song"*, *"show me my emails"*, *"start a new chess game"*. The Agent figures out which app to talk to, what action to take, and makes it happen.

> **Note:** You'll need an LLM API key. Configure it in the Chat Panel settings.
>
> This chat panel is for **using** existing apps. To **create** new apps, see the [Vibe Workflow](#build-your-own-apps--just-describe-them) section below — that runs in Claude Code CLI.

## Build Your Own Apps — Just Describe Them

This is where it gets interesting. With the **Vibe Workflow**, you can generate a complete, fully-integrated app just by describing what you want. No boilerplate, no scaffolding — [Claude Code](https://docs.anthropic.com/en/docs/claude-code) handles the entire process.

> **Important:** The Vibe Workflow runs in **Claude Code (CLI terminal)**, not in the browser's chat panel. The in-app chat panel is for operating existing apps; creating new apps happens in your development environment.

### Create from Scratch

```bash
/vibe WeatherApp Create a weather dashboard with 5-day forecasts and temperature charts
```

Behind the scenes, the workflow runs through **6 stages** — each one building on the last:

```
Requirement Analysis   →  What exactly are we building?
Architecture Design    →  Components, data models, state shape
Task Planning          →  Breaking it down into implementable chunks
Code Generation        →  Writing the actual React + TypeScript code
Asset Generation       →  Creating icons and images
Project Integration    →  Registering the app so it shows up on the desktop
```

When it's done, your new app is live — complete with AI Agent integration.

### Evolve Existing Apps

Already have an app but want more? Describe the change:

```bash
/vibe MusicApp Add a lyrics panel that shows synced lyrics during playback
```

This triggers a focused **4-stage change workflow**: Impact Analysis → Planning → Implementation → Verification.

### Resume or Replay

```bash
# Pick up where you left off
/vibe MyApp

# Jump to a specific stage
/vibe MyApp --from=04-codegen
```

## Under the Hood

### Project Layout

```
OpenRoom/
├── apps/webuiapps/              # The main desktop application
│   └── src/
│       ├── components/          # Shell, window manager, chat panel
│       ├── lib/                 # Core SDK — file API, actions, app registry
│       ├── pages/               # Where each app lives
│       └── routers/             # Route definitions
├── packages/
│   └── vibe-container/          # iframe communication SDK (stub in open-source mode)
├── .claude/                     # AI workflow engine
│   ├── commands/vibe.md         # Workflow entry point
│   ├── workflow/                # Stage definitions & rules
│   └── rules/                   # Code generation constraints
└── .github/workflows/           # CI pipeline
```

> **Note on `vibe-container`:** In the open-source standalone version, the real iframe SDK is replaced by a local mock (`src/lib/vibeContainerMock.ts`) that uses IndexedDB for storage and a local event bus for Agent communication. The package under `packages/vibe-container/` provides type definitions and the client-side SDK interface. See its [README](./packages/vibe-container/README.md) for details.

### Anatomy of an App

Every app follows the same structure — consistent, predictable, easy to navigate:

```
pages/MusicApp/
├── components/         # UI building blocks
├── data/               # Seed data (JSON)
├── store/              # State management (Context + Reducer)
├── actions/            # How the AI Agent talks to this app
│   └── constants.ts    # APP_ID + action type definitions
├── i18n/               # Translations (en.ts + zh.ts)
├── meta/               # Metadata for the Vibe workflow
│   ├── meta_cn/        # guide.md + meta.yaml (Chinese)
│   └── meta_en/        # guide.md + meta.yaml (English)
├── index.tsx           # Entry point
├── types.ts            # TypeScript definitions
└── index.module.scss   # Scoped styles
```

## Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server → `http://localhost:3000` |
| `pnpm build` | Production build |
| `pnpm run lint` | Lint + auto-fix |
| `pnpm run pretty` | Format with Prettier |
| `pnpm clean` | Clean build artifacts |

## Tech Stack

| | |
|---|---|
| **Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS + CSS Modules + Design Tokens |
| **Icons** | Lucide React |
| **State** | React Context + Reducer |
| **Storage** | IndexedDB (standalone) / Cloud NAS (production) |
| **i18n** | i18next + react-i18next |
| **Monorepo** | pnpm workspaces + Turborepo |
| **CI** | GitHub Actions |

## Environment Variables

```bash
cp apps/webuiapps/.env.example apps/webuiapps/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `CDN_PREFIX` | No | CDN prefix for static assets |
| `VITE_RUM_SITE` | No | RUM monitoring endpoint |
| `VITE_RUM_CLIENT_TOKEN` | No | RUM client token |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token (enables error tracking when set) |
| `SENTRY_ORG` | No | Sentry organization slug |
| `SENTRY_PROJECT` | No | Sentry project slug |

All optional. The app runs fine without any of them.

## Contributing

We'd love your help. Whether it's fixing a bug, building a new app, or improving docs — check out [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE) — Copyright (c) 2025 MiniMax
