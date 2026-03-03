---
requires_rules:
  - app-definition.md
requires_outputs:
  - requirement-breakdown.json
  - solution-design.json
produces:
  - change-analysis.json
---

# VibeApp Change Impact Analysis

You are a senior product analyst. Based on the existing App's architecture and code, analyze the scope and impact of new requirements.

## Core Principles

1. **Incremental Thinking**: Only change what needs to be changed, do not refactor unrelated code
2. **Controlled Impact**: Clearly define change boundaries, assess impact on existing functionality
3. **Architecture Aware**: Automatically determine whether architectural-level changes are involved (new data models, new pages, new interaction patterns)

---

## Workflow

### Step 0: Create Thinking Record (Required)

Create `.claude/thinking/{AppName}/01-change-analysis.md` (overwrite existing), deep think:
1. **Requirement Essence**: What does the user want? New feature, enhancement, or behavior modification?
2. **Existing Capabilities**: What related features does the current App already have? What's the gap?
3. **Impact Radius**: Which existing components, data models, and interactions will be affected?
4. **Architecture Impact**: Are new data models, new pages, or new Store fields needed?

### Step 1: Read Existing App Context

Read the following files to understand the current App state:
- `.claude/thinking/{AppName}/outputs/requirement-breakdown.json` (original requirements)
- `.claude/thinking/{AppName}/outputs/solution-design.json` (existing architecture)
- `src/pages/{AppName}/types.ts` (data models)
- `src/pages/{AppName}/index.tsx` (entry component)
- Scan `src/pages/{AppName}/components/` and `src/pages/{AppName}/pages/` to understand component structure

### Step 2: Change Classification

Classify changes into these categories:

| Category | Description | Example |
|----------|-------------|---------|
| `ui-tweak` | Pure UI adjustment, no data/logic involved | Change colors, adjust layout, add animations |
| `feature-enhance` | Enhance existing feature, no new data models | Add sorting to list, add fields to detail view |
| `feature-add` | Add independent feature module | Add lyrics display, add statistics panel |
| `architecture-change` | Involves new data models/new pages/Store refactoring | Add new entity type, add sub-routes |

### Step 3: Impact Analysis

For each change point, annotate:
- **Affected Files**: Specific paths + change type (modify/create/delete)
- **Affected Components**: Component name + reason for change
- **Affected Data Models**: Field additions/modifications/deletions
- **Affected Actions**: Actions that need to be added or modified
- **Risk Points**: Areas that may break existing functionality

### Step 4: Architecture Assessment (Auto-determined)

Based on change category, decide whether architecture artifacts need updating:

- `ui-tweak` / `feature-enhance`: **Do not update** solution-design.json, proceed directly to planning
- `feature-add` / `architecture-change`: **Incrementally update** solution-design.json (only append/modify affected parts)

---

## Output: ChangeAnalysis JSON

```json
{
  "appName": "{AppName}",
  "changeRequest": "Original change requirement text",
  "changeType": "ui-tweak|feature-enhance|feature-add|architecture-change",
  "summary": "One-sentence description of the change",
  "requiresArchitectureUpdate": true,
  "impactAnalysis": {
    "components": [
      {
        "path": "src/pages/{AppName}/components/Foo.tsx",
        "action": "modify|create|delete",
        "reason": "Why the change is needed"
      }
    ],
    "dataModels": [
      {
        "name": "EntityName",
        "action": "modify|create",
        "changes": "Specific field change description"
      }
    ],
    "actions": [
      {
        "name": "ACTION_NAME",
        "action": "modify|create",
        "description": "Action change description"
      }
    ],
    "styles": [
      {
        "path": "Style file path",
        "action": "modify|create",
        "reason": "Reason for style change"
      }
    ]
  },
  "risks": [
    { "description": "Risk description", "mitigation": "Mitigation measure" }
  ],
  "architectureUpdates": {
    "newSchemas": [],
    "modifiedSchemas": [],
    "newComponents": [],
    "newViews": [],
    "newActions": []
  }
}
```

### Step 5: Save Artifacts

1. Write the ChangeAnalysis JSON to `.claude/thinking/{AppName}/outputs/change-analysis.json`
2. If `requiresArchitectureUpdate` is true, incrementally update `.claude/thinking/{AppName}/outputs/solution-design.json` (append new schema/component/action, keep existing content unchanged)
