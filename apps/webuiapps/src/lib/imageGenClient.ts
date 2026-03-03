/**
 * Image Generation API Client
 * Supports OpenAI (DALL-E) and Gemini formats
 */

export type ImageGenProvider = 'openai' | 'gemini';

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

const CONFIG_KEY = 'webuiapps-imagegen-config';

const DEFAULT_CONFIGS: Record<ImageGenProvider, Omit<ImageGenConfig, 'apiKey'>> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    model: 'dall-e-3',
  },
  gemini: {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash-exp',
  },
};

export function getDefaultImageGenConfig(
  provider: ImageGenProvider,
): Omit<ImageGenConfig, 'apiKey'> {
  return DEFAULT_CONFIGS[provider];
}

export function loadImageGenConfig(): ImageGenConfig | null {
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
  console.info(
    '[ImageGen] generateImage called, provider:',
    config.provider,
    'model:',
    config.model,
    'prompt:',
    prompt.slice(0, 100),
  );
  if (config.provider === 'gemini') {
    return generateImageGemini(prompt, config);
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

async function generateImageGemini(
  prompt: string,
  config: ImageGenConfig,
): Promise<ImageGenResult> {
  const targetUrl = `${config.baseUrl}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
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
