/**
 * IndexedDB File Storage
 * Replaces cloud NAS with a local persistent file system
 */

const DB_NAME = 'webuiapps-fs';
const DB_VERSION = 1;
const STORE_NAME = 'files';

interface FileEntry {
  path: string;
  content: string;
  isFolder: boolean;
  size: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  try {
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  } catch {
    // DB was externally deleted or corrupted — close old connection, delete DB, rebuild
    try {
      db.close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
    await new Promise<void>((resolve, reject) => {
      const delReq = indexedDB.deleteDatabase(DB_NAME);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
      delReq.onblocked = () => resolve(); // best-effort continue
    });
    const db2 = await openDB();
    return db2.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Ensure all parent directories along the path exist */
async function ensureParentDirs(filePath: string): Promise<void> {
  const parts = filePath.split('/').filter(Boolean);
  const store = await tx('readwrite');
  for (let i = 1; i < parts.length; i++) {
    const dirPath = parts.slice(0, i).join('/');
    const existing = await req(store.get(dirPath));
    if (!existing) {
      await req(
        store.put({
          path: dirPath,
          content: '',
          isFolder: true,
          size: 0,
          updatedAt: Date.now(),
        }),
      );
    }
  }
}

/**
 * Adapts to cloud listFiles response format
 * Returns { files: [{ path, type, size }], not_exists: false }
 */
export async function listFiles(dirPath: string): Promise<{
  files: Array<{ path: string; type: number; size?: number }>;
  not_exists: boolean;
}> {
  const store = await tx('readonly');
  const all = (await req(store.getAll())) as FileEntry[];

  // List root directory when dirPath is empty or "/"
  const prefix = dirPath === '' || dirPath === '/' ? '' : dirPath.replace(/\/$/, '');
  const children: Array<{ path: string; type: number; size?: number }> = [];
  const seen = new Set<string>();

  for (const entry of all) {
    const entryPath = entry.path;
    if (prefix === '') {
      // Root directory: take the first segment
      const firstSegment = entryPath.split('/')[0];
      if (firstSegment && !seen.has(firstSegment)) {
        seen.add(firstSegment);
        // Determine if it's a file or directory
        if (entryPath === firstSegment && !entry.isFolder) {
          children.push({ path: firstSegment, type: 0, size: entry.size });
        } else {
          children.push({ path: firstSegment, type: 1 });
        }
      }
    } else if (entryPath.startsWith(prefix + '/')) {
      const rest = entryPath.slice(prefix.length + 1);
      const firstSegment = rest.split('/')[0];
      if (firstSegment && !seen.has(firstSegment)) {
        seen.add(firstSegment);
        const childFullPath = prefix + '/' + firstSegment;
        if (entryPath === childFullPath && !entry.isFolder) {
          children.push({ path: childFullPath, type: 0, size: entry.size });
        } else {
          children.push({ path: childFullPath, type: 1 });
        }
      }
    }
  }

  return { files: children, not_exists: false };
}

/**
 * Adapts to cloud getFile response format
 * Returns file content string, or null if not found
 */
export async function getFile(filePath: string): Promise<unknown> {
  const store = await tx('readonly');
  const entry = (await req(store.get(filePath))) as FileEntry | undefined;
  if (!entry || entry.isFolder) return null;
  // Try to parse JSON, consistent with cloud behavior
  try {
    return JSON.parse(entry.content);
  } catch {
    if (filePath.endsWith('.json')) {
      // Try to extract JSON (from markdown code blocks, etc.)
      const extracted = extractJsonFromContent(entry.content);
      try {
        return JSON.parse(extracted);
      } catch {
        // still failed
      }
    }
    return entry.content;
  }
}

/**
 * Extract JSON from content that may be wrapped in markdown code blocks or other text
 */
function extractJsonFromContent(raw: string): string {
  const trimmed = raw.trim();

  // markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Extract the first { ... } or [ ... ]
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let start = -1;
  let open = '{';
  let close = '}';
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
    open = '[';
    close = ']';
  }
  if (start >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\' && inStr) {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return raw;
}

/**
 * Adapts to cloud putTextFilesByJSON
 * files: [{ path: "directory path", name: "file name", content: "content" }]
 */
export async function putTextFilesByJSON(data: {
  files: Array<{ path?: string; name?: string; content?: string }>;
}): Promise<void> {
  for (const file of data.files) {
    const fullPath = file.path ? `${file.path}/${file.name}` : file.name || '';
    await ensureParentDirs(fullPath);
    const store = await tx('readwrite');
    await req(
      store.put({
        path: fullPath,
        content: file.content || '',
        isFolder: false,
        size: (file.content || '').length,
        updatedAt: Date.now(),
      }),
    );
  }
}

/**
 * Adapts to cloud deleteFilesByPaths
 */
export async function deleteFilesByPaths(data: { file_paths: string[] }): Promise<void> {
  const store = await tx('readwrite');
  for (const filePath of data.file_paths) {
    await req(store.delete(filePath));
  }
}

/**
 * Adapts to cloud searchFiles
 */
export async function searchFiles(data: { query: string }): Promise<unknown[]> {
  const store = await tx('readonly');
  const all = (await req(store.getAll())) as FileEntry[];
  const q = data.query.toLowerCase();
  return all
    .filter((e) => !e.isFolder && e.path.toLowerCase().includes(q))
    .map((e) => ({
      id: '',
      name: e.path.split('/').pop() || '',
      path: '/' + e.path,
      type: 'file',
      parentId: null,
      metadata: { size: e.size },
    }));
}
