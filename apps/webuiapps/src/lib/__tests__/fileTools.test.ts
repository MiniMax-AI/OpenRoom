import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFilesByPaths, putTextFilesByJSON } from '../diskStorage';
import { executeFileTool } from '../fileTools';
import { setSessionPath } from '../sessionPath';

const filePath = 'apps/diary/data/entries/test.json';
const content = '{"text":"Synthetic entry"}';
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  setSessionPath('test-character/test-mod');
});

afterEach(() => {
  setSessionPath('');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  { tool: 'file_write', method: 'POST' },
  { tool: 'file_delete', method: 'DELETE' },
])('$tool storage results', ({ tool, method }) => {
  it.each([400, 403, 500])('reports HTTP %s as an error without retrying', async (status) => {
    fetchMock.mockResolvedValue(new Response('synthetic failure', { status }));

    const result = await executeFileTool(tool, { file_path: filePath, content });

    expect(result).toMatch(/^error: /);
    expect(result).toContain(String(status));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports network failures without retrying', async () => {
    fetchMock.mockRejectedValue(new Error('synthetic offline'));

    const result = await executeFileTool(tool, { file_path: filePath, content });

    expect(result).toMatch(/^error: /);
    expect(result).toContain('synthetic offline');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([200, 204])('preserves successful HTTP %s results and request data', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));

    expect(await executeFileTool(tool, { file_path: filePath, content })).toBe('success');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/session-data?path=${encodeURIComponent(`test-character/test-mod/${filePath}`)}`,
      method === 'POST'
        ? { method, headers: { 'Content-Type': 'text/plain' }, body: content }
        : { method },
    );
  });
});

describe('storage callers without strict error reporting', () => {
  const write = () => putTextFilesByJSON({ files: [{ name: filePath, content }] });
  const remove = () => deleteFilesByPaths({ file_paths: [filePath] });

  it.each([write, remove])('keeps HTTP failures best-effort', async (mutate) => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(mutate()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([write, remove])('keeps network failures best-effort', async (mutate) => {
    fetchMock.mockRejectedValue(new Error('synthetic offline'));

    await expect(mutate()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
