/**
 * Unit tests for imageGenClient.ts — image generation per provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateImage,
  buildPollinationsUrl,
  arrayBufferToBase64,
  isImageGenConfigured,
  requiresApiKey,
  getDefaultImageGenConfig,
  type ImageGenConfig,
} from '../imageGenClient';
import {
  executeImageGenTool,
  buildImageGenPrompt,
  getImageGenToolDefinitions,
} from '../imageGenTools';

const POLLINATIONS: ImageGenConfig = {
  provider: 'pollinations',
  apiKey: '',
  baseUrl: 'https://image.pollinations.ai',
  model: 'flux',
};

const OPENAI: ImageGenConfig = {
  provider: 'openai',
  apiKey: 'sk-img',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-image-1.5',
  customHeaders: 'X-Team: blue\n\nbad-line\n',
};

const GEMINI: ImageGenConfig = {
  provider: 'gemini',
  apiKey: 'g-key',
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-3.1-flash-image-preview',
};

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

function imageResponse(bytes: Uint8Array, type = 'image/jpeg'): Response {
  return new Response(bytes, { status: 200, headers: { 'Content-Type': type } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('keyless providers', () => {
  it('only Pollinations works without a key', () => {
    expect(requiresApiKey('pollinations')).toBe(false);
    expect(requiresApiKey('openai')).toBe(true);
    expect(requiresApiKey('gemini')).toBe(true);
  });

  it('isImageGenConfigured needs a base URL, and a key unless keyless', () => {
    expect(isImageGenConfigured(null)).toBe(false);
    expect(isImageGenConfigured(undefined)).toBe(false);
    expect(isImageGenConfigured(POLLINATIONS)).toBe(true);
    expect(isImageGenConfigured({ ...POLLINATIONS, baseUrl: '  ' })).toBe(false);
    expect(isImageGenConfigured(OPENAI)).toBe(true);
    expect(isImageGenConfigured({ ...OPENAI, apiKey: ' ' })).toBe(false);
  });

  it('has Pollinations defaults', () => {
    expect(getDefaultImageGenConfig('pollinations')).toEqual({
      provider: 'pollinations',
      baseUrl: 'https://image.pollinations.ai',
      model: 'flux',
    });
  });
});

describe('buildPollinationsUrl', () => {
  it('encodes the prompt and sets size, seed, model and no logo', () => {
    const url = new URL(
      buildPollinationsUrl(
        'a cat & a dog / 100%',
        { ...POLLINATIONS, baseUrl: 'https://x.ai/' },
        42,
      ),
    );
    expect(url.origin + url.pathname).toBe(
      'https://x.ai/prompt/a%20cat%20%26%20a%20dog%20%2F%20100%25',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      width: '1024',
      height: '1024',
      nologo: 'true',
      seed: '42',
      model: 'flux',
    });
  });

  it('omits an empty model and uses a random seed by default', () => {
    const a = new URL(buildPollinationsUrl('x', { ...POLLINATIONS, model: ' ' }));
    expect(a.searchParams.has('model')).toBe(false);
    expect(Number(a.searchParams.get('seed'))).toBeGreaterThanOrEqual(0);
  });
});

describe('arrayBufferToBase64', () => {
  it('encodes small and large buffers', () => {
    expect(arrayBufferToBase64(PNG_BYTES.buffer)).toBe('iVBORw==');
    const big = new Uint8Array(100_000).fill(65); // > one 32 KB chunk
    expect(atob(arrayBufferToBase64(big.buffer))).toBe('A'.repeat(100_000));
  });
});

describe('generateImage — Pollinations', () => {
  it('fetches the image directly and returns base64 with its mime type', async () => {
    fetchMock.mockResolvedValue(imageResponse(PNG_BYTES, 'image/jpeg; charset=binary'));
    const result = await generateImage('a starship', POLLINATIONS);
    expect(result).toEqual({ base64: 'iVBORw==', mimeType: 'image/jpeg' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\/a%20starship\?/);
    expect(init.headers).toEqual({});
  });

  it('sends an optional API key as a bearer token', async () => {
    fetchMock.mockResolvedValue(imageResponse(PNG_BYTES));
    await generateImage('x', { ...POLLINATIONS, apiKey: ' pk_123 ' });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer pk_123' });
  });

  it('reports HTTP errors', async () => {
    fetchMock.mockResolvedValue(new Response('Too many requests', { status: 429 }));
    await expect(generateImage('x', POLLINATIONS)).rejects.toThrow(
      'Pollinations error 429: Too many requests',
    );
  });

  it('rejects non-image responses', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":"x"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(generateImage('x', POLLINATIONS)).rejects.toThrow(
      'Pollinations returned application/json instead of an image',
    );
    const noType = new Response(PNG_BYTES, { status: 200 });
    noType.headers.delete('Content-Type');
    fetchMock.mockResolvedValue(noType);
    await expect(generateImage('x', POLLINATIONS)).rejects.toThrow('no content type');
  });
});

describe('generateImage — OpenAI format', () => {
  it('posts through the proxy and returns the image', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ b64_json: 'AAAA' }] }));
    const result = await generateImage('a cat', OPENAI);
    expect(result).toEqual({ base64: 'AAAA', mimeType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/llm-proxy');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-img',
      'X-LLM-Target-URL': 'https://api.openai.com/v1/images/generations',
      'x-custom-x-team': 'blue',
    });
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-image-1.5', prompt: 'a cat' });
  });

  it('reports HTTP errors and empty results', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    await expect(generateImage('x', OPENAI)).rejects.toThrow('Image API error 401: nope');
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] }));
    await expect(generateImage('x', OPENAI)).rejects.toThrow('No image data in response');
  });
});

describe('generateImage — Gemini format', () => {
  it('returns the inline image part', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: 'hi' }, { inlineData: { data: 'BBBB', mimeType: 'image/webp' } }],
            },
          },
        ],
      }),
    );
    expect(await generateImage('x', GEMINI)).toEqual({ base64: 'BBBB', mimeType: 'image/webp' });
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('g-key');
  });

  it('defaults the mime type, and reports errors and missing images', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: 'CC' } }] } }] }),
    );
    expect((await generateImage('x', GEMINI)).mimeType).toBe('image/png');
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 500 }));
    await expect(generateImage('x', GEMINI)).rejects.toThrow('Gemini Image API error 500: bad');
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await expect(generateImage('x', GEMINI)).rejects.toThrow('No image data in Gemini response');
  });
});

describe('executeImageGenTool', () => {
  it('refuses when not configured', async () => {
    expect((await executeImageGenTool({ prompt: 'x' }, null)).result).toMatch(/not configured/);
    expect((await executeImageGenTool({ prompt: 'x' }, { ...OPENAI, apiKey: '' })).result).toMatch(
      /not configured/,
    );
  });

  it('generates with Pollinations without a key', async () => {
    fetchMock.mockResolvedValue(imageResponse(PNG_BYTES));
    const { result, dataUrl } = await executeImageGenTool({ prompt: 'x' }, POLLINATIONS);
    expect(result).toMatch(/^success: image generated/);
    expect(dataUrl).toBe('data:image/jpeg;base64,iVBORw==');
  });
});

describe('image prompt instructions', () => {
  it('tells the character to write self-contained prompts with setting, looks and style', () => {
    const p = buildImageGenPrompt();
    expect(p).toContain('generate_image');
    expect(p).toContain('sees ONLY your prompt');
    expect(p).toContain('setting and genre');
    expect(p).toContain('your appearance');
    expect(p).toContain('consistent art style');
  });

  it('repeats the key rules in the tool parameter description', () => {
    const [tool] = getImageGenToolDefinitions();
    const prompt = tool.function.parameters.properties.prompt as { description: string };
    expect(prompt.description).toMatch(/Self-contained/);
    expect(prompt.description).toMatch(/setting and genre/);
  });
});
