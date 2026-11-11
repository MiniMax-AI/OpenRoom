/**
 * Large binary files for apps (e.g. 3D models), stored through the dev-server
 * file API. Unlike putBinaryFile (images), nothing is copied into
 * localStorage: these files are far too big for it.
 *
 * Paths are relative to the session's apps/ directory, e.g.
 * "dreamland/data/avatar/companion.vrm".
 */

import { fileUrl, isApiAvailable } from './diskStorage';

/** True when files can be saved on the server (dev server running). */
export function isServerFileStorageAvailable(): Promise<boolean> {
  return isApiAvailable();
}

/** URL that serves a stored app file. */
export function appFileUrl(filePath: string): string {
  return fileUrl(filePath);
}

/** Save bytes on the server. Throws when the server is unavailable or refuses the file. */
export async function putAppBinaryFile(
  filePath: string,
  data: Blob | ArrayBuffer,
  mimeType = 'application/octet-stream',
): Promise<void> {
  if (!(await isApiAvailable())) throw new Error('File storage is not available');
  const res = await fetch(fileUrl(filePath), {
    method: 'POST',
    // The server stores image/*, video/* and octet-stream bodies as binary
    headers: { 'Content-Type': mimeType },
    body: data,
  });
  if (!res.ok) throw new Error(`Saving the file failed (${res.status})`);
}

/** Delete a stored app file. Missing files are fine. */
export async function deleteAppBinaryFile(filePath: string): Promise<void> {
  if (!(await isApiAvailable())) return;
  const res = await fetch(fileUrl(filePath), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Deleting the file failed (${res.status})`);
}
