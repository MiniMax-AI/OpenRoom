/** Unit tests for Vite proxy/config helper functions. */

import { describe, it, expect, afterEach } from 'vitest';
import {
  normalizeServerConfig,
  redactServerConfig,
  inferProvider,
  parseProxyTargetUrl,
  isAllowedTarget,
  selectServerApiKey,
} from '../../../vite.config';

const originalAllowLocalLlm = process.env.ALLOW_LOCAL_LLM;

afterEach(() => {
  if (originalAllowLocalLlm === undefined) {
    delete process.env.ALLOW_LOCAL_LLM;
  } else {
    process.env.ALLOW_LOCAL_LLM = originalAllowLocalLlm;
  }
});

describe('normalizeServerConfig()', () => {
  it('returns null for null input', () => {
    expect(normalizeServerConfig(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeServerConfig(undefined)).toBeNull();
  });

  it('returns null for an empty object', () => {
    expect(normalizeServerConfig({})).toBeNull();
  });

  it('wraps legacy flat configs under llm', () => {
    expect(
      normalizeServerConfig({
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4',
      }),
    ).toEqual({
      llm: {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4',
      },
    });
  });

  it('keeps the structured llm/imageGen format', () => {
    expect(
      normalizeServerConfig({
        llm: { provider: 'openai', apiKey: 'sk-llm', baseUrl: 'u', model: 'm' },
        imageGen: { provider: 'openai', apiKey: 'sk-img', baseUrl: 'iu', model: 'im' },
      }),
    ).toEqual({
      llm: { provider: 'openai', apiKey: 'sk-llm', baseUrl: 'u', model: 'm' },
      imageGen: { provider: 'openai', apiKey: 'sk-img', baseUrl: 'iu', model: 'im' },
    });
  });
});

describe('redactServerConfig()', () => {
  it('removes API key values while preserving hasApiKey flags', () => {
    expect(
      redactServerConfig({
        llm: { provider: 'openai', apiKey: 'sk-llm', baseUrl: 'u', model: 'm' },
        imageGen: { provider: 'gemini', apiKey: 'sk-img', baseUrl: 'iu', model: 'im' },
      }),
    ).toEqual({
      llm: { provider: 'openai', apiKey: '', hasApiKey: true, baseUrl: 'u', model: 'm' },
      imageGen: { provider: 'gemini', apiKey: '', hasApiKey: true, baseUrl: 'iu', model: 'im' },
    });
  });
});

describe('inferProvider()', () => {
  it('honors supported manual overrides', () => {
    expect(inferProvider('https://example.com/v1', 'openai')).toBe('openai');
    expect(inferProvider('https://example.com/v1', 'gemini')).toBe('gemini');
  });

  it('returns unknown for unsupported manual overrides', () => {
    expect(inferProvider('https://example.com/v1', 'custom-provider')).toBe('unknown');
  });

  it('infers providers from the target URL host', () => {
    expect(inferProvider('https://api.anthropic.com/v1/messages')).toBe('anthropic');
    expect(inferProvider('https://generativelanguage.googleapis.com/v1beta/models/test')).toBe(
      'gemini',
    );
  });

  it('returns unknown for malformed URLs', () => {
    expect(inferProvider('not a url')).toBe('unknown');
  });
});

describe('parseProxyTargetUrl()', () => {
  it('parses valid HTTPS targets', () => {
    expect(parseProxyTargetUrl('https://api.openai.com/v1')?.toString()).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('parses valid HTTP localhost targets with explicit ports', () => {
    expect(parseProxyTargetUrl('http://localhost:3000')?.toString()).toBe('http://localhost:3000/');
  });

  it('returns null for malformed URLs', () => {
    expect(parseProxyTargetUrl('not a url')).toBeNull();
  });

  it('returns null for unsupported protocols', () => {
    expect(parseProxyTargetUrl('file:///tmp/secret')).toBeNull();
  });
});

describe('selectServerApiKey()', () => {
  const config = {
    llm: { apiKey: 'sk-llm' },
    imageGen: { apiKey: 'sk-img' },
  };

  it('selects the key by explicit scope', () => {
    expect(selectServerApiKey(config, 'llm', 'openai')).toBe('sk-llm');
    expect(selectServerApiKey(config, 'imageGen', 'openai')).toBe('sk-img');
  });

  it('prefers the imageGen key for gemini when no scope is provided', () => {
    expect(selectServerApiKey(config, undefined, 'gemini')).toBe('sk-img');
  });
});

describe('isAllowedTarget()', () => {
  it('allows known provider hosts', () => {
    expect(isAllowedTarget(new URL('https://api.openai.com/v1/chat/completions'))).toBe(true);
    expect(isAllowedTarget(new URL('https://api.anthropic.com/v1/messages'))).toBe(true);
    expect(isAllowedTarget(new URL('https://api.deepseek.com/v1/chat/completions'))).toBe(true);
    expect(isAllowedTarget(new URL('https://openrouter.ai/api/v1/chat/completions'))).toBe(true);
    expect(
      isAllowedTarget(new URL('https://generativelanguage.googleapis.com/v1beta/models')),
    ).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedTarget(new URL('https://evil.example.com/steal'))).toBe(false);
    expect(isAllowedTarget(new URL('https://attacker.com/api'))).toBe(false);
  });

  it('rejects internal addresses by default', () => {
    delete process.env.ALLOW_LOCAL_LLM;

    expect(isAllowedTarget(new URL('http://localhost:8080/v1/chat/completions'))).toBe(false);
    expect(isAllowedTarget(new URL('http://127.0.0.1:8080/v1/chat/completions'))).toBe(false);
    expect(isAllowedTarget(new URL('http://192.168.1.1:8080/v1'))).toBe(false);
  });

  it('allows local hosts when ALLOW_LOCAL_LLM=true', () => {
    process.env.ALLOW_LOCAL_LLM = 'true';

    expect(isAllowedTarget(new URL('http://localhost:8080/v1/chat/completions'))).toBe(true);
    expect(isAllowedTarget(new URL('http://127.0.0.1:8080/v1/chat/completions'))).toBe(true);
  });

  it('rejects private network hosts even when ALLOW_LOCAL_LLM=true', () => {
    process.env.ALLOW_LOCAL_LLM = 'true';

    expect(isAllowedTarget(new URL('http://192.168.1.1:8080/v1'))).toBe(false);
  });

  it('rejects plaintext HTTP for public provider hosts', () => {
    expect(isAllowedTarget(new URL('http://api.openai.com/v1/chat/completions'))).toBe(false);
  });
});
