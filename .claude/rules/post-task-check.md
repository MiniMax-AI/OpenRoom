# Post-Task Check Rule

After completing each user code modification request, the following check process must be executed:

## 1. Lint Check

Run `pnpm run lint` to check code standards:

- If there are errors, fix them immediately
- Common issues: unused imports, `==` should be `===`, missing dependency arrays, etc.

## 2. Build Verification

Run `pnpm build` to confirm no compilation errors.

## 3. Documentation Sync Check

If modifications involve the following, the corresponding documentation must be updated:

| Modification Type | Documentation to Update |
|---------|---------------|
| Data structure changes (type definitions) | Data Schemas in `meta/guide.md` |
| New/modified Actions | actions in `meta/meta.yaml` + Action handler complies with `data-interaction.md` Section 2 |
| State structure changes (PlayerState/AppState) | State definitions in `meta/guide.md` |
| Storage path changes | Directory structure in `meta/guide.md` + storage in `meta/meta.yaml` |
| New fields | `types.ts` + field table in `meta/guide.md` |

## 4. Functional Review

After code generation or modification is complete, a functional review must be performed:

1. **Review all code changes**, inspect each file's modifications
2. **Simulate core user operation paths**, mentally walk through the complete interaction flow, check whether the logic works correctly at runtime
3. **Fix issues immediately upon discovery**, do not defer to later steps

## 5. Execution Timing

- **Must execute**: Modifications involving type definitions, data structures, Actions
- **Optional**: Pure UI style adjustments, comment modifications

## 6. Checklist

```
[ ] pnpm run lint - passed
[ ] pnpm build - passed
[ ] Functional Review - review code + simulate operation paths, confirm logic is correct
[ ] types.ts and guide.md field definitions are consistent
[ ] constants.ts and meta.yaml actions are consistent
[ ] Directory structure description matches actual code
[ ] Action handler complies with `data-interaction.md` Section 2 (four categories covered, retry, SYNC_STATE)
[ ] Every Repository implements a refresh() method
```
