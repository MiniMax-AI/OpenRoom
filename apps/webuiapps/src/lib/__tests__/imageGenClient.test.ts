/** Unit tests for imageGenClient.ts */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadImageGenConfig,
  loadImageGenConfigSync,
  saveImageGenConfig,
  getDefaultImageGenConfig,
  hasUsableImageGenConfig,
  generateImage,
  type ImageGenConfig,
} from '../imageGenClient';

const MOCK_IG_CONFIG: ImageGenConfig = {
  provider: 'openai',
  apiKey: 'sk-img-test',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-image-1.5',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getDefaultImageGenConfig()', () => {
  it('returns correct defaults for openai', () => {
    const cfg = getDefaultImageGenConfig('openai');
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-image-1.5');
  });

  it('returns correct defaults for gemini', () => {
    const cfg = getDefaultImageGenConfig('gemini');
    expect(cfg.provider).toBe('gemini');
    expect(cfg.baseUrl).toBe('https://generativelanguage.googleapis.com');
  });
});

describe('loadImageGenConfigSync()', () => {
  it('always returns null because browser-side key caching is disabled', () => {
    expect(loadImageGenConfigSync()).toBeNull();
  });
});

describe('loadImageGenConfig()', () => {
  it('loads redacted imageGen config from the config API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          llm: { provider: 'openai', apiKey: '', hasApiKey: true, baseUrl: 'u', model: 'm' },
          imageGen: { ...MOCK_IG_CONFIG, apiKey: '', hasApiKey: true },
        }),
    } as unknown as Response);

    await expect(loadImageGenConfig()).resolves.toEqual({
      ...MOCK_IG_CONFIG,
      apiKey: '',
      hasApiKey: true,
    });
  });

  it('returns null when the config API has no imageGen section', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ llm: { provider: 'openai', apiKey: '', baseUrl: 'u', model: 'm' } }),
    } as unknown as Response);

    await expect(loadImageGenConfig()).resolves.toBeNull();
  });
});

describe('saveImageGenConfig()', () => {
  it('remains a no-op because image config is saved via llmClient.saveConfig', () => {
    expect(() => saveImageGenConfig(MOCK_IG_CONFIG)).not.toThrow();
  });
});

describe('hasUsableImageGenConfig()', () => {
  it('accepts redacted configs when the server reports a stored key', () => {
    expect(hasUsableImageGenConfig({ ...MOCK_IG_CONFIG, apiKey: '', hasApiKey: true })).toBe(true);
  });

  it('rejects configs without a key or server-side key flag', () => {
    expect(hasUsableImageGenConfig({ ...MOCK_IG_CONFIG, apiKey: '', hasApiKey: false })).toBe(
      false,
    );
  });
});

describe('generateImage()', () => {
  it('marks image generation requests with the imageGen config scope header', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: 'abc123' }] }),
      text: () => Promise.resolve(''),
    } as unknown as Response);
    globalThis.fetch = mockFetch;

    await generateImage('draw a castle', MOCK_IG_CONFIG);

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-LLM-Config-Scope']).toBe('imageGen');
    expect(headers['X-LLM-Target-URL']).toBe('https://api.openai.com/v1/images/generations');
  });
});
