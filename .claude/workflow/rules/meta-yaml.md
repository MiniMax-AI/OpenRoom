# meta.yaml Definition Specification

`meta.yaml` is the App's **core metadata file**, defining application information and Agent → frontend operation commands.

Each App generates **bilingual versions** (identical structure, only descriptive fields differ in language):
- English: `meta/meta_en/meta.yaml` | Chinese: `meta/meta_cn/meta.yaml`

---

## Field Structure

### Top-Level Fields

| Field | Type | Description |
|------|------|------|
| app_id | integer | Globally unique ID |
| app_name | string | Lowercase English, consistent with `createAppFileApi(APP_NAME)` |
| app_display_name | string | UI display name |
| version | string | Semantic version number |
| description | string | **Agent-facing technical description**: Data storage structure, Action communication protocol, technical capability boundaries, etc., helping the Agent understand how to interact with the App |
| displayDesc | string | **User-facing app store description**: Concise, attractive, highlighting core features and use cases, no technical details |
| actions | array | Agent → frontend command list |

### action Fields

| Field | Required | Description |
|------|------|------|
| type | Yes | `UPPER_SNAKE_CASE`, consistent with `reportAction` in code |
| name | Yes | Human-readable name |
| description | Yes | Trigger prerequisites and frontend response behavior |
| params | No | Parameter list (each item contains name/type/description/required) |

---

## File Template

```yaml
app_id: <integer>
app_name: <lowercase_name>
app_display_name: <Display Name>
version: "<semver>"
description: >
  Agent-facing technical description: which directories data is stored in, which Actions are supported, technical capability boundaries.
  This file only defines operation commands sent from the Agent to the frontend.
displayDesc: >
  User-facing app store description, concise and attractive, highlighting core features and use cases.

actions:
  - type: ACTION_TYPE
    name: Operation Name
    description: >
      Under what scenario the Agent sends this action, and what operation the frontend executes upon receiving it.
    params:
      - name: paramName
        type: string
        description: Parameter description
        required: true
```

---

## Core Design Principles

Actions are **only for Agent → frontend commands**; the Agent **has already completed cloud file writing** before sending:

- **Create/Update types**: params carry `filePath`, frontend reads from cloud
- **Delete types**: params carry entity ID (e.g., `postId`), frontend removes locally
- **Do not pass complete data**: frontend reads from cloud independently

```typescript
// ✅ Agent handler: read + refresh UI
case 'CREATE_POST': {
  const post = await syncFromCloud(action.params.filePath);
  updateUI(post);
  return 'success';
}
```

---

## Self-Check Checklist

- [ ] Bilingual versions generated, structural fields are consistent
- [ ] Top-level fields complete (app_id/app_name/version/description/displayDesc/actions)
- [ ] Each action contains type/name/description
- [ ] Each param contains name/type/description/required
- [ ] Create/update types have `filePath` in params, delete types have entity ID
- [ ] action type matches code
