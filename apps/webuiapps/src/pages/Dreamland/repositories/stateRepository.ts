/**
 * state.json repository: active dream and sound preferences.
 * Checks whether state.json exists (listFiles) before reading it.
 */

import type { FileOperations } from '@/lib';
import { STATE_FILE } from '../actions/constants';
import { DEFAULT_PERSISTED_STATE, type DreamlandPersistedState } from '../types';
import { normalizePersistedState, parseFileContent, withStateDefaults } from '../utils/normalize';

export interface StateLoadResult {
  /** False on the very first launch (no state.json yet). */
  existed: boolean;
  state: DreamlandPersistedState;
  /** Only the fields actually present in the file (for defensive SYNC_STATE). */
  fields: Partial<DreamlandPersistedState>;
}

export interface StateRepository {
  /** Read state.json, creating it with defaults when missing. */
  refresh(): Promise<StateLoadResult>;
  save(state: DreamlandPersistedState): Promise<void>;
}

export function createStateRepository(api: FileOperations): StateRepository {
  const fileName = STATE_FILE.replace(/^\//, '');

  return {
    async refresh() {
      const rootFiles = await api.listFiles('/');
      const exists = rootFiles.some((f) => f.name === fileName);
      if (!exists) {
        const state = { ...DEFAULT_PERSISTED_STATE };
        await api.writeFile(STATE_FILE, state);
        return { existed: false, state, fields: {} };
      }
      try {
        const result = await api.readFile(STATE_FILE);
        const fields = normalizePersistedState(parseFileContent(result.content));
        return { existed: true, state: withStateDefaults(fields), fields };
      } catch {
        return { existed: true, state: { ...DEFAULT_PERSISTED_STATE }, fields: {} };
      }
    },

    async save(state) {
      await api.writeFile(STATE_FILE, state);
    },
  };
}
