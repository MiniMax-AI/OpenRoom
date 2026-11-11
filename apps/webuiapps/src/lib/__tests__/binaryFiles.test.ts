import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../diskStorage', () => ({
  isApiAvailable: vi.fn(async () => true),
  fileUrl: (p: string) => `/api/session-data?path=${encodeURIComponent(p)}`,
}));

import * as disk from '../diskStorage';
import {
  appFileUrl,
  deleteAppBinaryFile,
  isServerFileStorageAvailable,
  putAppBinaryFile,
} from '../binaryFiles';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(disk.isApiAvailable).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('binaryFiles', () => {
  it('reports server availability and builds file URLs', async () => {
    expect(await isServerFileStorageAvailable()).toBe(true);
    expect(appFileUrl('dreamland/data/avatar/companion.vrm')).toBe(
      '/api/session-data?path=dreamland%2Fdata%2Favatar%2Fcompanion.vrm',
    );
  });

  it('posts the bytes as binary', async () => {
    const data = new Blob(['bytes']);
    await putAppBinaryFile('a/b.vrm', data);
    expect(fetchMock).toHaveBeenCalledWith('/api/session-data?path=a%2Fb.vrm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    });
  });

  it('throws when the server is missing or refuses the file', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 413 });
    await expect(
      putAppBinaryFile('a.vrm', new ArrayBuffer(4), 'model/gltf-binary'),
    ).rejects.toThrow('413');
    vi.mocked(disk.isApiAvailable).mockResolvedValue(false);
    await expect(putAppBinaryFile('a.vrm', new ArrayBuffer(4))).rejects.toThrow(/not available/);
  });

  it('deletes files, quietly when there is no server', async () => {
    await deleteAppBinaryFile('a.vrm');
    expect(fetchMock).toHaveBeenCalledWith('/api/session-data?path=a.vrm', { method: 'DELETE' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(deleteAppBinaryFile('a.vrm')).rejects.toThrow('500');
    vi.mocked(disk.isApiAvailable).mockResolvedValue(false);
    fetchMock.mockClear();
    await deleteAppBinaryFile('a.vrm');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
