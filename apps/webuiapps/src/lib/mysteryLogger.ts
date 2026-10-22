/**
 * Mystery duo-play game logger.
 *
 * Dual-path logging:
 *   1. Browser console (always — visible at F12)
 *   2. Kayley dashboard WebSocket → Kayley_Cowork `mystery_game_logs` table
 *      (when the dashboard is connected; silently dropped otherwise)
 *
 * Schema mirrors Kayley_Cowork's `system_logs` (`level`, `component`,
 * `action`, `message`, `details`) plus a `session_id` for correlating
 * events within a single play session.
 *
 * Usage:
 *   import { mysteryLog } from '@/lib/mysteryLogger';
 *   mysteryLog('info', 'MysteryApp', 'handleAgentAction.enter', 'Action received', { action_type, params });
 *   mysteryLog('error', 'useGMSocket', 'sendAction.timeout', 'GM took too long', { request_id });
 */

import { sendKayleyWsPayload } from './kayleyWsBridge';

export type MysteryLogLevel = 'verbose' | 'info' | 'warning' | 'error' | 'critical';

/** Stable per-page-load session id so we can correlate one play session in `mystery_game_logs`. */
const SESSION_ID = `or_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function getSessionId(): string {
  return SESSION_ID;
}

function writeConsole(
  level: MysteryLogLevel,
  component: string,
  action: string,
  message: string,
  details: Record<string, unknown>,
) {
  const tag = `[mystery-game/${component}/${action}]`;
  if (level === 'error' || level === 'critical') {
    // eslint-disable-next-line no-console
    console.error(tag, message, details);
  } else if (level === 'warning') {
    // eslint-disable-next-line no-console
    console.warn(tag, message, details);
  } else {
    // eslint-disable-next-line no-console
    console.log(tag, message, details);
  }
}

/**
 * Log a mystery-game observability event. Fire-and-forget — never throws.
 */
export function mysteryLog(
  level: MysteryLogLevel,
  component: string,
  action: string,
  message: string,
  details: Record<string, unknown> = {},
): void {
  writeConsole(level, component, action, message, details);
  try {
    sendKayleyWsPayload({
      type: 'openroom_log',
      level,
      component,
      action,
      message,
      details,
      session_id: getSessionId(),
    });
  } catch (err) {
    // If the bridge is mid-disconnect we don't want to crash the caller —
    // the console write above is still preserving the event locally.
    // eslint-disable-next-line no-console
    console.warn('[mystery-game/logger] failed to forward to dashboard ws', err);
  }
}

/** Surface the current session id so callers can include it in custom payloads. */
export function getMysterySessionId(): string {
  return getSessionId();
}
