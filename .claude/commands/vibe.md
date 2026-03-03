# VibeApp Workflow Orchestrator

Single-entry workflow orchestrator. Automatically advances stages based on workflow state, supporting creation, resume from breakpoint, and requirement changes.

## Parameter Parsing

- `$ARGUMENTS` format: `{AppName} [Description]`
- **Has Description + App does not exist** -> New workflow (creation mode)
- **Has Description + App already exists (workflow completed)** -> Change workflow (change mode)
- **AppName only** -> Resume existing workflow (continue from last interruption point)
- **AppName --from=XX** -> Re-run from specified stage (e.g., `--from=04-codegen`)

## Mode Determination Logic

```
Read .claude/thinking/{AppName}/workflow.json
  ├── File does not exist ──────────────────────> Creation mode
  ├── File exists + No Description ─────────────> Resume mode
  └── File exists + Has Description
        ├── Workflow all completed ─────────────> Change mode
        └── Workflow not completed ─────────────> Resume mode (ignore new Description, prompt user to complete current workflow first)
```

## Creation Mode: Stage Definitions

```
01-analysis     -> Requirement Analysis
02-architecture -> Architecture Design
03-planning     -> Task Planning
04-codegen      -> Code Generation
05-assets       -> Asset Generation (auto-detected, skipped if no requirements)
06-integration  -> Project Integration
```

## Change Mode: Stage Definitions

```
01-change-analysis      -> Change Impact Analysis
02-change-planning      -> Change Task Planning
03-change-codegen       -> Change Code Implementation
04-change-verification  -> Change Verification
```

## Execution Protocol

### 1. Initialize Workflow State

Read `.claude/thinking/{AppName}/workflow.json`:

- **File does not exist** (creation mode):
  1. Create directory `.claude/thinking/{AppName}/outputs/`
  2. Create `workflow.json` with mode set to `create`, all stages set to `pending`, `currentStage` set to `01-analysis`
  3. Record user Description in the `description` field of `workflow.json`

- **File exists + Has Description + All completed** (change mode):
  1. Update `workflow.json`, change mode to `change`
  2. Replace stages with the 4 change mode stages, all stages set to `pending`
  3. Set `currentStage` to `01-change-analysis`
  4. Record new Description in the `changeDescription` field (keep original `description` unchanged)

- **File exists + No Description** (resume mode):
  1. Read `currentStage`, continue from that stage
  2. If `--from=XX` is passed, reset the target stage and all subsequent stages to `pending`, update `currentStage`

### workflow.json Structure

Creation mode:
```json
{
  "appName": "{AppName}",
  "mode": "create",
  "description": "User's original requirement description",
  "currentStage": "01-analysis",
  "stages": {
    "01-analysis":     { "status": "pending", "outputFile": "outputs/requirement-breakdown.json" },
    "02-architecture": { "status": "pending", "outputFile": "outputs/solution-design.json" },
    "03-planning":     { "status": "pending", "outputFile": "outputs/workflow-todolist.json" },
    "04-codegen":      { "status": "pending", "outputFile": null },
    "05-assets":       { "status": "pending", "outputFile": "outputs/asset-manifest.json" },
    "06-integration":  { "status": "pending", "outputFile": null }
  },
  "createdAt": "",
  "updatedAt": ""
}
```

Change mode:
```json
{
  "appName": "{AppName}",
  "mode": "change",
  "description": "User's original requirement description (from creation)",
  "changeDescription": "Current change requirement description",
  "currentStage": "01-change-analysis",
  "stages": {
    "01-change-analysis":     { "status": "pending", "outputFile": "outputs/change-analysis.json" },
    "02-change-planning":     { "status": "pending", "outputFile": "outputs/change-todolist.json" },
    "03-change-codegen":      { "status": "pending", "outputFile": null },
    "04-change-verification": { "status": "pending", "outputFile": null }
  },
  "createdAt": "",
  "updatedAt": ""
}
```

### 2. Stage Execution Loop

Execute the following steps for `currentStage`, advance to the next stage upon completion, until all stages are completed:

#### 2a. Load Stage Definition

Read `.claude/workflow/stages/{currentStage}.md`, parse from frontmatter:
- `requires_rules`: List of rule files to read
- `requires_outputs`: List of preceding artifacts to read
- `produces`: Artifact filename produced by this stage

#### 2b. Load Dependencies

- Read each file in `requires_rules`: `.claude/workflow/rules/{rule}`
- Read each file in `requires_outputs`: `.claude/thinking/{AppName}/outputs/{output}`
- These contents serve as input context for the current stage

#### 2c. Execute Stage Instructions

Execute according to the workflow defined in the stage definition file.

#### 2d. Save Artifacts & Advance State

- If `produces` is non-empty, confirm artifacts have been written to `.claude/thinking/{AppName}/outputs/`
- Update `workflow.json`:
  - Current stage `status` -> `completed`
  - Next stage `status` -> `in_progress`
  - `currentStage` -> next stage ID
  - `updatedAt` -> current time
- If this is the last stage, mark as `completed` and output completion report

### 3. Completion Report

#### Creation Mode Completion Report

```
Workflow completed: {AppName}
Access URL: http://localhost:3000/{app-name}
Artifacts directory: .claude/thinking/{AppName}/outputs/
Stage duration: (list status of each stage)
```

#### Change Mode Completion Report

```
Change completed: {AppName}
Change type: {changeType}
Change summary: {summary}
Access URL: http://localhost:3000/{app-name}
Build status: pnpm build passed
Changed files: Added {N} / Modified {M} / Deleted {K}
```

After the change is completed, restore the `workflow.json` mode to `create` and restore stages to the 5 creation mode stages (all `completed`), so that the next change can be correctly identified.

## Error Handling

- If any stage execution fails: record the error in the thinking file, keep the current stage as `in_progress` in `workflow.json`
- User can resume the failed stage via `/vibe {AppName}`
- User can re-run from a specified stage via `/vibe {AppName} --from=XX`
