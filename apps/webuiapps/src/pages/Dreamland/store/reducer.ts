/** Dreamland state and reducer (pure). */

import type { Dreamspace, DreamspacePatch, DreamlandPersistedState } from '../types';
import { sortDreams } from '../utils/normalize';

export interface DreamlandState {
  dreams: Dreamspace[];
  activeId: string | null;
  loading: boolean;
  /** Dream ids whose background is being generated */
  generatingIds: string[];
  soundEnabled: boolean;
  volume: number;
}

export const initialState: DreamlandState = {
  dreams: [],
  activeId: null,
  loading: true,
  generatingIds: [],
  soundEnabled: false,
  volume: 0.6,
};

export type DreamlandAction =
  | { type: 'LOADED'; dreams: Dreamspace[]; done: boolean }
  | { type: 'UPSERT'; dream: Dreamspace }
  | { type: 'REMOVE'; id: string }
  | { type: 'SET_ACTIVE'; id: string | null }
  | { type: 'PATCH'; id: string; patch: DreamspacePatch; now: number }
  | { type: 'SET_GENERATING'; id: string; generating: boolean }
  | { type: 'SET_SOUND'; enabled: boolean }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'APPLY_STATE'; fields: Partial<DreamlandPersistedState> };

/** The active dream, falling back to the first one if the active id is gone. */
export function selectActiveDream(state: DreamlandState): Dreamspace | null {
  return state.dreams.find((d) => d.id === state.activeId) ?? state.dreams[0] ?? null;
}

/** Pick the dream to show after `removedId` disappears. */
function nextActiveAfterRemoval(
  dreams: Dreamspace[],
  activeId: string | null,
  removedId: string,
): string | null {
  if (activeId !== removedId) return activeId;
  return dreams[0]?.id ?? null;
}

export function dreamlandReducer(state: DreamlandState, action: DreamlandAction): DreamlandState {
  switch (action.type) {
    case 'LOADED': {
      const known = state.activeId !== null && action.dreams.some((d) => d.id === state.activeId);
      // While batches are still arriving, keep a not-yet-loaded active id; once done, fall back.
      const keep = known || (state.activeId !== null && !action.done);
      return {
        ...state,
        dreams: action.dreams,
        activeId: keep ? state.activeId : (action.dreams[0]?.id ?? null),
        // Exit loading as soon as the first batch has data (progressive loading)
        loading: action.done ? false : state.loading && action.dreams.length === 0,
      };
    }
    case 'UPSERT': {
      const others = state.dreams.filter((d) => d.id !== action.dream.id);
      return { ...state, dreams: sortDreams([...others, action.dream]) };
    }
    case 'REMOVE': {
      const dreams = state.dreams.filter((d) => d.id !== action.id);
      return {
        ...state,
        dreams,
        activeId: nextActiveAfterRemoval(dreams, state.activeId, action.id),
        generatingIds: state.generatingIds.filter((id) => id !== action.id),
      };
    }
    case 'SET_ACTIVE':
      return { ...state, activeId: action.id };
    case 'PATCH': {
      let changed = false;
      const dreams = state.dreams.map((d) => {
        if (d.id !== action.id) return d;
        changed = true;
        return { ...d, ...action.patch, updatedAt: action.now };
      });
      return changed ? { ...state, dreams } : state;
    }
    case 'SET_GENERATING': {
      const without = state.generatingIds.filter((id) => id !== action.id);
      return {
        ...state,
        generatingIds: action.generating ? [...without, action.id] : without,
      };
    }
    case 'SET_SOUND':
      return { ...state, soundEnabled: action.enabled };
    case 'SET_VOLUME':
      return { ...state, volume: Math.min(1, Math.max(0, action.volume)) };
    case 'APPLY_STATE': {
      const f = action.fields;
      const activeId =
        f.activeDreamspaceId !== undefined &&
        (f.activeDreamspaceId === null || state.dreams.some((d) => d.id === f.activeDreamspaceId))
          ? f.activeDreamspaceId
          : state.activeId;
      return {
        ...state,
        activeId,
        soundEnabled: f.soundEnabled ?? state.soundEnabled,
        volume: f.volume ?? state.volume,
      };
    }
    default:
      return state;
  }
}
