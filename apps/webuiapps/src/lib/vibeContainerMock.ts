/**
 * @gui/vibe-container Local Mock
 *
 * Replaces the real vibe-container SDK so Apps can run standalone without an iframe host.
 * File operations are delegated to disk storage; Actions communicate via a local event bus.
 */

import i18next from 'i18next';
import * as idb from './diskStorage';
import { logger } from './logger';
import { isReportUserActionsEnabled } from './action';
import {
  newGame as chessNewGame,
  executeMove as chessExecuteMove,
  legalMovesFor as chessLegalMovesFor,
  legalMovesAlgebraic as chessLegalMovesAlgebraic,
  boardToFen as chessBoardToFen,
  suggestMove as chessSuggestMove,
  fromNotation as chessFromNotation,
  isValidState as chessIsValidState,
  type GameState as ChessGameState,
} from '../pages/Chess/engine';

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

// Wallpaper-dimmer state retained at module scope so newly-mounted apps
// (notably the Light app) can render with the correct initial value
// instead of starting at 0 and snapping to the real value on the first
// SET_OPACITY event. Updated by both the OS SET_OPACITY action handler
// (agent-driven) and setOpacityFromUI (user-driven via Light slider).
let currentWallpaperOpacity = 0;

/**
 * Returns the latest known wallpaper-dimmer opacity in [0, 1]. 0 = bright,
 * 1 = pitch black. Used by the Light app to show the correct slider
 * position on mount.
 */
export function getCurrentWallpaperOpacity(): number {
  return currentWallpaperOpacity;
}

/**
 * Dispatch a SET_OPACITY action from a user-driven UI surface (e.g. the
 * Light app's slider drag). Updates the retained state, fires the OS event
 * to redraw the scrim, and reports the user action so the agent sees that
 * the user dimmed the lights manually.
 */
export function setOpacityFromUI(value: number): void {
  const clamped = Math.max(0, Math.min(1, value));
  currentWallpaperOpacity = clamped;
  osEventCallbacks.forEach((cb) => cb({ type: 'SET_OPACITY', opacity: clamped }));
  reportUserOsAction('SET_OPACITY', { opacity: String(clamped) });
}

// ============ OS Window Manager ============

import { openWindow, closeWindow, getWindows as getWins } from './windowManager';
import { findAppIdByName } from './appRegistry';

/**
 * Resolve a caller-supplied app identifier (numeric string like "12" or
 * a human-friendly app name like "chess") to a numeric app_id. Returns
 * NaN if the value can't be resolved. Centralizing this here keeps the
 * OS OPEN_APP / CLOSE_APP handlers tolerant of either shape — Kayley's
 * brain naturally thinks in app names, while the internal registry is
 * keyed by numeric id.
 */
function resolveTargetAppId(raw: string | undefined): number {
  if (!raw) return NaN;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const byName = findAppIdByName(raw);
  return byName ?? NaN;
}

// ============ Listener-Ready Notification ============
// Tracks callback count at the moment each window was opened so we can detect
// whether the App's listener has registered since then (event-driven, no fixed delay).

interface WindowOpenSnapshot {
  callbackCount: number;
}
const windowOpenSnapshots = new Map<number, WindowOpenSnapshot>();

type ReadyResolver = () => void;
const listenerReadyResolvers: ReadyResolver[] = [];

function notifyListenerAdded() {
  const resolvers = listenerReadyResolvers.splice(0);
  resolvers.forEach((r) => r());
}

function hasNewListenerSince(appId: number): boolean {
  const snap = windowOpenSnapshots.get(appId);
  if (!snap) return true;
  return agentMessageCallbacks.size > snap.callbackCount;
}

// ============ Action Parameter Translation ============
// The LLM sends user-friendly params (e.g. content, title), but the App expects filePath pointing to written files.
// This layer translates LLM params to the format the App expects before dispatching the Action.

/**
 * Translate Action params: LLM params -> App-expected param format
 * For Actions that require pre-written files, write to disk storage first, then replace params with filePath
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
 * Read App data from disk storage for the LLM to directly obtain context.
 * For REFRESH / query-type actions, returns a data summary string; otherwise returns null.
 */

// ============ Chess Per-App Action Handler ============
// Chess state lives at this disk path — matches what createAppFileApi('chess') writes.
const CHESS_STATE_PATH = '/apps/chess/data/state.json';
const CHESS_APP_ID = 12;

/**
 * Read the current chess game state from disk. Returns null if no game exists
 * or the file is invalid / missing.
 */
async function loadChessState(): Promise<ChessGameState | null> {
  try {
    const raw = await idb.getFile(CHESS_STATE_PATH);
    if (!raw) return null;
    return chessIsValidState(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Persist a chess game state to disk (the same path the UI reads from).
 */
async function saveChessState(state: ChessGameState): Promise<void> {
  await idb.putTextFilesByJSON({
    files: [
      {
        path: '/apps/chess/data',
        name: 'state.json',
        content: JSON.stringify(state),
      },
    ],
  });
}

/**
 * Dispatch a Chess UI-notification action to the frontend if the window is
 * open. If it's not open, this is a no-op — the headless handler has already
 * persisted state.json, so whenever the window opens next it will load the
 * latest game from disk. Fire-and-forget: the Agent's authoritative result
 * comes from the headless engine, not the UI.
 */
function notifyChessUi(
  actionType: 'AGENT_MOVE' | 'SYNC_STATE' | 'NEW_GAME',
  extra: Record<string, string> = {},
): void {
  const wins = getWins();
  const isOpen = wins.some((w) => w.appId === CHESS_APP_ID);
  if (!isOpen) return;
  const payload = {
    app_id: CHESS_APP_ID,
    action_type: actionType,
    action_id: Date.now(),
    timestamp_ms: Date.now(),
    trigger_by: 2,
    params: { filePath: CHESS_STATE_PATH, ...extra },
  };
  const content = JSON.stringify(payload);
  agentMessageCallbacks.forEach((cb) => cb({ content }));
}

/**
 * Per-app action dispatcher for Chess. All moves are validated by the engine
 * before mutating state; invalid input returns a descriptive error string.
 */
async function handleChessAction(action: {
  app_id: number;
  action_type: string;
  params?: Record<string, string>;
}): Promise<string> {
  const type = action.action_type;
  const p = action.params ?? {};

  if (type === 'START_GAME') {
    const fresh = chessNewGame();
    await saveChessState(fresh);
    notifyChessUi('NEW_GAME', { gameId: fresh.gameId });
    return JSON.stringify({ fen: chessBoardToFen(fresh) });
  }

  if (type === 'GET_BOARD') {
    const state = await loadChessState();
    if (!state) {
      return 'error: no active game — call chess/START_GAME first';
    }
    return JSON.stringify({
      fen: chessBoardToFen(state),
      turn: state.currentTurn,
      legal_moves: chessLegalMovesAlgebraic(state),
    });
  }

  if (type === 'MAKE_MOVE') {
    const state = await loadChessState();
    if (!state) {
      return 'error: no active game — call chess/START_GAME first';
    }
    if (
      state.gameStatus === 'checkmate' ||
      state.gameStatus === 'stalemate' ||
      state.gameStatus === 'draw'
    ) {
      return `error: game is over (${state.gameStatus})`;
    }

    const fromSq = p.from;
    const toSq = p.to;
    if (!fromSq || !toSq) {
      return 'error: missing required params "from" and "to" (e.g. from="e2", to="e4")';
    }
    const from = chessFromNotation(fromSq);
    const to = chessFromNotation(toSq);
    if (!from || !to) {
      return `error: invalid square notation — from="${fromSq}", to="${toSq}" (expected e.g. "e2")`;
    }

    const piece = state.board[from[0]][from[1]];
    if (!piece) {
      return `error: no piece on ${fromSq}`;
    }
    if (piece.color !== state.currentTurn) {
      return `error: it is ${state.currentTurn}'s turn — ${fromSq} is a ${piece.color} piece`;
    }

    const legal = chessLegalMovesFor(
      state.board,
      from[0],
      from[1],
      state.castlingRights,
      state.enPassantTarget,
    );
    const isLegal = legal.some((t) => t[0] === to[0] && t[1] === to[1]);
    if (!isLegal) {
      return `error: illegal move ${fromSq}->${toSq}`;
    }

    const nextState = chessExecuteMove(state, from, to);
    await saveChessState(nextState);
    notifyChessUi('AGENT_MOVE', { from: fromSq, to: toSq });

    const result: Record<string, unknown> = {
      fen: chessBoardToFen(nextState),
      last_move: `${fromSq}${toSq}`,
      turn: nextState.currentTurn,
    };
    if (
      nextState.gameStatus === 'checkmate' ||
      nextState.gameStatus === 'stalemate' ||
      nextState.gameStatus === 'draw'
    ) {
      result.game_over = nextState.gameStatus;
    }
    return JSON.stringify(result);
  }

  if (type === 'SURRENDER') {
    const state = await loadChessState();
    if (!state) {
      return 'error: no active game — call chess/START_GAME first';
    }
    // By convention Kayley plays black, Steven plays white. SURRENDER is
    // called by Kayley's brain — so Steven wins.
    const surrendered: ChessGameState = {
      ...state,
      gameStatus: 'checkmate',
      winner: 'w',
      isAgentThinking: false,
    };
    await saveChessState(surrendered);
    notifyChessUi('SYNC_STATE');
    return JSON.stringify({ result: 'steven_won' });
  }

  if (type === 'HINT') {
    const state = await loadChessState();
    if (!state) {
      return 'error: no active game — call chess/START_GAME first';
    }
    const hint = chessSuggestMove(state);
    if (!hint) {
      return 'error: no legal moves available';
    }
    return JSON.stringify({ suggested_move: hint.move, reason: hint.reason });
  }

  return `error: unknown chess action_type "${type}" — valid: START_GAME, MAKE_MOVE, GET_BOARD, SURRENDER, HINT`;
}

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
      const targetAppId = resolveTargetAppId(action.params?.app_id);
      if (!Number.isFinite(targetAppId)) {
        return `error: unknown app_id "${action.params?.app_id ?? ''}" — pass a numeric id or canonical app name (e.g. "chess", "album", "diary")`;
      }
      openWindow(targetAppId);
      windowOpenSnapshots.set(targetAppId, { callbackCount: agentMessageCallbacks.size });
      return 'success';
    }
    if (action.action_type === 'CLOSE_APP') {
      const targetAppId = resolveTargetAppId(action.params?.app_id);
      if (!Number.isFinite(targetAppId)) {
        return `error: unknown app_id "${action.params?.app_id ?? ''}" — pass a numeric id or canonical app name (e.g. "chess", "album", "diary")`;
      }
      closeWindow(targetAppId);
      windowOpenSnapshots.delete(targetAppId);
      return 'success';
    }
    if (action.action_type === 'SET_OPACITY') {
      const raw = action.params?.opacity;
      const parsed = typeof raw === 'string' ? Number(raw) : NaN;
      if (!Number.isFinite(parsed)) {
        return 'error: SET_OPACITY requires numeric opacity param in [0.0, 1.0]';
      }
      const clamped = Math.max(0, Math.min(1, parsed));
      currentWallpaperOpacity = clamped;
      osEventCallbacks.forEach((cb) => cb({ type: 'SET_OPACITY', opacity: clamped }));
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

  // Chess actions (app_id=12) are handled directly — we own an authoritative
  // headless chess engine in the dispatcher so Kayley can play even if the
  // Chess window isn't open. state.json stays the source of truth so when
  // the UI is open, a subsequent SYNC_STATE notification refreshes it.
  if (action.app_id === 12) {
    return handleChessAction(action);
  }

  /** Mystery GM responses can exceed 10s (Haiku); keep below browser GM client timeout. */
  const MYSTERY_APP_ID = 17;
  const mysteryDispatchTimeoutMs = action.app_id === MYSTERY_APP_ID ? 72_000 : 0;
  if (action.app_id === MYSTERY_APP_ID) {
    void import('./mysteryLogger')
      .then(({ mysteryLog }) => {
        mysteryLog(
          'info',
          'vibeContainerMock',
          'dispatchAgentAction.enter',
          `Mystery dispatch entered: ${action.action_type}`,
          {
            action_type: action.action_type,
            action_id: action.action_id,
            params_keys: Object.keys(action.params ?? {}),
            callback_count: agentMessageCallbacks.size,
            dispatch_timeout_ms: mysteryDispatchTimeoutMs,
          },
        );
      })
      .catch(() => {
        /* noop — logger import shouldn't block dispatch */
      });
  }

  // Translate Action params
  const translatedParams = await translateActionParams(action);

  // If the target App window is not open, automatically open it
  const wins2 = getWins();
  const isOpen = wins2.some((w) => w.appId === action.app_id);
  if (!isOpen) {
    openWindow(action.app_id);
    windowOpenSnapshots.set(action.app_id, { callbackCount: agentMessageCallbacks.size });
  }

  const needsListenerWait = !hasNewListenerSince(action.app_id);

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

    let resolved = false;
    const defaultMs = needsListenerWait ? 20000 : 10000;
    const timeoutMs = mysteryDispatchTimeoutMs > 0 ? mysteryDispatchTimeoutMs : defaultMs;
    const timeout = setTimeout(
      () => {
        if (!resolved) {
          resolved = true;
          resolve('timeout: no response from app');
        }
      },
      timeoutMs,
    );

    const originalSend = mockManager.sendAgentMessage;
    mockManager.sendAgentMessage = (event: unknown) => {
      const evt = event as { action_result?: string; app_action?: { action_id?: number } };
      if (evt.action_result !== undefined && evt.app_action?.action_id === fullAction.action_id) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          let result = evt.action_result || 'done';
          if (Object.keys(extraInfo).length > 0) {
            result += ' ' + JSON.stringify(extraInfo);
          }
          if (action.app_id === MYSTERY_APP_ID) {
            void import('./mysteryLogger')
              .then(({ mysteryLog }) => {
                mysteryLog(
                  'info',
                  'vibeContainerMock',
                  'dispatchAgentAction.resolved',
                  `Mystery action_result received for ${action.action_type}`,
                  {
                    action_type: action.action_type,
                    action_id: fullAction.action_id,
                    result_length: result.length,
                    result_prefix: result.slice(0, 120),
                  },
                );
              })
              .catch(() => {
                /* noop */
              });
          }
          resolve(result);
        }
        mockManager.sendAgentMessage = originalSend;
        return;
      }
      originalSend(event);
    };

    const dispatch = () => {
      if (resolved) return;
      const payload = { content: JSON.stringify(fullAction) };
      if (action.app_id === MYSTERY_APP_ID) {
        void import('./mysteryLogger')
          .then(({ mysteryLog }) => {
            mysteryLog(
              'info',
              'vibeContainerMock',
              'dispatchAgentAction.broadcast',
              `Broadcasting to ${agentMessageCallbacks.size} listener(s)`,
              {
                action_type: action.action_type,
                action_id: fullAction.action_id,
                listener_count: agentMessageCallbacks.size,
              },
            );
          })
          .catch(() => {
            /* noop */
          });
      }
      agentMessageCallbacks.forEach((cb) => cb(payload));
    };

    // Always dispatch immediately (optimistic — succeeds if listener is already registered).
    dispatch();

    // If the App's listener might not be ready yet, also subscribe to the
    // listener-registration notification and re-dispatch when a new listener appears.
    if (needsListenerWait) {
      listenerReadyResolvers.push(() => {
        windowOpenSnapshots.delete(action.app_id);
        setTimeout(dispatch, 0);
      });
    } else {
      windowOpenSnapshots.delete(action.app_id);
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

  // File operations — delegated to disk storage
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
    logger.info('MockVibe', 'sendAgentMessage:', event);
    // When the toggle is off, discard user-triggered actions (keep Agent's action_result callbacks)
    if (!isReportUserActionsEnabled()) {
      const evt = event as { action_result?: string; app_action?: { trigger_by?: number } };
      // Events without action_result are user-initiated reports; discard them
      if (evt.action_result === undefined) {
        logger.info('MockVibe', 'sendAgentMessage: blocked by reportUserActions=false');
        return;
      }
    }
    userActionCallbacks.forEach((cb) => cb(event));
  },

  onAgentMessage: (callback: AgentMessageCallback): (() => void) => {
    agentMessageCallbacks.add(callback);
    notifyListenerAdded();
    return () => agentMessageCallbacks.delete(callback);
  },

  // Info queries
  getUserInfo: (): Promise<UserInfoResponse> =>
    Promise.resolve({ user_id: 'local', nickname: 'Local User' }),

  getCharacterInfo: (): Promise<CharacterInfoResponse> =>
    Promise.resolve({ character_id: 'assistant', name: 'Assistant' }),

  getSystemSettings: (): Promise<SystemSettingsResponse> =>
    Promise.resolve({
      language: { current: i18next.language || navigator.language, options: ['en', 'zh'] },
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
