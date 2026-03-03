---
requires_rules:
  - app-definition.md
requires_outputs:
  - requirement-breakdown.json
produces:
  - solution-design.json
---

# VibeApp Architecture Design

You are a senior frontend architect. Transform `RequirementBreakdown` into a complete UX architecture and technical architecture solution.

**Prerequisites**: See `app-definition.md` for the runtime model, and `data-interaction.md` (always loaded) for data interaction APIs.

## Core Constraints

1. **Pure Frontend**: No backend, no database, no external APIs
2. **Single-Machine File Storage**: Cloud NAS JSON files, non-concurrent scenarios
3. **Tech Stack**: React 18+, TypeScript, Vite, CSS Modules, Lucide React
4. **Data Interaction**: Through `@/lib` (see `data-interaction.md`)

---

## Design Process

### Step 0: Create Thinking Record (Required)

Create `.claude/thinking/{AppName}/02-architecture-design.md`, recording UX decisions, component decomposition, data models, Action design, and Checkpoint planning.

### Step 1: UX Architecture Design

- **Design System** (output to `designSystem` field): Colors (Primary/Functional/Neutral), Typography (Scale/Weight), Spacing (8px grid), Interaction (Radius/Shadow/Animation), Anti-patterns
- **Pages & Views**: Define layouts, navigation relationships, and interactive element behaviors for all views
- **Component Architecture**: Pages -> Containers -> Components -> Common layering, clarify data sources
- **Window Adaptation**: CSS Container Query strategy, breakpoint variable sets, layout degradation scheme, mini mode (if needed), fixed element handling

### Step 2: Data Model & Storage

- Define TypeScript interfaces + storage paths for each entity
- Repository Pattern encapsulating CRUD (`createAppFileApi` auto-prepends path prefix)
- state.json (optional): Define Schema, only design when on-scene restoration is needed

### Step 3: Actions System Design

See `data-interaction.md` Section 2. Plan:
1. List Operation + Data Mutation Actions
2. Each Repo corresponds to `REFRESH_{COLLECTION}` (supports `navigateTo`/`focusId`)
3. Include `SYNC_STATE` when state.json is enabled

### Step 4: Define Checkpoints

```text
CP-01: Scaffolding -> Directories, style variables, type definitions
CP-02: Data Layer -> Repository, Store
CP-03: UI Skeleton -> Layout, navigation, empty states
CP-04: Core Features -> Business functionality (can be split into sub-CPs)
CP-05: Action Integration -> Four Action categories + lifecycle
CP-06: Final Polish -> Animations, edge cases, styling
```

---

## Output: SolutionDesign JSON

```json
{
  "designSystem": {
    "colors": { "primary": {}, "functional": {}, "neutral": {} },
    "typography": { "fontFamily": "", "scale": {}, "weight": {} },
    "spacing": { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px" },
    "interaction": { "radius": {}, "shadow": {}, "animation": {} },
    "antiPatterns": []
  },
  "views": [{ "id": "", "name": "", "layout": "", "purpose": "", "components": [], "navigation": { "from": [], "to": [] } }],
  "components": [{ "name": "", "layer": "page|container|component|common", "props": [], "dataSource": "props|context|local", "reusedIn": [] }],
  "storage": {
    "schemas": [{ "name": "", "path": "", "fields": [{ "name": "", "type": "", "required": true }] }],
    "state": { "enabled": true, "fields": [{ "name": "", "type": "", "default": "" }] },
    "repositories": []
  },
  "actions": {
    "business": [{ "type": "", "name": "", "description": "", "params": [] }],
    "refresh": [{ "type": "", "name": "", "description": "", "repository": "", "navigateTo": "", "supportFocusId": true }]
  },
  "windowModes": {
    "strategy": "container-query|media-query", "cssApproach": "",
    "breakpoints": [{ "name": "", "maxWidth": null, "cssVariables": {}, "viewAdaptations": [] }],
    "miniMode": { "enabled": false, "componentTree": "", "sharedState": [], "enterTrigger": "", "exitTrigger": "" },
    "fixedElements": [{ "component": "", "defaultPosition": "", "compactBehavior": "", "compactImplementation": "" }],
    "transitions": { "layoutChange": "", "miniModeEnter": "", "miniModeExit": "" }
  },
  "assets": [{ "name": "example.png", "description": "Image content and style description", "size": "1200x600" }],
  "checkpoints": [{ "id": "", "title": "", "deliverables": [], "subtasks": [] }],
  "fileStructure": { "src/pages/{AppName}/": { "components/": "", "pages/": "", "data/": "", "assets/": "", "store/": "", "actions/": "", "styles/": "", "index.tsx": "" } }
}
```

### Step 5: Save Artifacts

Write the SolutionDesign JSON to `.claude/thinking/{AppName}/outputs/solution-design.json`.
