---
requires_rules:
  - app-definition.md
  - responsive-layout.md
requires_outputs:
  - change-analysis.json
  - change-todolist.json
  - solution-design.json
produces: []
---

# VibeApp Change Code Implementation

You are a code generation expert. Execute tasks from `ChangeTodoList` in order, performing incremental code modifications on the existing App.

**Prerequisites**: See `app-definition.md` for the runtime model, `data-interaction.md` (always loaded) for data interaction APIs.

---

## Core Principles

1. **Precise Modifications**: Only modify files specified in ChangeTodoList, do not touch unrelated code
2. **Maintain Consistency**: New code style must match existing code (naming, indentation, patterns)
3. **Backward Compatibility**: Ensure existing data won't break when modifying data models
4. **Complete Implementation**: Mock/placeholder/TODO/empty function bodies are prohibited

---

## Workflow

### Step 0: Create Execution Log (Required)

Create `.claude/thinking/{AppName}/03-change-codegen.md` (overwrite existing), recording executed task IDs, issues, and solutions.

### Step 1: Read Existing Code Context

Before modifying any file, read its complete content first to understand:
- Existing code structure and style
- Import/export relationships
- Dependencies with other components

### Step 2: Execute Tasks in Order

Execute sequentially per `ChangeTodoList.tasks`:

| action | Handling |
|--------|----------|
| `modify` | Read existing file -> Locate modification point -> Incremental edit (use Edit tool) |
| `create` | Reference style of existing files in same directory -> Create new file |
| `delete` | Delete file -> Clean up related import references |

**Requirements when modifying existing files**:
- Use Edit tool for precise replacements, do not rewrite entire files
- Preserve existing code comments and formatting style
- Place new import statements near similar imports
- Place new components/functions near similar code

### Step 3: Per-Task Verification

After completing each task, check:
- File syntax is correct (no obvious TS errors)
- Import paths are correct
- Exports are complete (if the module is referenced by other files)

### Step 4: Regression Check

Execute each check in `ChangeTodoList.regressionChecks`:
- Confirm imports/exports of affected components are not broken
- Confirm Seed Data is consistent with data models
- If data models changed, update JSON files under `data/`

---

## Code Standards

Same as creation mode (see 04-codegen.md):
- H5 pages use Tailwind CSS, React components use CSS Modules
- Icons only from `lucide-react`, emoji prohibited
- All data operations through `@/lib`
- All interactive elements call `reportAction`
- Action implementation complies with `data-interaction.md` specification
- Props type definitions | try-catch async operations | Empty state handling

---

## Input/Output

**Input**: `ChangeTodoList` JSON + `ChangeAnalysis` JSON + `SolutionDesign` JSON
**Output**: Modified code files + execution log `.claude/thinking/{AppName}/03-change-codegen.md`
