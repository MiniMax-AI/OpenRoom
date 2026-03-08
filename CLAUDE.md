# VibeApp Development Guide

An iframe-based micro-frontend VibeApp system (React + Cloud NAS).

## Quick Start

Create a new app: `/vibe {AppName} {Description}`
Modify an existing app: `/vibe {AppName} {ChangeDescription}`
Resume an existing workflow: `/vibe {AppName}`
Re-run from a specific stage: `/vibe {AppName} --from=04-codegen`

Creation mode runs 6 stages: Requirement Analysis -> Architecture Design -> Task Planning -> Code Generation -> Asset Generation -> Project Integration.
Change mode runs 4 stages: Change Impact Analysis -> Change Task Planning -> Change Code Implementation -> Change Verification.
You can also enter a requirement description directly, and the system will automatically detect and trigger the corresponding mode.

## Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS (H5 Pages), CSS Modules (Components)
- **Icons**: Lucide React (No Emoji)
- **Storage**: Cloud NAS via `@/lib` (Repository Pattern)
- **Communication**: `postMessage` via `@/lib`

## File Structure

```text
src/pages/{AppName}/
├── components/    # UI Components
├── pages/         # Sub-pages (H5 Templates)
├── data/          # Seed Data (JSON only)
├── assets/        # Generated Image Assets
├── mock/          # Dev Mock Data (TypeScript)
├── store/         # Context/Reducer
├── actions/       # Action Definitions
├── styles/        # CSS Variables
├── i18n/          # en.ts + zh.ts
├── meta/
│   ├── meta_cn/   # Chinese: guide.md + meta.yaml
│   └── meta_en/   # English: guide.md + meta.yaml
├── index.tsx      # Entry (lifecycle reports here only)
├── index.module.scss
└── types.ts
```

## Workflow Structure

```text
.claude/
├── commands/vibe.md           # Single entry orchestrator
├── workflow/
│   ├── stages/                # Stage definitions (loaded on-demand)
│   │   ├── 01-analysis.md          # Create: Requirement Analysis
│   │   ├── 02-architecture.md      # Create: Architecture Design
│   │   ├── 03-planning.md          # Create: Task Planning
│   │   ├── 04-codegen.md           # Create: Code Generation
│   │   ├── 05-assets.md            # Create: Asset Generation
│   │   ├── 06-integration.md       # Create: Project Integration
│   │   ├── 01-change-analysis.md       # Change: Impact Analysis
│   │   ├── 02-change-planning.md       # Change: Task Planning
│   │   ├── 03-change-codegen.md        # Change: Code Implementation
│   │   └── 04-change-verification.md   # Change: Verification
│   └── rules/                 # Stage-specific rules (loaded on-demand)
│       ├── app-definition.md
│       ├── responsive-layout.md
│       ├── guide-md.md
│       └── meta-yaml.md
├── rules/                     # Global rules (always loaded)
│   ├── data-interaction.md
│   ├── design-tokens.md
│   ├── concurrent-execution.md
│   └── post-task-check.md
└── thinking/{AppName}/        # Per-app workflow state & artifacts
    ├── workflow.json
    ├── 01-requirement-analysis.md
    ├── 02-architecture-design.md
    ├── 03-task-planning.md
    ├── 04-code-generation.md
    └── outputs/
        ├── requirement-breakdown.json
        ├── solution-design.json
        └── workflow-todolist.json
```

## Rules

The following global rules in `.claude/rules/` are mandatory constraints across all stages:

| Rule File | Description |
|---|---|
| `data-interaction.md` | Data interaction & NAS storage specification |
| `design-tokens.md` | Design token system & usage guidelines |
| `concurrent-execution.md` | Concurrent execution & task scheduling rules |
| `post-task-check.md` | Post-task completion checklist |

Stage-specific rules are in `.claude/workflow/rules/`, loaded on-demand by `/vibe`.

## Auto Workflow Trigger

When the user enters a requirement description directly (instead of using the `/vibe` command), automatically execute the workflow defined in `.claude/commands/vibe.md`.

### Creating a New App

Detection rules:

- The user's message contains an explicit new app requirement (e.g., "build a XX app", "I need a XX", "help me develop XX")
- Automatically extract AppName (PascalCase format) from the requirement; Description is the user's full requirement text
- Equivalent to executing `/vibe {AppName} {Description}`

### Modifying an Existing App

Detection rules:

- The user's message explicitly targets an existing App with a change request (e.g., "add lyrics feature to MusicApp", "MusicApp needs to support XX")
- Also includes cases where the App name is not specified but can be inferred from context (e.g., there is only one App, and the user says "add a lyrics display feature")
- Automatically identify AppName; Description is the change requirement text
- Equivalent to executing `/vibe {AppName} {ChangeDescription}` (vibe.md's mode detection logic automatically enters change mode)

### Cases That Do NOT Trigger

- The user is clearly asking questions, chatting, or making fine-grained code modifications (e.g., "change this button color to red")
- The user used the `/vibe` command (already handled by the command mechanism)
- The user requests resuming or re-running from a specific stage (must explicitly use `/vibe {AppName}` or `/vibe {AppName} --from=XX`)

## Testing

### Unit Tests (Vitest)

Run from the webuiapps package:

```bash
cd apps/webuiapps && pnpm test        # single run
cd apps/webuiapps && pnpm test:watch  # watch mode
```

### E2E Tests (Playwright)

Run from the repo root. The dev server starts automatically.

```bash
pnpm test:e2e          # headless, Chromium only
pnpm test:e2e:ui       # interactive UI mode
```

- Config: `playwright.config.ts` (root)
- Tests: `e2e/` directory
- The web server (`pnpm dev`) is auto-launched on port 3000 and reused if already running.
- Only Chromium is configured by default; add projects in `playwright.config.ts` for Firefox/WebKit.
- After completing code changes that affect UI or routing, run `pnpm test:e2e` and report pass/fail.
