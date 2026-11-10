/**
 * Image Generation API Client
 * Supports OpenAI (DALL-E), Gemini, and Pollinations.ai (free, no key) formats
 */

export type ImageGenProvider = 'openai' | 'gemini' | 'pollinations';

export interface ImageGenConfig {
  provider: ImageGenProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  customHeaders?: string;
}

export interface ImageGenResult {
  base64: string;
  mimeType: string;
}

import { logger } from './logger';
import { loadPersistedConfig } from './configPersistence';

const CONFIG_KEY = 'webuiapps-imagegen-config';

const DEFAULT_CONFIGS: Record<ImageGenProvider, Omit<ImageGenConfig, 'apiKey'>> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-image-1.5',
  },
  gemini: {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.1-flash-image-preview',
  },
  pollinations: {
    provider: 'pollinations',
    baseUrl: 'https://image.pollinations.ai',
    model: 'flux',
  },
};

/** Providers that work without an API key. */
const KEYLESS_PROVIDERS: ReadonlySet<ImageGenProvider> = new Set(['pollinations']);

export function requiresApiKey(provider: ImageGenProvider): boolean {
  return !KEYLESS_PROVIDERS.has(provider);
}

/** True when image generation is usable: a key is set, or the provider needs none. */
export function isImageGenConfigured(config: ImageGenConfig | null | undefined): boolean {
  if (!config?.baseUrl?.trim()) return false;
  return !requiresApiKey(config.provider) || !!config.apiKey?.trim();
}

export function getDefaultImageGenConfig(
  provider: ImageGenProvider,
): Omit<ImageGenConfig, 'apiKey'> {
  return DEFAULT_CONFIGS[provider];
}

/**
 * Load image gen config — priority: local file (~/.openroom/config.json) > localStorage.
 * Falls back gracefully if the dev server API is unavailable.
 */
export async function loadImageGenConfig(): Promise<ImageGenConfig | null> {
  // 1. Try local file via dev-server API
  try {
    const persisted = await loadPersistedConfig();
    if (persisted?.imageGen) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(persisted.imageGen));
      return persisted.imageGen;
    }
  } catch {
    // API not available — fall through
  }

  // 2. Fall back to localStorage
  return loadImageGenConfigSync();
}

/** Synchronous read from localStorage cache. */
export function loadImageGenConfigSync(): ImageGenConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveImageGenConfig(config: ImageGenConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Parse custom headers, adding x-custom- prefix */
function parseCustomHeaders(raw?: string): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim().toLowerCase();
      const val = trimmed.slice(idx + 1).trim();
      headers[`x-custom-${key}`] = val;
    }
  }
  return headers;
}

export async function generateImage(
  prompt: string,
  config: ImageGenConfig,
): Promise<ImageGenResult> {
  logger.info(
    'ImageGen',
    'generateImage called, provider:',
    config.provider,
    'model:',
    config.model,
    'prompt:',
    prompt.slice(0, 100),
  );
  if (config.provider === 'gemini') {
    return generateImageGemini(prompt, config);
  }
  if (config.provider === 'pollinations') {
    return generateImagePollinations(prompt, config);
  }
  return generateImageOpenAI(prompt, config);
}

async function generateImageOpenAI(
  prompt: string,
  config: ImageGenConfig,
): Promise<ImageGenResult> {
  const targetUrl = `${config.baseUrl}/v1/images/generations`;
  const body = {
    model: config.model,
    prompt,
    n: 1,
    response_format: 'b64_json',
  };

  const res = await fetch('/api/llm-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-LLM-Target-URL': targetUrl,
      ...parseCustomHeaders(config.customHeaders),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data in response');

  return { base64: b64, mimeType: 'image/png' };
}

/** Encode binary data as base64 without blowing the call stack on large images. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Build the Pollinations image URL. A random seed avoids getting a cached image back. */
export function buildPollinationsUrl(
  prompt: string,
  config: ImageGenConfig,
  seed = Math.floor(Math.random() * 1_000_000_000),
): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    width: '1024',
    height: '1024',
    nologo: 'true',
    seed: String(seed),
  });
  if (config.model.trim()) params.set('model', config.model.trim());
  return `${base}/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/**
 * Pollinations.ai: free, no account. A GET returns the image itself; the
 * service allows cross-origin requests, so the browser fetches it directly.
 */
async function generateImagePollinations(
  prompt: string,
  config: ImageGenConfig,
): Promise<ImageGenResult> {
  const headers: Record<string, string> = config.apiKey?.trim()
    ? { Authorization: `Bearer ${config.apiKey.trim()}` }
    : {};
  const res = await fetch(buildPollinationsUrl(prompt, config), { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pollinations error ${res.status}: ${text.slice(0, 200)}`);
  }
  const mimeType = (res.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Pollinations returned ${mimeType || 'no content type'} instead of an image`);
  }
  return { base64: arrayBufferToBase64(await res.arrayBuffer()), mimeType };
}

async function generateImageGemini(
  prompt: string,
  config: ImageGenConfig,
): Promise<ImageGenResult> {
  const targetUrl = `${config.baseUrl}/v1beta/models/${config.model}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  };

  const res = await fetch('/api/llm-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
      'X-LLM-Target-URL': targetUrl,
      ...parseCustomHeaders(config.customHeaders),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Image API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(
    (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData,
  );
  if (!imagePart?.inlineData) throw new Error('No image data in Gemini response');

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  };
}
