/**
 * Unit tests for configPersistence.ts
 *
 * Covers: loadPersistedConfig, savePersistedConfig, legacy format migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
} from '../configPersistence';
import type { LLMConfig } from '../llmModels';
import type { ImageGenConfig } from '../imageGenClient';

// ─── Constants ──────────────────────────────────────────────────────────────────

const MOCK_LLM_CONFIG: LLMConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4',
};

const MOCK_IMAGEGEN_CONFIG: ImageGenConfig = {
  provider: 'openai',
  apiKey: 'sk-img-test',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-image-1.5',
};

const MOCK_PERSISTED: PersistedConfig = {
  llm: MOCK_LLM_CONFIG,
  imageGen: MOCK_IMAGEGEN_CONFIG,
};

// ─── Setup / Teardown ───────────────────────────────────────────────────────────

const LS_CONFIG_KEY = 'openroom_config';

beforeEach(() => {
  // Successful loads mirror the config into localStorage; clear it so the
  // localStorage fallback doesn't leak state between tests.
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── loadPersistedConfig() ──────────────────────────────────────────────────────

describe('loadPersistedConfig()', () => {
  it('returns full config when file has new { llm, imageGen } format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_PERSISTED),
    } as unknown as Response);

    const result = await loadPersistedConfig();

    expect(result).toEqual(MOCK_PERSISTED);
    expect(result?.llm).toEqual(MOCK_LLM_CONFIG);
    expect(result?.imageGen).toEqual(MOCK_IMAGEGEN_CONFIG);
  });

  it('returns { llm } only when imageGen is absent', async () => {
    const withoutImageGen = { llm: MOCK_LLM_CONFIG };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(withoutImageGen),
    } as unknown as Response);

    const result = await loadPersistedConfig();

    expect(result?.llm).toEqual(MOCK_LLM_CONFIG);
    expect(result?.imageGen).toBeUndefined();
  });

  it('migrates legacy flat LLMConfig format to { llm } wrapper', async () => {
    // Legacy format: flat LLMConfig at top level (has "provider", no "llm" key)
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_LLM_CONFIG),
    } as unknown as Response);

    const result = await loadPersistedConfig();

    expect(result).toEqual({ llm: MOCK_LLM_CONFIG });
    expect(result?.llm.provider).toBe('openai');
    expect(result?.imageGen).toBeUndefined();
  });

  it('returns null when API returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    expect(await loadPersistedConfig()).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    expect(await loadPersistedConfig()).toBeNull();
  });

  it('returns null when response is not a recognized format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ unrelated: 'data' }),
    } as unknown as Response);

    expect(await loadPersistedConfig()).toBeNull();
  });

  it('mirrors a config loaded from the API into localStorage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_PERSISTED),
    } as unknown as Response);

    await loadPersistedConfig();

    expect(JSON.parse(localStorage.getItem(LS_CONFIG_KEY)!)).toEqual(MOCK_PERSISTED);
  });

  it('falls back to localStorage when the API returns 404 (static deploy)', async () => {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(MOCK_PERSISTED));
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    expect(await loadPersistedConfig()).toEqual(MOCK_PERSISTED);
  });

  it('falls back to localStorage when fetch throws', async () => {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify({ llm: MOCK_LLM_CONFIG }));
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    expect(await loadPersistedConfig()).toEqual({ llm: MOCK_LLM_CONFIG });
  });

  it('migrates a legacy flat config found in localStorage', async () => {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(MOCK_LLM_CONFIG));
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    expect(await loadPersistedConfig()).toEqual({ llm: MOCK_LLM_CONFIG });
  });

  it('returns null when localStorage holds corrupted JSON', async () => {
    localStorage.setItem(LS_CONFIG_KEY, '{not json');
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    expect(await loadPersistedConfig()).toBeNull();
  });

  it('still returns the API config when mirroring to localStorage fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_PERSISTED),
    } as unknown as Response);

    expect(await loadPersistedConfig()).toEqual(MOCK_PERSISTED);
  });
});

// ─── savePersistedConfig() ──────────────────────────────────────────────────────

describe('savePersistedConfig()', () => {
  it('POSTs the full config to /api/llm-config', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    await savePersistedConfig(MOCK_PERSISTED);

    expect(mockFetch).toHaveBeenCalledWith('/api/llm-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MOCK_PERSISTED),
    });
  });

  it('includes imageGen in the persisted JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    await savePersistedConfig(MOCK_PERSISTED);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.llm).toEqual(MOCK_LLM_CONFIG);
    expect(body.imageGen).toEqual(MOCK_IMAGEGEN_CONFIG);
  });

  it('omits imageGen when not provided', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    await savePersistedConfig({ llm: MOCK_LLM_CONFIG });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.llm).toEqual(MOCK_LLM_CONFIG);
    expect(body.imageGen).toBeUndefined();
  });

  it('writes the config to localStorage even when the API is unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await savePersistedConfig(MOCK_PERSISTED);

    expect(JSON.parse(localStorage.getItem(LS_CONFIG_KEY)!)).toEqual(MOCK_PERSISTED);
  });

  it('still POSTs to the API when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    await expect(savePersistedConfig(MOCK_PERSISTED)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not throw when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await expect(savePersistedConfig(MOCK_PERSISTED)).resolves.toBeUndefined();
  });
});
