---
requires_rules:
  - app-definition.md
  - responsive-layout.md
requires_outputs:
  - solution-design.json
  - workflow-todolist.json
produces: []
---

# VibeApp Code Generation

You are a code generation expert. Execute tasks from `WorkflowTodoList` in order, generating high-quality code.

**Prerequisites**: See `app-definition.md` for the runtime model, `data-interaction.md` (always loaded) for data interaction APIs, and `SolutionDesign` JSON for component layering.

---

## Workflow

### Step 0: Create Execution Log (Required)

Create `.claude/thinking/{AppName}/04-code-generation.md`, recording executed task IDs, issues, and solutions.

### Step 1: Execute Tasks in Order

| action.type | Handling |
|-------------|----------|
| `run_command` | Execute shell command |
| `create_file` | Create file, write content |
| `generate_code` | Generate Components/Hooks/Repository/Store |
| `generate_h5_page` | Generate page-level UI |
| `update_file` | Modify existing file |

### Step 2: Per-Task Verification

After completing each task: File exists and is non-empty -> All imports come from `@/lib` -> On failure, log and auto-fix once.

### Step 3: Checkpoint Acceptance

After all tasks for a Checkpoint are complete, execute `checks`. If not passed, backtrack and fix.

---

## Code Standards

### Styling
- **Desktop minimalist premium style** (reference Apple Music, Linear)
- H5 pages: Tailwind CSS (CDN) + inline JS | React components: CSS Modules + CSS Variables
- Icons only from `lucide-react`, emoji prohibited

### Data Interaction
All interactions follow `data-interaction.md`: `reportAction(APP_ID, ...)` reporting, `useAgentActionListener(APP_ID, ...)` listening (four Action categories), lifecycle only in `index.tsx`, file operations use relative paths.

### APP_ID Assignment
Before generating `actions/constants.ts`, **read `src/lib/appRegistry.ts`** to find the highest existing `appId` in `APP_STATIC_REGISTRY`, then assign `APP_ID = max + 1`. Never hardcode or guess the ID.

### Quality Requirements
- **Complete implementation, no mocking**: Mock/placeholder/hardcoded/TODO/empty function bodies are prohibited. All features must be genuinely functional
- Props type definitions | try-catch async operations | Empty state handling | All interactive elements call `reportAction`
- Action implementation complies with full `data-interaction.md` Section 2 specification

### File Placement
- `data/` for pure JSON only | `mock/` for TypeScript mocks | `types.ts` at page root directory | `meta.yaml` follows `meta-yaml.md` specification

---

## Input/Output

**Input**: `WorkflowTodoList` JSON + `SolutionDesign` JSON
**Output**: Generated code files + execution log `.claude/thinking/{AppName}/04-code-generation.md`
