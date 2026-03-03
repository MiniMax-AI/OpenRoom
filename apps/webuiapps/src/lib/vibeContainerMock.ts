/**
 * @gui/vibe-container Local Mock
 *
 * Replaces the real vibe-container SDK so Apps can run standalone without an iframe host.
 * File operations are delegated to IndexedDB; Actions communicate via a local event bus.
 */

import * as idb from './indexedDbStorage';
import { isReportUserActionsEnabled } from './action';

// ============ AppLifecycle Enum ============

export enum AppLifecycle {
  LOADING = 1,
  DOM_READY = 2,
  LOADED = 3,
  ERROR = 4,
  UNLOADING = 5,
  DESTROYED = 6,
}

// ============ Type Exports (satisfy App's import type) ============

export interface UserInfoResponse {
  user_id?: string;
  nickname?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface CharacterInfoResponse {
  character_id?: string;
  name?: string;
  description?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface SystemSettingsResponse {
  language?: {
    current?: string;
    options?: string[];
  };
  [key: string]: unknown;
}

// ============ Action Event Bus ============

type AgentMessageCallback = (payload: { content: string }) => void;
type UserActionCallback = (event: unknown) => void;

const agentMessageCallbacks = new Set<AgentMessageCallback>();
const userActionCallbacks = new Set<UserActionCallback>();

// ============ OS Event Bus ============

type OSEventCallback = (event: { type: string; [key: string]: unknown }) => void;
const osEventCallbacks = new Set<OSEventCallback>();

/**
 * Listen for OS events (e.g. wallpaper changes)
 */
export function onOSEvent(callback: OSEventCallback): () => void {
  osEventCallbacks.add(callback);
  return () => osEventCallbacks.delete(callback);
}

// ============ OS Window Manager ============

import { openWindow, closeWindow, getWindows as getWins } from './windowManager';

// ============ Action Parameter Translation ============
// The LLM sends user-friendly params (e.g. content, title), but the App expects filePath pointing to written files.
// This layer translates LLM params to the format the App expects before dispatching the Action.

/**
 * Translate Action params: LLM params -> App-expected param format
 * For Actions that require pre-written files, write to IndexedDB first, then replace params with filePath
 */
/**
 * Pass through Action params without any transformation.
 * All file operations (create, update, delete) are handled by the LLM via file tools;
 * Actions are only used to notify the App to refresh the UI.
 */
function translateActionParams(action: {
  app_id: number;
  action_type: string;
  params?: Record<string, string>;
}): Record<string, string> | undefined {
  return action.params;
}

/**
 * Read App data from IndexedDB for the LLM to directly obtain context.
 * For REFRESH / query-type actions, returns a data summary string; otherwise returns null.
 */

/**
 * Called by ChatPanel: dispatch an LLM-returned Action to the App.
 * Returns a Promise that resolves when the App handler finishes processing and returns a result.
 */
export async function dispatchAgentAction(action: {
  app_id: number;
  action_id?: number;
  action_type: string;
  params?: Record<string, string>;
}): Promise<string> {
  // OS actions (app_id=1) are handled directly here
  if (action.app_id === 1) {
    if (action.action_type === 'OPEN_APP') {
      const targetAppId = Number(action.params?.app_id);
      openWindow(targetAppId);
      return 'success';
    }
    if (action.action_type === 'CLOSE_APP') {
      const targetAppId = Number(action.params?.app_id);
      closeWindow(targetAppId);
      return 'success';
    }
    if (action.action_type === 'SET_WALLPAPER') {
      const url = action.params?.wallpaper_url;
      if (!url) return 'error: missing wallpaper_url';
      await idb.putTextFilesByJSON({
        files: [
          {
            path: '/wallpaper',
            name: 'state.json',
            content: JSON.stringify({ selected_wallpaper: url }),
          },
        ],
      });
      osEventCallbacks.forEach((cb) => cb({ type: 'SET_WALLPAPER', wallpaper_url: url }));
      return 'success';
    }
    return 'error: unknown OS action';
  }

  // Translate Action params
  const translatedParams = await translateActionParams(action);

  // If the target App window is not open, automatically open it
  const wins2 = getWins();
  const isOpen = wins2.some((w) => w.appId === action.app_id);
  if (!isOpen) {
    openWindow(action.app_id);
  }

  // Collect extra info generated during translation (e.g. newly created IDs) to append to the App's return result
  const extraInfo: Record<string, string> = {};
  if (translatedParams) {
    if (translatedParams.filePath) {
      const match = translatedParams.filePath.match(/\/([^/]+)\.json$/);
      if (match) extraInfo.id = match[1];
    }
  }

  return new Promise((resolve) => {
    const fullAction = {
      ...action,
      params: translatedParams,
      action_id: action.action_id ?? Date.now(),
      timestamp_ms: Date.now(),
      trigger_by: 2, // Agent
    };

    // If the window was just opened, wait for the component to mount before dispatching
    const delay = isOpen ? 0 : 1500;

    // Temporarily listen for the sendAgentMessage callback result
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve('timeout: no response from app');
      }
    }, 10000 + delay);

    const originalSend = mockManager.sendAgentMessage;
    mockManager.sendAgentMessage = (event: unknown) => {
      const evt = event as { action_result?: string; app_action?: { action_id?: number } };
      if (evt.action_result !== undefined && evt.app_action?.action_id === fullAction.action_id) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          // Append extra info from the translation phase (e.g. generated IDs)
          let result = evt.action_result || 'done';
          if (Object.keys(extraInfo).length > 0) {
            result += ' ' + JSON.stringify(extraInfo);
          }
          resolve(result);
        }
        mockManager.sendAgentMessage = originalSend;
        return;
      }
      originalSend(event);
    };

    // Trigger all onAgentMessage callbacks (delayed to wait for window mount)
    const dispatch = () => {
      const payload = { content: JSON.stringify(fullAction) };
      agentMessageCallbacks.forEach((cb) => cb(payload));
    };
    if (delay > 0) {
      setTimeout(dispatch, delay);
    } else {
      dispatch();
    }
  });
}

/**
 * Called by ChatPanel to listen for App user action reports
 */
export function onUserAction(callback: UserActionCallback): () => void {
  userActionCallbacks.add(callback);
  return () => userActionCallbacks.delete(callback);
}

/**
 * Report user OS-level actions (OPEN_APP / CLOSE_APP) to the LLM
 */
export function reportUserOsAction(actionType: string, params: Record<string, string>) {
  if (!isReportUserActionsEnabled()) return;
  const event = {
    app_action: {
      app_id: 1,
      action_type: actionType,
      params,
      trigger_by: 1,
    },
  };
  userActionCallbacks.forEach((cb) => cb(event));
}

// ============ Mock Manager ============

const mockManager = {
  // Handshake related — no-op
  handshake: () => Promise.resolve(),
  ready: () => Promise.resolve(),

  // File operations — delegated to IndexedDB
  listFiles: <T>(data: { path: string }): Promise<T> => idb.listFiles(data.path) as Promise<T>,

  getFile: <T>(data: { file_path: string }): Promise<T> =>
    idb.getFile(data.file_path) as Promise<T>,

  putTextFilesByJSON: (data: {
    files: Array<{ path?: string; name?: string; content?: string }>;
  }) => {
    // Intercept music seed data writes, replacing invalid local audioUrl with real URLs
    const AUDIO_URL_MAP: Record<string, string> = {
      '/music/midnight-dreams.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      '/music/ocean-waves.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      '/music/electric-pulse.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      '/music/golden-hour.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      '/music/forest-rain.mp3': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    };
    const patched = {
      files: data.files.map((f) => {
        if (!f.content || !f.name?.endsWith('.json')) return f;
        try {
          const obj = JSON.parse(f.content);
          if (obj.audioUrl && AUDIO_URL_MAP[obj.audioUrl]) {
            obj.audioUrl = AUDIO_URL_MAP[obj.audioUrl];
            return { ...f, content: JSON.stringify(obj) };
          }
        } catch {
          // not JSON, skip
        }
        return f;
      }),
    };
    return idb.putTextFilesByJSON(patched);
  },

  deleteFilesByPaths: (data: { file_paths: string[] }) => idb.deleteFilesByPaths(data),

  searchFiles: <T>(data: { query: string }): Promise<T> => idb.searchFiles(data) as Promise<T>,

  // Agent messages
  sendAgentMessage: (event: unknown) => {
    console.info('[MockVibe] sendAgentMessage:', event);
    // When the toggle is off, discard user-triggered actions (keep Agent's action_result callbacks)
    if (!isReportUserActionsEnabled()) {
      const evt = event as { action_result?: string; app_action?: { trigger_by?: number } };
      // Events without action_result are user-initiated reports; discard them
      if (evt.action_result === undefined) {
        console.info('[MockVibe] sendAgentMessage: blocked by reportUserActions=false');
        return;
      }
    }
    userActionCallbacks.forEach((cb) => cb(event));
  },

  onAgentMessage: (callback: AgentMessageCallback): (() => void) => {
    agentMessageCallbacks.add(callback);
    return () => agentMessageCallbacks.delete(callback);
  },

  // Info queries
  getUserInfo: (): Promise<UserInfoResponse> =>
    Promise.resolve({ user_id: 'local', nickname: 'Local User' }),

  getCharacterInfo: (): Promise<CharacterInfoResponse> =>
    Promise.resolve({ character_id: 'assistant', name: 'Assistant' }),

  getSystemSettings: (): Promise<SystemSettingsResponse> =>
    Promise.resolve({
      language: { current: navigator.language, options: ['en', 'zh'] },
    }),
};

// ============ Public API ============

/**
 * Initialize Vibe App — returns the mock manager
 */
export function initVibeApp(_config?: unknown) {
  return mockManager;
}

/**
 * Get ClientComManager singleton — returns the same mock manager
 */
export function getClientComManager() {
  return mockManager;
}
