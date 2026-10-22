/**
 * Action type constants for the Mystery App.
 *
 * These identifiers are shared between:
 *  - the in-browser UI (dispatches via vibeContainerMock + WebSocket to the GM)
 *  - meta.yaml (which tells Kayley's brain which actions exist)
 *  - the GM subprocess at ws://localhost:5182 (pattern-matches on action_type)
 */

export const ACTION_INTERROGATE = 'INTERROGATE';
export const ACTION_EXAMINE_LOCATION = 'EXAMINE_LOCATION';
export const ACTION_COLLECT_EVIDENCE = 'COLLECT_EVIDENCE';
export const ACTION_READ_DOSSIER = 'READ_DOSSIER';
export const ACTION_MAKE_ACCUSATION = 'MAKE_ACCUSATION';

/** Local-only (no GM round-trip); handled in MysteryApp + agent listener. */
export const ACTION_FINISH_INVESTIGATION_TURN = 'FINISH_INVESTIGATION_TURN';
export const ACTION_GET_MYSTERY_STATE = 'GET_MYSTERY_STATE';
export const ACTION_SET_ACCUSATION_READY = 'SET_ACCUSATION_READY';
export const ACTION_CHAT_MESSAGE = 'CHAT_MESSAGE';
export const ACTION_SET_OPENING_PICK = 'SET_OPENING_PICK';
export const ACTION_RESET_GAMEOVER = 'RESET_GAMEOVER';

export const MYSTERY_GM_ACTIONS = [
  ACTION_INTERROGATE,
  ACTION_EXAMINE_LOCATION,
  ACTION_COLLECT_EVIDENCE,
  ACTION_READ_DOSSIER,
  ACTION_MAKE_ACCUSATION,
] as const;

/** All action_type values the app accepts from Kayley via useAgentActionListener. */
export const MYSTERY_APP_ACTION_TYPES = [
  ...MYSTERY_GM_ACTIONS,
  ACTION_FINISH_INVESTIGATION_TURN,
  ACTION_GET_MYSTERY_STATE,
  ACTION_SET_ACCUSATION_READY,
  ACTION_CHAT_MESSAGE,
  ACTION_SET_OPENING_PICK,
  ACTION_RESET_GAMEOVER,
] as const;

export type MysteryGmActionType = (typeof MYSTERY_GM_ACTIONS)[number];
export type MysteryAppActionType = (typeof MYSTERY_APP_ACTION_TYPES)[number];

/** GM WebSocket endpoint (subprocess lives on 5185 in local dev — moved off 5182 on 2026-05-05 to coexist with dashboard API). */
export const GM_WS_URL = 'ws://localhost:5185';

/** How long we wait before retrying a dropped WebSocket connection. */
export const GM_RECONNECT_MS = 2500;

/** Response timeout — Haiku interrogations can take 30-50s; keep this above the
 *  GM subprocess's own 60s claude timeout so the frontend never races ahead. */
export const GM_RESPONSE_TIMEOUT_MS = 65000;
