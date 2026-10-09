/**
 * Disk-based File Storage
 * Drop-in replacement for indexedDbStorage — all operations go through
 * the session-data API (Vite dev server middleware) which persists to
 * ~/.openroom/sessions/{charId}/{modId}/apps/...
 */

import { getSessionPath } from './sessionPath';

const API_PATH = '/api/session-data';

/** Build the full API URL for a file path, scoped under current session's /apps/ directory */
function apiUrl(filePath: string, action?: string): string {
  const session = getSessionPath();
  // Strip leading slash for uniform handling
  const cleaned = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  // If the path already starts with "apps/", don't add the prefix again
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

/**
 * List files in a directory.
 * Returns { files: [{ path, type, size }], not_exists: boolean }
 */
export async function listFiles(dirPath: string): Promise<{
  files: Array<{ path: string; type: number; size?: number }>;
  not_exists: boolean;
}> {
  try {
    const res = await fetch(apiUrl(dirPath, 'list'));
    if (res.ok) {
      return await res.json();
    }
    return { files: [], not_exists: true };
  } catch (e) {
    console.warn('[diskStorage] listFiles failed:', e);
    return { files: [], not_exists: true };
  }
}

/**
 * Read a file. Returns parsed JSON (if JSON file) or string content, or null if not found.
 */
export async function getFile(filePath: string): Promise<unknown> {
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
    console.warn('[diskStorage] getFile failed:', e);
    return null;
  }
}

/**
 * Write files. Compatible with the old putTextFilesByJSON signature.
 * files: [{ path: "directory", name: "filename", content: "..." }]
 * Callers that report mutation outcomes can opt into error propagation.
 */
export async function putTextFilesByJSON(
  data: { files: Array<{ path?: string; name?: string; content?: string }> },
  options: { throwOnError?: boolean } = {},
): Promise<void> {
  const promises = data.files.map(async (file) => {
    const fullPath = file.path ? `${file.path}/${file.name}` : file.name || '';
    if (!fullPath) return;
    try {
      const res = await fetch(apiUrl(fullPath), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: file.content || '',
      });
      if (options.throwOnError && !res.ok) {
        throw new Error(`File write failed (HTTP ${res.status})`);
      }
    } catch (e) {
      if (options.throwOnError) throw e;
      console.warn('[diskStorage] putTextFilesByJSON write failed:', e);
    }
  });
  await Promise.all(promises);
}

/**
 * Delete files by paths.
 */
/**
 * Write a binary file (e.g. image) from base64 data.
 */
export async function putBinaryFile(
  filePath: string,
  base64: string,
  mimeType: string,
): Promise<void> {
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

export async function deleteFilesByPaths(
  data: { file_paths: string[] },
  options: { throwOnError?: boolean } = {},
): Promise<void> {
  const promises = data.file_paths.map(async (filePath) => {
    try {
      const res = await fetch(apiUrl(filePath), { method: 'DELETE' });
      if (options.throwOnError && !res.ok) {
        throw new Error(`File delete failed (HTTP ${res.status})`);
      }
    } catch (e) {
      if (options.throwOnError) throw e;
      // silently ignore
    }
  });
  await Promise.all(promises);
}

/**
 * Search files by query string (filename match).
 */
export async function searchFiles(data: { query: string }): Promise<unknown[]> {
  // Search by listing root recursively and filtering — simplified to root listing + filter
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
