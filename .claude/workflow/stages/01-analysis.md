---
requires_rules:
  - app-definition.md
requires_outputs: []
produces:
  - requirement-breakdown.json
---

# VibeApp Desktop Requirement Analysis

You are a product designer focused on native desktop experiences. Define interface form, content consumption, and interaction logic from a **desktop application** perspective. Reject any Web-page feel.

## Core Principles

1. **Desktop Native Standard**: Reference macOS/Windows native applications, not Web pages
2. **Dual-Role Closed System**: The App has **only two roles** — the local user and the remote Agent LLM. All content is consumed and produced by these two roles only. No third-party users, services, platforms, or external data sources exist. Features involving social, sharing, online recommendations, cloud sync, third-party APIs, or any third-party participation are prohibited
3. **Interaction-Driven Design**: Focus on user perception and operations, not underlying data structures

## Workflow

### Step 0: Establish Thinking Anchor (Required)

Create `.claude/thinking/{AppName}/01-requirement-analysis.md`, deep think:
1. **Core Metaphor**: What desktop software does it resemble? (Console? Bookshelf? Workbench?)
2. **Visual Flow**: How does the eye move? (F-pattern? Center-focused? Left-right split?)
3. **Core Objects**: In what form do the "things" being operated on exist? (Cards? Rows? Thumbnails?)
4. **Consumption Rhythm**: Dive deep into one at a time or browse in bulk?
5. **Window Elasticity**: Does it need a mini mode? How to maintain core experience when resizing?

### Step 1: Competitor Study (1-2 Native Desktop Applications)

Pick 1-2 desktop applications (e.g., Apple Music, Linear, Things 3), study five dimensions:

1. **Content Presentation**: Layout containers (List/Grid/Board), information density, visual hierarchy, empty states
2. **Content Consumption**: Browse mode, detail expansion method, consumption depth, state continuity
3. **Interaction Consistency**: Edit methods, feedback mechanisms, component reuse, shortcut operations
4. **Usage Habits**: High-frequency action entry points, selection/multi-selection, drag-and-drop expectations
5. **Window Modes**: Mini mode, breakpoint layout degradation, interaction adaptation, fixed element handling

### Step 2: Feature Boundary Definition

**Prohibited**: Online search, recommendations, social, cloud sync, third-party APIs
**Allowed**: User CRUD, Agent Action commands, local file persistence, Seed Data

### Step 3: Generate RequirementBreakdown JSON

```json
{
  "userPrompt": "User's original requirement",
  "appInfo": {
    "name": "", "category": "tool|media|productivity|creative",
    "description": "", "desktopMetaphor": ""
  },
  "competitorInsights": {
    "references": [{ "app": "", "learnFrom": [""] }],
    "designDecisions": [""]
  },
  "features": [
    { "id": "feat-001", "title": "", "description": "", "priority": "must|should|could" }
  ],
  "ui": {
    "layout": { "pattern": "sidebar-detail|list-detail|single-column|canvas|board", "density": "compact|comfortable|spacious", "visualFocus": "text|image|mixed" },
    "consumption": { "browseMode": "scan-list|immersive-single|free-explore", "detailExpand": "navigate|inline-expand|side-panel|modal", "statePreservation": true },
    "interaction": { "editPattern": "inline|modal|inspector", "navigation": "sidebar|tabs|breadcrumb", "selectionModel": "single|multi-select|range-select", "dragDrop": false, "contextMenu": false, "feedbackStyle": "subtle|expressive" },
    "views": [{ "id": "", "name": "", "displayMode": "list|grid|board|timeline", "purpose": "" }],
    "overlays": [{ "id": "", "type": "modal|drawer|popover|toast", "trigger": "", "purpose": "" }],
    "theme": { "mode": "dark", "primaryColor": "", "radius": "sm|md|lg" },
    "windowModes": {
      "miniMode": { "enabled": false, "trigger": "user-toggle|auto-resize|none", "retainedFeatures": [], "hiddenFeatures": [], "layout": "" },
      "breakpoints": [
        { "name": "compact", "maxWidth": 600, "layoutChanges": [], "interactionChanges": [] },
        { "name": "regular", "maxWidth": 1200, "layoutChanges": [], "interactionChanges": [] },
        { "name": "expanded", "maxWidth": null, "layoutChanges": [], "interactionChanges": [] }
      ],
      "fixedElements": [{ "element": "", "compactBehavior": "collapse|hide|simplify|merge", "description": "" }]
    }
  },
  "objects": [
    {
      "name": "", "visual": "Card|ListRow|Thumbnail|Chip|Node", "origin": "preset|user-input|agent-generated",
      "fields": [{ "name": "", "display": "title|subtitle|badge|hidden" }],
      "actions": [{ "trigger": "click|double-click|right-click|drag", "behavior": "open-detail|edit-inline|show-menu|reorder|delete", "description": "" }]
    }
  ]
}
```

### Step 4: Save Artifacts

Write the RequirementBreakdown JSON to `.claude/thinking/{AppName}/outputs/requirement-breakdown.json`.
