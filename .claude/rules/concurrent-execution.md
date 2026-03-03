# Concurrent Execution Rules

All multi-file async operations must be executed concurrently; serial `await` is prohibited. **Concurrency limit is 6**; exceeding this requires batching.

---

## 1. Core Tool: `batchConcurrent`

```typescript
import { batchConcurrent } from '@/lib';

// Basic usage: automatically batches 6 at a time
const results = await batchConcurrent(items, (item) => api.readFile(item.path));

// With progressive callback
await batchConcurrent(jsonFiles, (file) => api.readFile(file.path), {
  onBatch: (batchResults, startIndex) => { /* parse and append to UI */ },
});
```

**Signature**: `batchConcurrent<T, R>(items, fn, options?: { batchSize?: number; onBatch?: callback })`
- Uses `Promise.allSettled` internally, a single failure does not block | Default batchSize=6

---

## 2. Two-Layer Concurrent Loading (initialization loadData)

```typescript
// Layer 1: Concurrent directory listing (≤ 6, use Promise.all directly)
const [songFiles, playlistFiles] = await Promise.all([
  api.listFiles(SONGS_DIR), api.listFiles(PLAYLISTS_DIR),
]);

// Merge → Layer 2: Batch read, progressively update UI per batch
const allFiles = [
  ...songJsonFiles.map(f => ({ file: f, collection: 'song' as const })),
  ...playlistJsonFiles.map(f => ({ file: f, collection: 'playlist' as const })),
];
await batchConcurrent(allFiles, (item) => api.readFile(item.file.path), {
  onBatch: (batchResults, startIndex) => {
    // Parse and categorize → setSongs([...loaded]) / setPlaylists([...loaded])
  },
});
```

---

## 3. Single Collection Refresh / Batch Write

```typescript
// Single collection refresh: batchConcurrent + onBatch progressive display
const refreshSongs = async () => {
  const loaded: Song[] = [];
  await batchConcurrent(jsonFiles, (file) => api.readFile(file.path), {
    onBatch: (batchResults) => { /* parse and append to loaded → setSongs([...loaded]) */ },
  });
  return loaded;
};

// Batch write: batchConcurrent rate limiting (prefer putTextFiles)
await batchConcurrent(SEED_SONGS, (song) => api.writeFile(`${SONGS_DIR}/${song.id}.json`, song));
```

---

## 4. Selection Strategy

| Scenario | API |
|------|-----|
| Directory listing (≤ 6) | `Promise.all` |
| Multi-file read (possibly > 6) | `batchConcurrent` + `onBatch` |
| Batch write (no batch API) | `batchConcurrent` |
| Batch write (has batch API) | `putTextFiles` |

---

## 5. Progressive Loading (all Apps must implement)

**Exit loading immediately** after the first batch of data arrives; subsequent batches append and render.

```typescript
const [isLoading, setIsLoading] = useState(true);
let firstBatchRendered = false;

await batchConcurrent(allFiles, (item) => api.readFile(item.file.path), {
  onBatch: (batchResults, startIndex) => {
    // Parse and append → setState
    if (!firstBatchRendered && hasData) {
      firstBatchRendered = true;
      setIsLoading(false); // ★ Exit loading on first batch
    }
  },
});
if (!firstBatchRendered) setIsLoading(false); // Fall back to seed data when no data exists
```

**Rules**:
- `loadData` controls `isLoading` internally; outer layer should not set it redundantly
- refresh functions should also `setState` in each `onBatch` callback

---

## Prohibited Practices

```typescript
// ❌ Serial directory listing / file reading
const songs = await api.listFiles(SONGS_DIR);
const playlists = await api.listFiles(PLAYLISTS_DIR);
for (const file of files) { await api.readFile(file.path); }

// ❌ Unlimited concurrency (when > 6 files)
await Promise.all(files.map(f => api.readFile(f.path)));

// ✅ Correct
const results = await batchConcurrent(files, (f) => api.readFile(f.path));
```
