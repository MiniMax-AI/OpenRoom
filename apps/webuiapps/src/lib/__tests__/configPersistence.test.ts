/** Unit tests for configPersistence.ts */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
  type PersistedConfigUpdate,
} from '../configPersistence';
import type { LLMConfig } from '../llmModels';
import type { ImageGenConfig } from '../imageGenClient';

const MOCK_LLM_CONFIG: LLMConfig = {
  provider: 'openai',
  apiKey: '',
  hasApiKey: true,
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4',
};

const MOCK_IMAGEGEN_CONFIG: ImageGenConfig = {
  provider: 'openai',
  apiKey: '',
  hasApiKey: true,
  baseUrl: 'https://api.openai.com',
  model: 'gpt-image-1.5',
};

const MOCK_PERSISTED: PersistedConfig = {
  llm: MOCK_LLM_CONFIG,
  imageGen: MOCK_IMAGEGEN_CONFIG,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadPersistedConfig()', () => {
  it('returns redacted config when the API responds with the new format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_PERSISTED),
    } as unknown as Response);

    await expect(loadPersistedConfig()).resolves.toEqual(MOCK_PERSISTED);
  });

  it('migrates legacy flat LLMConfig format to { llm }', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...MOCK_LLM_CONFIG }),
    } as unknown as Response);

    await expect(loadPersistedConfig()).resolves.toEqual({ llm: { ...MOCK_LLM_CONFIG } });
  });

  it('returns null when the API request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await expect(loadPersistedConfig()).resolves.toBeNull();
  });
});

describe('savePersistedConfig()', () => {
  it('POSTs the config update to /api/llm-config', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    const update: PersistedConfigUpdate = {
      llm: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4',
      },
      imageGen: null,
    };

    const result = await savePersistedConfig(update);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/llm-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  });

  it('returns an error result when the API rejects the save', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request'),
    } as unknown as Response);

    await expect(
      savePersistedConfig({
        llm: {
          provider: 'openai',
          baseUrl: 'https://api.openai.com',
          model: 'gpt-4',
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'Failed to save config (400): bad request',
    });
  });
});
