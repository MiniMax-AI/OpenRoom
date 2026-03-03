/**
 * Vibe Environment Info Module
 *
 * Wraps three info query interfaces provided by vibe-container:
 * - getUserInfo()        → Current user info (nickname, avatar, etc.)
 * - getCharacterInfo()   → Current NPC character info
 * - getSystemSettings()  → System settings (language, etc.)
 *
 * Call fetchVibeInfo() once during app initialization, then consume
 * cached data via getVibeInfo() or useVibeInfo().
 *
 * System language is automatically synced to i18n; no manual handling needed.
 */

import { useState, useEffect } from 'react';
import {
  getClientComManager,
  type UserInfoResponse,
  type CharacterInfoResponse,
  type SystemSettingsResponse,
} from '@gui/vibe-container';
import i18n from 'i18next';
import { normalizeLang } from '@/i18';

// ============ Type Definitions ============

export interface VibeInfo {
  /** Current user info */
  userInfo: UserInfoResponse | null;
  /** Current character (NPC) info */
  characterInfo: CharacterInfoResponse | null;
  /** System settings (including language) */
  systemSettings: SystemSettingsResponse | null;
}

// ============ Module-Level Cache ============

let cachedInfo: VibeInfo = {
  userInfo: null,
  characterInfo: null,
  systemSettings: null,
};

/** Subscriber list (used to notify hooks when fetch completes) */
const subscribers = new Set<(_info: VibeInfo) => void>();

/** Whether info has been successfully fetched */
let fetched = false;

// ============ Core Functions ============

/**
 * Fetch user info, character info, and system settings from vibe-container
 *
 * Should be called once during app initialization (after handshake, before data loading).
 * Automatically syncs language to i18n internally.
 *
 * @returns The fetched VibeInfo
 */
export async function fetchVibeInfo(): Promise<VibeInfo> {
  const manager = getClientComManager();

  const [userInfo, characterInfo, systemSettings] = await Promise.all([
    manager.getUserInfo().catch((err) => {
      console.warn('[VibeInfo] getUserInfo failed:', err);
      return undefined;
    }),
    manager.getCharacterInfo().catch((err) => {
      console.warn('[VibeInfo] getCharacterInfo failed:', err);
      return undefined;
    }),
    manager.getSystemSettings().catch((err) => {
      console.warn('[VibeInfo] getSystemSettings failed:', err);
      return undefined;
    }),
  ]);

  cachedInfo = {
    userInfo: userInfo ?? null,
    characterInfo: characterInfo ?? null,
    systemSettings: systemSettings ?? null,
  };
  fetched = true;

  console.info('[VibeInfo] fetched:', cachedInfo);

  // Sync system language to i18n
  if (systemSettings?.language?.current) {
    const lang = normalizeLang(systemSettings.language.current);
    if (i18n.language !== lang) {
      try {
        await i18n.changeLanguage(lang);
        console.info('[VibeInfo] Language switched to:', lang);
      } catch (err) {
        console.warn('[VibeInfo] Failed to switch language:', err);
      }
    }
  }

  // Notify subscribers
  subscribers.forEach((fn) => fn(cachedInfo));

  return cachedInfo;
}

/**
 * Synchronously get cached Vibe environment info (non-Hook)
 *
 * Returns null values before fetchVibeInfo() has been called.
 */
export function getVibeInfo(): VibeInfo {
  return cachedInfo;
}

/**
 * Check whether info has been successfully fetched
 */
export function isVibeInfoFetched(): boolean {
  return fetched;
}

// ============ React Hook ============

/**
 * Consume Vibe environment info in React components
 *
 * Returns cached value on first render (may be empty);
 * automatically re-renders when fetchVibeInfo() completes.
 *
 * @example
 * const { userInfo, characterInfo, systemSettings } = useVibeInfo();
 * const displayName = userInfo?.nickname ?? 'Guest';
 */
export function useVibeInfo(): VibeInfo {
  const [info, setInfo] = useState<VibeInfo>(cachedInfo);

  useEffect(() => {
    // If cache already has a value different from current state, sync immediately
    if (fetched && info !== cachedInfo) {
      setInfo(cachedInfo);
    }

    // Subscribe to subsequent updates
    const handler = (newInfo: VibeInfo) => setInfo(newInfo);
    subscribers.add(handler);
    return () => {
      subscribers.delete(handler);
    };
  }, []);

  return info;
}
