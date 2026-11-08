/**
 * Unit tests for llmClient.ts
 *
 * Environment: happy-dom (provides localStorage, fetch globals)
 * Mock strategy:
 *   - fetch: vi.fn() via globalThis.fetch per test
 *   - localStorage: happy-dom provides real implementation, cleared in beforeEach
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  loadConfigSync,
  saveConfig,
  chat,
  type ChatMessage,
  type ToolDef,
} from '../llmClient';
import { getDefaultProviderConfig, type LLMConfig } from '../llmModels';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIG_KEY = 'webuiapps-llm-config';

const MOCK_OPENAI_CONFIG: LLMConfig = {
  provider: 'openai',
  apiKey: 'sk-test-key',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4',
};

const MOCK_ANTHROPIC_CONFIG: LLMConfig = {
  provider: 'anthropic',
  apiKey: 'ant-test-key',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-6',
};

const MOCK_LLAMACPP_CONFIG: LLMConfig = {
  provider: 'llama.cpp',
  apiKey: '',
  baseUrl: 'http://athena:8081',
  model: 'Qwen_Qwen3.5-35B-A3B',
};

const MOCK_MESSAGES: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

const MOCK_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOpenAIResponse(content: string, toolCalls: unknown[] = []) {
  const body = JSON.stringify({ choices: [{ message: { content, tool_calls: toolCalls } }] });
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

function makeAnthropicResponse(textContent: string) {
  const body = { content: [{ type: 'text', text: textContent }] };
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function makeErrorResponse(status: number, bodyText: string) {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve({ error: bodyText }),
  } as unknown as Response;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getDefaultProviderConfig()', () => {
  it('returns correct defaults for openai', () => {
    const cfg = getDefaultProviderConfig('openai');
    expect(cfg.provider).toBe('openai');
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.model).toBe('gpt-5.4');
    expect('apiKey' in cfg).toBe(false);
  });

  it('returns correct defaults for anthropic', () => {
    const cfg = getDefaultProviderConfig('anthropic');
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.baseUrl).toBe('https://api.anthropic.com/v1');
    expect(cfg.model).toBe('claude-sonnet-4-6');
  });

  it('returns correct defaults for deepseek', () => {
    const cfg = getDefaultProviderConfig('deepseek');
    expect(cfg.provider).toBe('deepseek');
    expect(cfg.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(cfg.model).toBe('deepseek-chat');
  });

  it('returns correct defaults for llama.cpp', () => {
    const cfg = getDefaultProviderConfig('llama.cpp');
    expect(cfg.provider).toBe('llama.cpp');
    expect(cfg.baseUrl).toBe('http://localhost:8080');
    expect(cfg.model).toBe('local-model');
  });

  it('returns correct defaults for minimax', () => {
    const cfg = getDefaultProviderConfig('minimax');
    expect(cfg.provider).toBe('minimax');
    expect(cfg.baseUrl).toBe('https://api.minimax.io/anthropic/v1');
    expect(cfg.model).toBe('MiniMax-M2.5');
  });

  it('returns correct defaults for z.ai', () => {
    const cfg = getDefaultProviderConfig('z.ai');
    expect(cfg.provider).toBe('z.ai');
    expect(cfg.baseUrl).toBe('https://api.z.ai/api/coding/paas/v4');
    expect(cfg.model).toBe('glm-5');
  });

  it('returns correct defaults for kimi', () => {
    const cfg = getDefaultProviderConfig('kimi');
    expect(cfg.provider).toBe('kimi');
    expect(cfg.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(cfg.model).toBe('kimi-k2-5');
  });

  it('returns correct defaults for openrouter', () => {
    const cfg = getDefaultProviderConfig('openrouter');
    expect(cfg.provider).toBe('openrouter');
    expect(cfg.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(cfg.model).toBe('minimax/MiniMax-M2.5');
  });

  it('returns consistent values for the same provider', () => {
    const a = getDefaultProviderConfig('openai');
    const b = getDefaultProviderConfig('openai');
    expect(a).toStrictEqual(b);
  });
});

// ─── loadConfigSync() ─────────────────────────────────────────────────────────

describe('loadConfigSync()', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadConfigSync()).toBeNull();
  });

  it('returns parsed config when localStorage has valid JSON', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(MOCK_OPENAI_CONFIG));
    expect(loadConfigSync()).toEqual(MOCK_OPENAI_CONFIG);
  });

  it('returns null when localStorage contains invalid JSON', () => {
    localStorage.setItem(CONFIG_KEY, 'not-valid-json{{{');
    expect(loadConfigSync()).toBeNull();
  });

  it('returns null when value is empty string', () => {
    localStorage.setItem(CONFIG_KEY, '');
    expect(loadConfigSync()).toBeNull();
  });

  it('preserves optional customHeaders field', () => {
    const cfg: LLMConfig = { ...MOCK_OPENAI_CONFIG, customHeaders: 'X-Foo: bar\nX-Baz: qux' };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    expect(loadConfigSync()?.customHeaders).toBe('X-Foo: bar\nX-Baz: qux');
  });
});

// ─── loadConfig() ─────────────────────────────────────────────────────────────

describe('loadConfig()', () => {
  describe('Scenario A: API returns 200 with new format', () => {
    it('returns LLM config from { llm, imageGen } format and syncs to localStorage', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            llm: MOCK_OPENAI_CONFIG,
            imageGen: { provider: 'openai', apiKey: 'k', baseUrl: 'u', model: 'm' },
          }),
      } as unknown as Response);

      const result = await loadConfig();

      expect(result).toEqual(MOCK_OPENAI_CONFIG);
      expect(localStorage.getItem(CONFIG_KEY)).toBe(JSON.stringify(MOCK_OPENAI_CONFIG));
    });
  });

  describe('Scenario A2: API returns 200 with legacy flat format', () => {
    it('returns config from legacy flat LLMConfig format', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OPENAI_CONFIG),
      } as unknown as Response);

      const result = await loadConfig();

      expect(result).toEqual(MOCK_OPENAI_CONFIG);
      expect(localStorage.getItem(CONFIG_KEY)).toBe(JSON.stringify(MOCK_OPENAI_CONFIG));
    });
  });

  describe('Scenario B: API returns 404 (no file)', () => {
    it('falls back to localStorage when API returns 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 } as Response);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(MOCK_OPENAI_CONFIG));

      expect(await loadConfig()).toEqual(MOCK_OPENAI_CONFIG);
    });

    it('returns null when API returns 404 and localStorage is empty', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 } as Response);

      expect(await loadConfig()).toBeNull();
    });
  });

  describe('Scenario C: fetch throws (network error / production)', () => {
    it('falls back to localStorage on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      localStorage.setItem(CONFIG_KEY, JSON.stringify(MOCK_ANTHROPIC_CONFIG));

      expect(await loadConfig()).toEqual(MOCK_ANTHROPIC_CONFIG);
    });

    it('returns null when fetch throws and localStorage is empty', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('fetch is not defined'));

      expect(await loadConfig()).toBeNull();
    });

    it('resolves null when both API and localStorage fail (does not throw)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      localStorage.setItem(CONFIG_KEY, 'corrupted-json');

      await expect(loadConfig()).resolves.toBeNull();
    });
  });
});

// ─── saveConfig() ─────────────────────────────────────────────────────────────

describe('saveConfig()', () => {
  it('always writes to localStorage even if fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('API unavailable'));

    await saveConfig(MOCK_OPENAI_CONFIG);

    expect(localStorage.getItem(CONFIG_KEY)).toBe(JSON.stringify(MOCK_OPENAI_CONFIG));
  });

  it('POSTs new { llm } format to /api/llm-config', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    await saveConfig(MOCK_OPENAI_CONFIG);

    expect(mockFetch).toHaveBeenCalledWith('/api/llm-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm: MOCK_OPENAI_CONFIG }),
    });
  });

  it('includes imageGen when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = mockFetch;

    const igConfig = { provider: 'openai' as const, apiKey: 'k', baseUrl: 'u', model: 'm' };
    await saveConfig(MOCK_OPENAI_CONFIG, igConfig);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.llm).toEqual(MOCK_OPENAI_CONFIG);
    expect(body.imageGen).toEqual(igConfig);
  });

  it('does not throw when POST request fails silently', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('API unavailable'));

    await expect(saveConfig(MOCK_OPENAI_CONFIG)).resolves.toBeUndefined();
  });

  it('overwrites previous config — latest value wins', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    await saveConfig(MOCK_OPENAI_CONFIG);
    await saveConfig(MOCK_ANTHROPIC_CONFIG);

    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    expect(stored?.provider).toBe('anthropic');
  });

  it('writes localStorage before awaiting fetch', async () => {
    let localStorageWrittenBeforeFetch = false;
    const originalSetItem = localStorage.setItem.bind(localStorage);

    globalThis.fetch = vi.fn().mockImplementationOnce(() => {
      // By the time fetch is called, localStorage should already be written
      localStorageWrittenBeforeFetch = localStorage.getItem(CONFIG_KEY) !== null;
      return Promise.resolve({ ok: true } as Response);
    });

    vi.spyOn(localStorage, 'setItem').mockImplementation(originalSetItem);

    await saveConfig(MOCK_OPENAI_CONFIG);

    expect(localStorageWrittenBeforeFetch).toBe(true);
  });
});

// ─── chat() — routing & response parsing ──────────────────────────────────────

describe('chat()', () => {
  describe('OpenAI provider', () => {
    it('calls /api/llm-proxy and returns content', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('Hello!'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], MOCK_OPENAI_CONFIG);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/llm-proxy',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.content).toBe('Hello!');
      expect(result.toolCalls).toEqual([]);
    });

    it('sets Authorization Bearer token header', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));
      globalThis.fetch = mockFetch;

      await chat(MOCK_MESSAGES, [], MOCK_OPENAI_CONFIG);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
    });

    it('uses v1/chat/completions when baseUrl has no version suffix', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));
      globalThis.fetch = mockFetch;

      await chat(MOCK_MESSAGES, [], MOCK_OPENAI_CONFIG);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['X-LLM-Target-URL']).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('includes tools in body when tools array is non-empty', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));
      globalThis.fetch = mockFetch;

      await chat(MOCK_MESSAGES, MOCK_TOOLS, MOCK_OPENAI_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools).toHaveLength(1);
    });

    it('omits tools from body when tools array is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));
      globalThis.fetch = mockFetch;

      await chat(MOCK_MESSAGES, [], MOCK_OPENAI_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools).toBeUndefined();
    });

    it('throws with status code when API returns error', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(makeErrorResponse(429, 'Rate limit exceeded'));

      await expect(chat(MOCK_MESSAGES, [], MOCK_OPENAI_CONFIG)).rejects.toThrow(
        'LLM API error 429',
      );
    });

    it('returns toolCalls when response includes tool_calls', async () => {
      const mockToolCall = {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"SF"}' },
      };
      globalThis.fetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('', [mockToolCall]));

      const result = await chat(MOCK_MESSAGES, MOCK_TOOLS, MOCK_OPENAI_CONFIG);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('get_weather');
    });
  });

  describe('DeepSeek provider (OpenAI-compatible)', () => {
    it('routes to OpenAI path with deepseek target URL', async () => {
      const deepseekConfig: LLMConfig = {
        ...MOCK_OPENAI_CONFIG,
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
      };
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('DeepSeek response'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], deepseekConfig);

      expect(result.content).toBe('DeepSeek response');
      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['X-LLM-Target-URL']).toContain('deepseek.com');
    });
  });

  describe('llama.cpp provider (OpenAI-compatible)', () => {
    it('routes to OpenAI path without requiring an API key', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('Local response'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], MOCK_LLAMACPP_CONFIG);

      expect(result.content).toBe('Local response');
      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['X-LLM-Target-URL']).toBe('http://athena:8081/v1/chat/completions');
    });

    it('strips Qwen-style think tags from assistant content', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeOpenAIResponse('<think>hidden reasoning</think>Hello there'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], MOCK_LLAMACPP_CONFIG);

      expect(result.content).toBe('Hello there');
    });

    it('converts inline XML-style tool call content into structured tool calls', async () => {
      const inlineToolContent = `<tool_call>
respond_to_user
<arg_key>character_expression</arg_key>
<arg_value>{"content":"What? Did I catch you off guard?","emotion":"happy"}</arg_value>
<arg_key>user_interaction</arg_key>
<arg_value>{"suggested_replies":["Just hanging around","What reunion?","Tell me more"]}</arg_value>
</tool_call>`;
      globalThis.fetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse(inlineToolContent));

      const result = await chat(MOCK_MESSAGES, MOCK_TOOLS, MOCK_LLAMACPP_CONFIG);

      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('respond_to_user');
      expect(result.toolCalls[0].function.arguments).toBe(
        '{"character_expression":{"content":"What? Did I catch you off guard?","emotion":"happy"},"user_interaction":{"suggested_replies":["Just hanging around","What reunion?","Tell me more"]}}',
      );
    });
  });

  describe('Anthropic provider', () => {
    it('uses x-api-key and anthropic-version headers', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeAnthropicResponse('Anthropic response'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], MOCK_ANTHROPIC_CONFIG);

      expect(result.content).toBe('Anthropic response');
      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['x-api-key']).toBe('ant-test-key');
    });

    it('uses /messages when baseUrl already includes /v1', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeAnthropicResponse('Anthropic response'));
      globalThis.fetch = mockFetch;

      const configWithVersion: LLMConfig = {
        ...MOCK_ANTHROPIC_CONFIG,
        baseUrl: 'https://api.anthropic.com/v1',
      };
      await chat(MOCK_MESSAGES, [], configWithVersion);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['X-LLM-Target-URL']).toBe('https://api.anthropic.com/v1/messages');
    });

    it('extracts system message to top-level system field', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ];
      const mockFetch = vi.fn().mockResolvedValueOnce(makeAnthropicResponse('ok'));
      globalThis.fetch = mockFetch;

      await chat(messages, [], MOCK_ANTHROPIC_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
    });

    it('converts tool_use blocks in response to toolCalls', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              { type: 'text', text: 'Using tool' },
              { type: 'tool_use', id: 'toolu_123', name: 'get_weather', input: { city: 'SF' } },
            ],
          }),
      } as unknown as Response);
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, MOCK_TOOLS, MOCK_ANTHROPIC_CONFIG);

      expect(result.content).toBe('Using tool');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].id).toBe('toolu_123');
      expect(result.toolCalls[0].function.name).toBe('get_weather');
      expect(result.toolCalls[0].function.arguments).toBe('{"city":"SF"}');
    });

    it('throws with status code when Anthropic API returns error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(makeErrorResponse(401, 'Unauthorized'));

      await expect(chat(MOCK_MESSAGES, [], MOCK_ANTHROPIC_CONFIG)).rejects.toThrow(
        'Anthropic API error 401',
      );
    });
  });

  describe('MiniMax provider (Anthropic-compatible)', () => {
    it('routes to Anthropic path', async () => {
      const minimaxConfig: LLMConfig = {
        provider: 'minimax',
        apiKey: 'minimax-key',
        baseUrl: 'https://api.minimax.io/anthropic',
        model: 'MiniMax-M2.5',
      };
      const mockFetch = vi.fn().mockResolvedValueOnce(makeAnthropicResponse('MiniMax response'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], minimaxConfig);

      expect(result.content).toBe('MiniMax response');
      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('parseCustomHeaders (tested indirectly via chat())', () => {
    it('parses valid headers and adds x-custom- prefix', async () => {
      const cfg: LLMConfig = {
        ...MOCK_OPENAI_CONFIG,
        customHeaders: 'X-Org-Id: org-123\nX-Trace: abc',
      };
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));
      globalThis.fetch = mockFetch;

      await chat(MOCK_MESSAGES, [], cfg);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['x-custom-x-org-id']).toBe('org-123');
      expect(headers['x-custom-x-trace']).toBe('abc');
    });

    it('handles empty customHeaders without throwing', async () => {
      const cfg: LLMConfig = { ...MOCK_OPENAI_CONFIG, customHeaders: '' };
      globalThis.fetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));

      await expect(chat(MOCK_MESSAGES, [], cfg)).resolves.toBeDefined();
    });

    it('skips blank lines and entries without colon', async () => {
      const cfg: LLMConfig = {
        ...MOCK_OPENAI_CONFIG,
        customHeaders: '\n  \nValid: value\nnocolon\n',
      };
      const mockFetch = vi.fn().mockResolvedValueOnce(makeOpenAIResponse('ok'));
      globalThis.fetch = mockFetch;

      const result = await chat(MOCK_MESSAGES, [], cfg);

      expect(result.content).toBe('ok');
      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['x-custom-valid']).toBe('value');
      expect(headers['x-custom-nocolon']).toBeUndefined();
    });
  });
});
