# Data Interaction Rules

All data interactions must use APIs exported from `@/lib`; directly calling `@gui/vibe-container` is prohibited.

---

## 1. Lifecycle Reporting

```typescript
import { reportLifecycle } from '@/lib';
import { AppLifecycle } from '@gui/vibe-container';
// Only report in index.tsx: DOM_READY → READY (or ERROR)
```

---

## 2. Action System

**Actions = App methods callable by the Agent**. Each App defines `APP_ID` in `actions/constants.ts` and must pass it to `reportAction` and `useAgentActionListener`.

### 2.1 Four Categories

| Category | Semantics | Handling | Examples |
|------|------|----------|------|
| **Operation** | Execute method directly | Execute → refresh Repo if data mismatch → retry once | `PLAY_TRACK`, `SET_VOLUME` |
| **Data Mutation** | Agent has already written data | Directly refresh corresponding Repo | `CREATE_TRACK`, `DELETE_TRACK` |
| **Refresh** | Reload Repo data | Optional navigation → refresh Repo | `REFRESH_TRACKS` |
| **System** | System-level sync | See 2.6 SYNC_STATE | `SYNC_STATE` |

### 2.2 Reporting & Listening

```typescript
import { reportAction, useAgentActionListener } from '@/lib';
import { APP_ID } from './actions/constants';

// Report: signature is reportAction(appId, actionType, params?)
reportAction(APP_ID, 'PLAY_TRACK', { trackId: '123' });

// Listen: signature is useAgentActionListener(appId, handler)
useAgentActionListener(APP_ID, async (action) => {
  switch (action.action_type) {
    case 'PLAY_TRACK': {
      let track = repo.getById(action.params.trackId);
      if (!track) { await repo.refresh(); track = repo.getById(action.params.trackId); }
      if (!track) return 'error: track not found';
      playTrack(track);
      return 'success';
    }
    case 'CREATE_TRACK': { await repo.refresh(); return 'success'; }
    case 'REFRESH_TRACKS': { await repo.refresh(); return 'success'; }
  }
});
```

> **⚠️ Do NOT call `reportAction` inside Agent-dispatched Action handlers**
>
> The `sendResult` mechanism of `useAgentActionListener` already automatically sends the `action_result` back to the Agent.
> If the handler also calls `reportAction`, the Agent will receive **two** identical Action messages (one from `reportAction`, one from `sendResult`), causing duplicate reporting.
>
> **Correct approach**: Business functions (e.g., `handlePlaceStone`) accept a `fromAgent` parameter; pass `true` when triggered by the Agent to skip `reportAction`; default to `false` for user operations to report normally.
>
> ```typescript
> // ✅ Correct: business function distinguishes call source
> const handlePlay = useCallback((trackId: string, fromAgent = false) => {
>   doPlay(trackId);
>   if (!fromAgent) {
>     reportAction(APP_ID, 'PLAY_TRACK', { trackId });
>   }
> }, [...]);
>
> // Agent handler passes fromAgent=true
> case 'PLAY_TRACK': { handlePlay(params.trackId, true); return 'success'; }
>
> // ❌ Wrong: Agent handler calls reportAction causing duplicate reporting
> case 'PLAY_TRACK': { handlePlay(params.trackId); return 'success'; }
> // handlePlay unconditionally calls reportAction → duplicates sendResult
> ```

### 2.3 Design Requirements

- Each Collection must have `CREATE/UPDATE/DELETE_{COLLECTION}` + `REFRESH_{COLLECTION}`
- Each Repo must implement a `refresh()` method
- `action_type` uses `UPPER_SNAKE_CASE`, `params` type is `Record<string, string>`
- handler returns `string | void`, return `'error: {reason}'` on failure

### 2.4 SYNC_STATE (must be implemented when state.json is enabled)

Agent writes state.json → sends SYNC_STATE → App calls `initFromCloud()` → reads state.json → applies fields to dispatch one by one.
- Must call `initFromCloud()` before reading | Defensive field updates (missing fields are not overwritten) | No params
- **Must check if state.json exists via `listFiles` before first access**: Before reading state.json during initialization, first call `api.listFiles('/')` to get the root directory file list and check if `state.json` exists. If it doesn't exist, initialize with default state and write state.json to avoid invalid reads of non-existent files.

```typescript
// ✅ Correct: check if state.json exists via listFiles before first access
const initState = async () => {
  const rootFiles = await api.listFiles('/');
  const stateExists = rootFiles.some((f) => f.name === 'state.json');
  if (stateExists) {
    try {
      const result = await api.readFile('/state.json');
      if (result.content) {
        const parsed = typeof result.content === 'string'
          ? JSON.parse(result.content) : result.content;
        applyState(parsed);
      }
    } catch {
      // Read failed, ignore
    }
  } else {
    // state.json does not exist, initialize with default state and write
    await api.writeFile('/state.json', defaultState);
    applyState(defaultState);
  }
};

// ❌ Wrong: reading directly without checking, causing invalid access and unhandled exceptions
const state = JSON.parse(await api.readFile('/state.json'));
```

> **⚠️ `readFile` content may be string or parsed object**
>
> `api.readFile()` returns `{ content, metadata }`. Depending on the storage backend, `content` may be a **string** or an **already-parsed object**.
> Always use a type guard before `JSON.parse`:
>
> ```typescript
> // ✅ Correct: defensive parse
> const data = typeof result.content === 'string'
>   ? JSON.parse(result.content) : result.content;
>
> // ❌ Wrong: JSON.parse on an object throws SyntaxError (silently swallowed by catch)
> const data = JSON.parse(result.content);
> ```
```

### 2.5 constants.ts Organization

Organize by category: `OperationActions` / `MutationActions` / `RefreshActions` / `SystemActions` → merge into `ActionTypes`.

---

## 3. File Operations

All paths are **relative paths**; lib automatically prepends the NAS absolute path.

### 3.1 Recommended: createAppFileApi

```typescript
import { createAppFileApi } from '@/lib';
const api = createAppFileApi('twitter');
await api.listFiles('/');                    // → apps/twitter/data
await api.readFile('/posts/001.json');       // → apps/twitter/data/posts/001.json
await api.writeFile('/posts/001.json', data);
await api.deleteFile('/posts/001.json');
```

### 3.2 In-Memory File System FileSystemStore

```typescript
import { createFileSystemStore, createAppFileApi } from '@/lib';
const store = createFileSystemStore(createAppFileApi('myApp'));
await store.initFromCloud();
const node = store.getByPath('/data/posts/001.json');
```

### 3.3 React Hooks

```typescript
import { useFileSystem, useFilePath, useFolderChildren } from '@/lib';
```

### 3.4 Rules

- Do not concatenate `/nas/{AppName}` | Do not directly call `getClientComManager()` low-level methods
- Multi-file reads must use `batchConcurrent` (see `concurrent-execution.md`)
- Batch writes use `putTextFiles` | Components should prefer React Hooks

---

## 4. Utility Functions

```typescript
import { generateId, normalizePath, getFileName, getParentPath, getDirPath } from '@/lib';
```

---

## 5. Vibe Environment Info

```typescript
import { fetchVibeInfo, getVibeInfo, useVibeInfo } from '@/lib';
// Call fetchVibeInfo() once during initialization (automatically syncs language to i18n)
// Subsequently use getVibeInfo() (sync) or useVibeInfo() (Hook) to consume cache
```

**i18n Rules**:
- Language comes from `systemSettings.language.current`; using `navigator.language` is prohibited
- Each App uses an independent namespace: `useTranslation('musicApp')` (empty params prohibited)
- Language codes need `normalizeLang()` to map to short codes

---

## Prohibited Practices

| Prohibited | Correct Approach |
|------|----------|
| Directly importing `@gui/vibe-container` for file/message operations | Use `@/lib` wrappers |
| Using `postMessage` / `sendAgentMessage` directly | Use `reportLifecycle` / `reportAction` |
| Calling `reportAction` / `useAgentActionListener` without `APP_ID` | Must pass `APP_ID` from `actions/constants.ts` as first argument |
| `JSON.parse(result.content)` without type check | Use `typeof content === 'string' ? JSON.parse(content) : content` |
| Path concatenation `/nas/{AppName}` | Use relative paths |
| Child components reporting lifecycle | Only in `index.tsx` |
| `useTranslation()` without specifying namespace | Must specify namespace |
