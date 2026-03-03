# Contributing to VibeApps

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/OpenRoom.git`
3. Install dependencies: `pnpm install`
4. Start the dev server: `pnpm dev`
5. Create a feature branch: `git checkout -b feat/my-feature`

## Development Workflow

### Code Style

- **TypeScript** is required for all source files
- **ESLint** and **Prettier** are enforced via pre-commit hooks
- Run `pnpm run lint` to check and auto-fix issues
- Run `pnpm run pretty` to format code

### Design Tokens

All apps must use the project's design token system. Do not hardcode colors or spacing values. See `.claude/rules/design-tokens.md` for the full palette and CSS variable reference.

### Data Interaction

- All file/message operations must go through `@/lib` — never import `@gui/vibe-container` directly
- Use `reportAction(APP_ID, actionType, params)` for user-triggered actions
- Use `useAgentActionListener(APP_ID, handler)` for Agent-triggered actions
- See `.claude/rules/data-interaction.md` for the full specification

### Icons

Use [Lucide React](https://lucide.dev/) icons only. Emoji is not allowed in the UI.

## Adding a New App

### Option 1: Using the Vibe Workflow (requires Claude Code)

The fastest way is via the Vibe workflow with [Claude Code](https://docs.anthropic.com/en/docs/claude-code):

```bash
/vibe MyApp Description of the app
```

This automatically generates all boilerplate, integrates with the AI Agent, and registers the app.

### Option 2: Building Manually (no Claude Code required)

You can build an app by hand without any AI tooling. Follow this structure:

```
src/pages/MyApp/
├── components/        # UI components
├── store/             # State management (Context/Reducer)
├── actions/
│   └── constants.ts   # APP_ID, APP_NAME, ActionTypes
├── i18n/
│   ├── en.ts
│   └── zh.ts
├── data/              # Seed data (JSON only)
├── meta/
│   ├── meta_cn/       # Chinese guide.md + meta.yaml
│   └── meta_en/       # English guide.md + meta.yaml
├── index.tsx          # Entry point (lifecycle reports here only)
├── index.module.scss
└── types.ts
```

Don't forget to:

1. Register the route in `src/routers/index.tsx`
2. Add the app to `APP_STATIC_REGISTRY` in `src/lib/appRegistry.ts`
3. Define `APP_ID` and `ActionTypes` in `actions/constants.ts`
4. Add seed data as JSON files in `data/`
5. Use `reportLifecycle()` in `index.tsx` for the AI Agent integration
6. Provide i18n translations (at minimum `en.ts` and `zh.ts`)

For reference, look at any existing app (e.g., `src/pages/MusicApp/`) as a template.

> **Note:** The `.claude/` directory contains the AI workflow engine used by the Vibe Workflow. It is not required for manual development — you can safely ignore it if you're not using Claude Code.

## Pull Request Process

1. Ensure `pnpm run lint` passes with 0 errors
2. Ensure `pnpm build` succeeds
3. Write a clear PR title and description
4. Link any related issues

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new weather app
fix: resolve task list empty state
docs: update README with setup instructions
refactor: extract shared file API utilities
```

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include browser version, OS, and steps to reproduce for bugs
- Screenshots are always helpful

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
