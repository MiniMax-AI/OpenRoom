---
requires_rules:
  - guide-md.md
  - meta-yaml.md
requires_outputs:
  - solution-design.json
produces: []
---

# VibeApp Project Integration

You are a frontend integration engineer. Integrate the generated VibeApp into the main project router, generate sample data and interface documentation.

**Prerequisites**: See `app-definition.md` for the runtime model (read on demand), `data-interaction.md` (always loaded) for data interaction.

---

## Phase 1: System Integration

### Step 1: Dependency Check

Ensure installed (install with `pnpm add -w` if missing): `lucide-react`, `clsx`, `tailwind-merge`

### Step 2: Route Registration

Add to `src/routers/index.tsx`:

```typescript
const {AppName} = lazy(() => import('@/pages/{AppName}'));
// Add to routerList:
{ path: '/{app-name}', element: <React.Suspense fallback={<div>Loading...</div>}><{AppName} /></React.Suspense> }
```

Naming: Route `/{app-name}` (kebab-case) | Component `{AppName}` (PascalCase)

### Step 2.5: App Registry Registration

Add to `APP_STATIC_REGISTRY` in `src/lib/appRegistry.ts`:

```typescript
{
  appId: {next_available_id},  // Increment from the last existing appId
  appName: '{appName}',        // camelCase, must match APP_NAME in actions/constants.ts
  route: '/{app-name}',       // Must match the route registered in Step 2
  displayName: '{App Name}',  // Human-readable name shown on desktop
  sourceDir: '{AppName}',     // PascalCase, matches the directory name under src/pages/
  icon: '{LucideIconName}',   // Lucide icon name (e.g. 'CheckSquare', 'Music', 'Mail')
  color: '{hex_color}',       // Desktop icon color
  defaultSize: { width: N, height: M },
},
```

**Critical**: Without this registration, the app will NOT appear on the desktop, Agent actions will NOT be routed to it, and OPEN_APP will not list it.

### Step 3: Lint Check

Run `pnpm run lint`, fix all errors/warnings (unused-vars, eqeqeq, exhaustive-deps, etc.), confirm 0 errors.

### Step 4: Build Verification

`pnpm build` no errors -> `pnpm dev` -> Visit `http://localhost:3000/{app-name}`, confirm no white screen, styles normal, interactions responsive.

---

## Phase 2: Deliverable Generation

### Step 5: Sample Data (Seed Data)

Generate pure JSON sample data under `src/pages/{AppName}/data/`, structure consistent with NAS storage directory, 3-5 items per collection.

| Directory | Purpose | Format |
|-----------|---------|--------|
| `data/` | Sample data deployed to NAS | Pure JSON |
| `mock/` | Code import during development | TypeScript |

### Step 6: Storage Guide (guide.md)

Generate bilingual versions (`meta/meta_cn/guide.md` + `meta/meta_en/guide.md`), see loaded `guide-md.md` rule for full specification.

### Step 7: App Metadata (meta.yaml)

Generate bilingual versions (`meta/meta_cn/meta.yaml` + `meta/meta_en/meta.yaml`), see loaded `meta-yaml.md` rule for full specification.

---

## Output Report

```text
Integration complete: {AppName}
Access URL: http://localhost:3000/{app-name}
Build status: pnpm build passed
Deliverables:
  - data/     {N} sample data items
  - mock/     Local development mock data
  - meta_cn/  Chinese guide.md + meta.yaml
  - meta_en/  English guide.md + meta.yaml
Route registered: src/routers/index.tsx
App registered: src/lib/appRegistry.ts (appId: {N})
```

## After Completion

Update workflow.json, mark 05-integration as completed. Entire workflow complete.
