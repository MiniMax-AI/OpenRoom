/**
 * Unified config persistence for ~/.openroom/config.json
 *
 * The persisted format is: { llm: LLMConfig, imageGen?: ImageGenConfig }
 * Legacy files that contain a flat LLMConfig (with top-level "provider") are
 * automatically migrated on read.
 */

import type { LLMConfig } from './llmModels';
import type { ImageGenConfig } from './imageGenClient';

export interface PersistedConfig {
  llm: LLMConfig;
  imageGen?: ImageGenConfig;
}

const CONFIG_API = '/api/llm-config';
const LS_CONFIG_KEY = 'openroom_config';

/** Detect legacy flat LLMConfig (has "provider" at top level, no "llm" key). */
function isLegacyConfig(obj: unknown): obj is LLMConfig {
  return typeof obj === 'object' && obj !== null && 'provider' in obj && !('llm' in obj);
}

function parseConfigData(data: unknown): PersistedConfig | null {
  if (isLegacyConfig(data)) {
    return { llm: data };
  }
  if (typeof data === 'object' && data !== null && 'llm' in data) {
    return data as PersistedConfig;
  }
  return null;
}

/**
 * Load the full persisted config from ~/.openroom/config.json via the dev-server API.
 * Falls back to localStorage for static/production builds.
 * Handles legacy flat LLMConfig format for backward compatibility.
 * Returns null if no config is available.
 */
export async function loadPersistedConfig(): Promise<PersistedConfig | null> {
  // Try server API first (dev mode)
  try {
    const res = await fetch(CONFIG_API);
    if (res.ok) {
      const data: unknown = await res.json();
      const config = parseConfigData(data);
      if (config) {
        // Mirror to localStorage for offline access
        try {
          localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(config));
        } catch {
          /* full */
        }
        return config;
      }
    }
  } catch {
    // API not available (production / network error)
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (raw) {
      const data: unknown = JSON.parse(raw);
      return parseConfigData(data);
    }
  } catch {
    // corrupted or unavailable
  }
  return null;
}

/**
 * Save the full config to ~/.openroom/config.json via the dev-server API.
 * Also persists to localStorage for static/production builds.
 * Always writes the new { llm, imageGen? } format.
 */
export async function savePersistedConfig(config: PersistedConfig): Promise<void> {
  // Always save to localStorage
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // localStorage full or unavailable
  }

  // Also try server API
  try {
    await fetch(CONFIG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  } catch {
    // Silently ignore if API is not available
  }
}
