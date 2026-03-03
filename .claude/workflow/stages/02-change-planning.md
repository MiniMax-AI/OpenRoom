---
requires_rules: []
requires_outputs:
  - change-analysis.json
  - solution-design.json
produces:
  - change-todolist.json
---

# VibeApp Change Task Planning

You are a project management expert. Transform `ChangeAnalysis` into a **linearly executable incremental task list**.

**Input**: `ChangeAnalysis` JSON + `SolutionDesign` JSON (may have been incrementally updated)

## Core Principles

1. **Minimal Change Set**: Only plan files and code that need changing, do not touch unrelated parts
2. **Modify Over Create**: Prefer modifying existing files over creating new ones
3. **Regression Safety**: Include regression checks for affected existing functionality in change tasks
4. **Linear Execution**: Tasks arranged by dependency order (data models first -> then components -> finally integration points)

---

## Workflow

### Step 0: Create Thinking Record (Required)

Create `.claude/thinking/{AppName}/02-change-planning.md` (overwrite existing), recording:
- Change scope summary
- Task decomposition approach
- Dependency order analysis
- Regression risk points

### Step 1: Extract Tasks from ChangeAnalysis

Generate tasks based on each entry in `impactAnalysis`:

| Impact Type | Task Action | Description |
|-------------|-------------|-------------|
| `dataModels` (create) | `create_file` | New type definition / Schema |
| `dataModels` (modify) | `update_file` | Modify existing type definition |
| `components` (create) | `generate_code` / `generate_h5_page` | New component or page |
| `components` (modify) | `update_file` | Modify existing component |
| `components` (delete) | `delete_code` | Delete deprecated component |
| `actions` (create/modify) | `update_file` | Add or modify Action definition |
| `styles` (create/modify) | `update_file` / `create_file` | Style changes |

### Step 2: Add Architecture Update Tasks (If Needed)

If `requiresArchitectureUpdate` is true, prepend to task list:
- Update `types.ts` (add/modify interface definitions)
- Update Repository (add/modify data operations)
- Update Store (add/modify Context/Reducer)

### Step 3: Add Regression Check Tasks

Append to the end of the task list:
- Check that imports/exports of affected components are complete
- Check that data model changes are backward compatible (existing Seed Data won't break)
- Update Seed Data (if data models changed)
- Update meta.yaml and guide.md (if features changed)

### Step 4: Define Acceptance Checks

| Category | Check Item |
|----------|------------|
| Build | `pnpm build` no errors |
| Lint | `pnpm run lint` no errors |
| Functionality | New features work correctly |
| Regression | Existing features not broken |
| Data | Seed Data consistent with new models |

---

## Output: ChangeTodoList JSON

```json
{
  "changeRequest": "Change requirement summary",
  "changeType": "ui-tweak|feature-enhance|feature-add|architecture-change",
  "tasks": [
    {
      "id": "change-001",
      "type": "update_file|create_file|generate_code|generate_h5_page|delete_code",
      "title": "Task description",
      "targetFile": "src/pages/{AppName}/...",
      "action": "modify|create|delete",
      "details": "Specific change content description"
    }
  ],
  "regressionChecks": [
    { "component": "Affected component name", "check": "Behavior to verify" }
  ],
  "finalChecks": [
    { "category": "Build", "check": "pnpm build no errors" },
    { "category": "Lint", "check": "pnpm run lint no errors" },
    { "category": "Functionality", "check": "New features work correctly" },
    { "category": "Regression", "check": "Existing features not broken" },
    { "category": "Data", "check": "Seed Data consistent with new models" }
  ],
  "stats": { "totalTasks": 0, "newFiles": 0, "modifiedFiles": 0, "deletedFiles": 0 }
}
```

### Step 5: Save Artifacts

Write the ChangeTodoList JSON to `.claude/thinking/{AppName}/outputs/change-todolist.json`.
