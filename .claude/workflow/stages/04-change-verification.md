---
requires_rules:
  - guide-md.md
  - meta-yaml.md
requires_outputs:
  - change-analysis.json
  - solution-design.json
produces: []
---

# VibeApp Change Verification

You are a frontend quality engineer. Verify the correctness of changed code, ensure build passes and existing functionality is not broken.

---

## Workflow

### Step 1: Lint Check

Run `pnpm run lint`, fix all errors/warnings, confirm 0 errors.

### Step 2: Build Verification

Run `pnpm build`, confirm no compilation errors.

### Step 3: Runtime Verification

Run `pnpm dev`, confirm:
- No white screen
- New features work correctly
- Existing features not broken

### Step 4: Update Deliverables (If Needed)

Based on `ChangeAnalysis.changeType`, determine what needs updating:

| changeType | Update Seed Data | Update guide.md | Update meta.yaml |
|------------|-----------------|-----------------|-------------------|
| `ui-tweak` | No | No | No |
| `feature-enhance` | Maybe | Yes | Maybe |
| `feature-add` | Yes | Yes | Yes |
| `architecture-change` | Yes | Yes | Yes |

- **Seed Data**: JSON files under `src/pages/{AppName}/data/` must be consistent with new data models
- **guide.md**: Bilingual versions (`meta/meta_cn/guide.md` + `meta/meta_en/guide.md`), see `guide-md.md` for specification
- **meta.yaml**: Bilingual versions (`meta/meta_cn/meta.yaml` + `meta/meta_en/meta.yaml`), see `meta-yaml.md` for specification

### Step 5: Final Checklist

| Category | Check Item | Status |
|----------|------------|--------|
| Build | `pnpm build` no errors | |
| Lint | `pnpm run lint` no errors | |
| Runtime | Page loads correctly | |
| New Features | Change requirements fully implemented | |
| Regression | Existing features not affected | |
| Data | Seed Data consistent with models | |
| Documentation | guide.md / meta.yaml updated (if needed) | |

---

## Output Report

```text
Change complete: {AppName}
Change type: {changeType}
Change summary: {summary}
Access URL: http://localhost:3000/{app-name}
Build status: pnpm build passed
Changed files:
  - Added: {N} files
  - Modified: {M} files
  - Deleted: {K} files
Deliverable updates:
  - Seed Data: Updated/No update needed
  - guide.md:  Updated/No update needed
  - meta.yaml: Updated/No update needed
```

## After Completion

Update workflow.json, mark 04-change-verification as completed. Change workflow complete.
