/**
 * Disk-based File Storage with localStorage fallback
 *
 * Uses dev-server session-data API when available (dev mode),
 * falls back to localStorage for static/production builds.
 *
 * Drop-in replacement for indexedDbStorage — all operations go through
 * the session-data API (Vite dev server middleware) which persists to
 * ~/.openroom/sessions/{charId}/{modId}/apps/...
 */

import { getSessionPath } from './sessionPath';

const API_PATH = '/api/session-data';
const LS_PREFIX = 'openroom_fs_';

/** Track whether API is available (cached after first check) */
let apiAvailable: boolean | null = null;

async function checkApi(): Promise<boolean> {
  if (apiAvailable !== null) return apiAvailable;
  try {
    const res = await fetch(`${API_PATH}?path=__ping__`, { method: 'GET' });
    apiAvailable = res.ok || res.status === 200;
  } catch {
    apiAvailable = false;
  }
  return apiAvailable;
}

/** Build localStorage key from file path */
function lsKey(fullPath: string): string {
  return `${LS_PREFIX}${fullPath.replace(/\//g, '|')}`;
}

/** List all localStorage keys that match a directory prefix */
function lsListDir(dirPrefix: string): Array<{ path: string; type: number; size?: number }> {
  const prefix = lsKey(dirPrefix);
  const results: Array<{ path: string; type: number; size?: number }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    // Get relative path after the prefix
    const relKey = key.slice(prefix.length);
    const relPath = relKey.replace(/\|/g, '/').replace(/^\//, '');
    if (!relPath) continue;

    // Only show direct children
    const slashIdx = relPath.indexOf('/');
    if (slashIdx === -1) {
      // File
      const val = localStorage.getItem(key) || '';
      results.push({
        path: dirPrefix ? `${dirPrefix}/${relPath}` : relPath,
        type: 0,
        size: val.length,
      });
    } else {
      // Directory (show first segment only)
      const dirName = relPath.slice(0, slashIdx);
      const dirPath = dirPrefix ? `${dirPrefix}/${dirName}` : dirName;
      if (!seen.has(dirPath)) {
        seen.add(dirPath);
        results.push({ path: dirPath, type: 1 });
      }
    }
  }
  return results;
}

/** Build the full API URL for a file path, scoped under current session's /apps/ directory */
function apiUrl(filePath: string, action?: string): string {
  const session = getSessionPath();
  const cleaned = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const alreadyPrefixed = cleaned.startsWith('apps/') || cleaned === 'apps';
  const fullPath = session
    ? alreadyPrefixed
      ? `${session}/${cleaned}`
      : `${session}/apps/${cleaned}`
    : alreadyPrefixed
      ? cleaned
      : `apps/${cleaned}`;
  let url = `${API_PATH}?path=${encodeURIComponent(fullPath)}`;
  if (action) url += `&action=${encodeURIComponent(action)}`;
  return url;
}

/** Whether the dev-server file API is reachable (cached). */
export function isApiAvailable(): Promise<boolean> {
  return checkApi();
}

/** URL that serves a stored file (path relative to the session's apps/ directory). */
export function fileUrl(filePath: string): string {
  return apiUrl(filePath);
}

/** Build the full storage path (same logic as apiUrl but returns path only) */
function storagePath(filePath: string): string {
  const session = getSessionPath();
  const cleaned = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const alreadyPrefixed = cleaned.startsWith('apps/') || cleaned === 'apps';
  return session
    ? alreadyPrefixed
      ? `${session}/${cleaned}`
      : `${session}/apps/${cleaned}`
    : alreadyPrefixed
      ? cleaned
      : `apps/${cleaned}`;
}

/**
 * List files in a directory.
 */
export async function listFiles(dirPath: string): Promise<{
  files: Array<{ path: string; type: number; size?: number }>;
  not_exists: boolean;
}> {
  if (await checkApi()) {
    try {
      const res = await fetch(apiUrl(dirPath, 'list'));
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[diskStorage] listFiles API failed, using localStorage:', e);
    }
  }

  // localStorage fallback
  const path = storagePath(dirPath);
  const files = lsListDir(path);
  return { files, not_exists: files.length === 0 };
}

/**
 * Read a file.
 */
export async function getFile(filePath: string): Promise<unknown> {
  if (await checkApi()) {
    try {
      const res = await fetch(apiUrl(filePath));
      if (!res.ok) return null;
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e) {
      console.warn('[diskStorage] getFile API failed, using localStorage:', e);
    }
  }

  // localStorage fallback
  try {
    const raw = localStorage.getItem(lsKey(storagePath(filePath)));
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

/**
 * Write files.
 */
export async function putTextFilesByJSON(data: {
  files: Array<{ path?: string; name?: string; content?: string }>;
}): Promise<void> {
  const useApi = await checkApi();

  const promises = data.files.map(async (file) => {
    const fullPath = file.path ? `${file.path}/${file.name}` : file.name || '';
    if (!fullPath) return;

    // Always write to localStorage
    try {
      localStorage.setItem(lsKey(storagePath(fullPath)), file.content || '');
    } catch {
      // localStorage full
    }

    // Also try API
    if (useApi) {
      try {
        await fetch(apiUrl(fullPath), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: file.content || '',
        });
      } catch (e) {
        console.warn('[diskStorage] putTextFilesByJSON API write failed:', e);
      }
    }
  });
  await Promise.all(promises);
}

/**
 * Write a binary file (e.g. image) from base64 data.
 */
export async function putBinaryFile(
  filePath: string,
  base64: string,
  mimeType: string,
): Promise<void> {
  // Store base64 in localStorage (with mime prefix for later retrieval)
  try {
    localStorage.setItem(lsKey(storagePath(filePath)), `data:${mimeType};base64,${base64}`);
  } catch {
    // localStorage full
  }

  // Also try API with binary
  if (await checkApi()) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    await fetch(apiUrl(filePath), {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: bytes,
    });
  }
}

/**
 * Delete files by paths.
 */
export async function deleteFilesByPaths(data: { file_paths: string[] }): Promise<void> {
  const useApi = await checkApi();

  const promises = data.file_paths.map(async (filePath) => {
    // Remove from localStorage
    try {
      localStorage.removeItem(lsKey(storagePath(filePath)));
    } catch {
      // ignore
    }

    // Also try API
    if (useApi) {
      try {
        await fetch(apiUrl(filePath), { method: 'DELETE' });
      } catch {
        // silently ignore
      }
    }
  });
  await Promise.all(promises);
}

/**
 * Search files by query string (filename match).
 */
export async function searchFiles(data: { query: string }): Promise<unknown[]> {
  try {
    const result = await listFiles('/');
    const q = data.query.toLowerCase();
    return result.files
      .filter((f) => f.path.toLowerCase().includes(q))
      .map((f) => ({
        id: '',
        name: f.path.split('/').pop() || '',
        path: '/' + f.path,
        type: f.type === 1 ? 'directory' : 'file',
        parentId: null,
        metadata: { size: f.size || 0 },
      }));
  } catch (e) {
    console.warn('[diskStorage] searchFiles failed:', e);
    return [];
  }
}
