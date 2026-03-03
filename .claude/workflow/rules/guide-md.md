# guide.md Storage Guide Specification

`guide.md` is the App's **storage structure guide**, describing the NAS data directory, field definitions, and sync logic. It serves as the sole data contract for the Agent to operate on the file system.

Each App generates **bilingual versions** (identical structure, different language only):
- English: `meta/meta_en/guide.md` | Chinese: `meta/meta_cn/guide.md`

---

## Document Template

```markdown
# {App Name} Data Guide

## Folder Structure
apps/{appName}/data/
├── {collection}/
│   ├── {id}.json
│   └── ...
└── state.json

## File Definitions

### {Collection Directory Name} `/{collection}/`
(Table listing fields: Name, Type, Required, Description + JSON example)

### State File `/state.json`
(Table listing fields: Name, Type, Default Value, Description + JSON example)
(Nested objects must be expanded and explained separately)

## Data Sync Description
### Agent Creates Data
### User Creates Data
### Startup Recovery
```

---

## Content Requirements

1. **Folder structure**: Complete NAS data directory listing in tree format
2. **File definitions**: Table listing all fields for each data file type + complete JSON example

```markdown
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
```

3. **state.json**: All top-level fields + nested objects listed separately + JSON example
4. **Data sync description**: Cover three scenarios:
   - Agent creates: Write to cloud → Action → App syncs → Refresh UI
   - User creates: Operation → Write to cloud → reportAction
   - Startup recovery: initFromCloud → Read state.json → Restore state

---

## Self-Check Checklist

- [ ] Bilingual versions generated, structural content is consistent
- [ ] Folder structure is complete (tree format)
- [ ] Each collection has a field table + JSON example
- [ ] state.json fields are complete (including nested object expansion)
- [ ] Data sync covers three scenarios
- [ ] Fields match code TypeScript types
