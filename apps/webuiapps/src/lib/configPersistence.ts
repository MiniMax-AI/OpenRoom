/**
 * Unified config persistence for ~/.openroom/config.json
 *
 * The persisted format is: { llm: LLMConfig, imageGen?: ImageGenConfig }
 * Legacy files that contain a flat LLMConfig (with top-level "provider") are
 * automatically migrated on read.
 */

import type { LLMConfig } from './llmModels';
import type { LLMConfigUpdate } from './llmModels';
import type { ImageGenConfig, ImageGenConfigUpdate } from './imageGenClient';

export interface PersistedConfig {
  llm: LLMConfig;
  imageGen?: ImageGenConfig;
}

export interface PersistedConfigUpdate {
  llm: LLMConfigUpdate;
  imageGen?: ImageGenConfigUpdate | null;
}

const CONFIG_API = '/api/llm-config';

/** Detect legacy flat LLMConfig (has "provider" at top level, no "llm" key). */
function isLegacyConfig(obj: unknown): obj is LLMConfig {
  return typeof obj === 'object' && obj !== null && 'provider' in obj && !('llm' in obj);
}

/**
 * Load the client-safe persisted config from ~/.openroom/config.json via the
 * dev-server API. API keys are redacted server-side and exposed only as
 * hasApiKey booleans.
 */
export async function loadPersistedConfig(): Promise<PersistedConfig | null> {
  try {
    const res = await fetch(CONFIG_API);
    if (res.ok) {
      const data: unknown = await res.json();
      if (isLegacyConfig(data)) {
        return { llm: data };
      }
      if (typeof data === 'object' && data !== null && 'llm' in data) {
        return data as PersistedConfig;
      }
    }
  } catch {
    // API not available (production / network error)
  }
  return null;
}

/**
 * Save config updates to ~/.openroom/config.json via the dev-server API.
 * API keys may be omitted to preserve the existing server-side secret.
 */
export async function savePersistedConfig(config: PersistedConfigUpdate): Promise<void> {
  const res = await fetch(CONFIG_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to save config (${res.status})${detail ? `: ${detail}` : ''}`);
  }
}
