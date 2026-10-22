import { describe, it, expect } from 'vitest';
import {
  ACTION_CHAT_MESSAGE,
  ACTION_COLLECT_EVIDENCE,
  ACTION_EXAMINE_LOCATION,
  ACTION_FINISH_INVESTIGATION_TURN,
  ACTION_GET_MYSTERY_STATE,
  ACTION_INTERROGATE,
  ACTION_MAKE_ACCUSATION,
  ACTION_READ_DOSSIER,
  ACTION_RESET_GAMEOVER,
  ACTION_SET_ACCUSATION_READY,
  ACTION_SET_OPENING_PICK,
  MYSTERY_APP_ACTION_TYPES,
  MYSTERY_GM_ACTIONS,
} from '../actions/constants';

describe('MysteryApp actions/constants', () => {
  it('MYSTERY_GM_ACTIONS lists GM round-trip actions only', () => {
    expect(MYSTERY_GM_ACTIONS).toContain(ACTION_INTERROGATE);
    expect(MYSTERY_GM_ACTIONS).toContain(ACTION_MAKE_ACCUSATION);
    expect(MYSTERY_GM_ACTIONS).not.toContain(ACTION_FINISH_INVESTIGATION_TURN);
    expect(MYSTERY_GM_ACTIONS).not.toContain(ACTION_GET_MYSTERY_STATE);
    expect(MYSTERY_GM_ACTIONS).not.toContain(ACTION_CHAT_MESSAGE);
  });

  it('MYSTERY_APP_ACTION_TYPES includes local duo-play actions', () => {
    expect(MYSTERY_APP_ACTION_TYPES).toEqual(
      expect.arrayContaining([
        ACTION_EXAMINE_LOCATION,
        ACTION_COLLECT_EVIDENCE,
        ACTION_READ_DOSSIER,
        ACTION_FINISH_INVESTIGATION_TURN,
        ACTION_GET_MYSTERY_STATE,
        ACTION_SET_ACCUSATION_READY,
        ACTION_CHAT_MESSAGE,
      ]),
    );
  });

  it('ACTION_CHAT_MESSAGE is a local-only banter action (no GM round-trip)', () => {
    expect(ACTION_CHAT_MESSAGE).toBe('CHAT_MESSAGE');
    expect(MYSTERY_GM_ACTIONS).not.toContain(ACTION_CHAT_MESSAGE);
    expect(MYSTERY_APP_ACTION_TYPES).toContain(ACTION_CHAT_MESSAGE);
  });

  it('ACTION_SET_OPENING_PICK is a local-only autonomous-play unblocker', () => {
    expect(ACTION_SET_OPENING_PICK).toBe('SET_OPENING_PICK');
    expect(MYSTERY_GM_ACTIONS).not.toContain(ACTION_SET_OPENING_PICK);
    expect(MYSTERY_APP_ACTION_TYPES).toContain(ACTION_SET_OPENING_PICK);
  });

  it('ACTION_RESET_GAMEOVER is local-only and clears stale gameOver state', () => {
    expect(ACTION_RESET_GAMEOVER).toBe('RESET_GAMEOVER');
    expect(MYSTERY_GM_ACTIONS).not.toContain(ACTION_RESET_GAMEOVER);
    expect(MYSTERY_APP_ACTION_TYPES).toContain(ACTION_RESET_GAMEOVER);
  });
});
