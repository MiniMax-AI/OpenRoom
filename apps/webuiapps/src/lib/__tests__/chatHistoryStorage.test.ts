import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatHistoryData, DisplayMessage } from '../chatHistoryStorage';
import type { ChatMessage } from '../llmClient';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const STORAGE_KEY = 'webuiapps-chat-history';

const sampleMessages: DisplayMessage[] = [
  { id: '1', role: 'user', content: 'Hello' },
  { id: '2', role: 'assistant', content: 'Hi there!' },
];

const sampleChatHistory: ChatMessage[] = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
];

function makeSavedData(msgs = sampleMessages, history = sampleChatHistory): ChatHistoryData {
  return { version: 1, savedAt: Date.now(), messages: msgs, chatHistory: history };
}

describe('chatHistoryStorage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
    vi.resetModules();
  });

  // ============ loadChatHistorySync ============

  describe('loadChatHistorySync', () => {
    it('returns null when localStorage is empty', async () => {
      const { loadChatHistorySync } = await import('../chatHistoryStorage');
      expect(loadChatHistorySync()).toBeNull();
    });

    it('returns data from localStorage', async () => {
      const data = makeSavedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const { loadChatHistorySync } = await import('../chatHistoryStorage');
      const result = loadChatHistorySync();
      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(2);
      expect(result!.chatHistory).toHaveLength(2);
      expect(result!.version).toBe(1);
    });

    it('returns null for invalid JSON', async () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      const { loadChatHistorySync } = await import('../chatHistoryStorage');
      expect(loadChatHistorySync()).toBeNull();
    });

    it('returns null for wrong version', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 99, savedAt: 0, messages: [], chatHistory: [] }),
      );
      const { loadChatHistorySync } = await import('../chatHistoryStorage');
      expect(loadChatHistorySync()).toBeNull();
    });
  });

  // ============ loadChatHistory (async) ============

  describe('loadChatHistory', () => {
    it('loads from API and syncs to localStorage', async () => {
      const data = makeSavedData();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(data),
      });
      const { loadChatHistory } = await import('../chatHistoryStorage');

      const result = await loadChatHistory();

      expect(fetchMock).toHaveBeenCalledWith('/api/chat-history');
      expect(result).not.toBeNull();
      expect(result!.messages).toEqual(sampleMessages);
      // Verify synced to localStorage
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.version).toBe(1);
    });

    it('falls back to localStorage when API returns non-ok', async () => {
      const data = makeSavedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      const { loadChatHistory } = await import('../chatHistoryStorage');

      const result = await loadChatHistory();

      expect(result).not.toBeNull();
      expect(result!.messages).toEqual(sampleMessages);
    });

    it('falls back to localStorage when fetch throws', async () => {
      const data = makeSavedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      fetchMock.mockRejectedValueOnce(new Error('network error'));
      const { loadChatHistory } = await import('../chatHistoryStorage');

      const result = await loadChatHistory();

      expect(result).not.toBeNull();
      expect(result!.messages).toEqual(sampleMessages);
    });

    it('returns null when both API and localStorage are empty', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      const { loadChatHistory } = await import('../chatHistoryStorage');

      const result = await loadChatHistory();
      expect(result).toBeNull();
    });
  });

  // ============ saveChatHistory ============

  describe('saveChatHistory', () => {
    it('saves to localStorage and POSTs to API', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      const { saveChatHistory } = await import('../chatHistoryStorage');

      await saveChatHistory(sampleMessages, sampleChatHistory);

      // Check localStorage
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.version).toBe(1);
      expect(stored.messages).toEqual(sampleMessages);
      expect(stored.chatHistory).toEqual(sampleChatHistory);
      expect(typeof stored.savedAt).toBe('number');

      // Check fetch call
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/chat-history');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.version).toBe(1);
    });

    it('saves to localStorage even when fetch fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network error'));
      const { saveChatHistory } = await import('../chatHistoryStorage');

      await saveChatHistory(sampleMessages, sampleChatHistory);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.messages).toEqual(sampleMessages);
    });
  });

  // ============ clearChatHistory ============

  describe('clearChatHistory', () => {
    it('removes from localStorage and sends DELETE to API', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(makeSavedData()));
      fetchMock.mockResolvedValueOnce({ ok: true });
      const { clearChatHistory } = await import('../chatHistoryStorage');

      await clearChatHistory();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith('/api/chat-history', { method: 'DELETE' });
    });

    it('clears localStorage even when DELETE fetch fails', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(makeSavedData()));
      fetchMock.mockRejectedValueOnce(new Error('network error'));
      const { clearChatHistory } = await import('../chatHistoryStorage');

      await clearChatHistory();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
