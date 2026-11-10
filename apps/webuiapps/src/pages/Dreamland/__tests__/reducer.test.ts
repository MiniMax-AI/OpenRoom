import { describe, it, expect } from 'vitest';
import { dreamlandReducer, initialState, selectActiveDream } from '../store/reducer';
import { makeDream } from './helpers';

const a = makeDream({ id: 'a', updatedAt: 3 });
const b = makeDream({ id: 'b', updatedAt: 2 });

describe('dreamlandReducer', () => {
  it('LOADED keeps a known active id and ends loading when done', () => {
    const s = dreamlandReducer(
      { ...initialState, activeId: 'b' },
      { type: 'LOADED', dreams: [a, b], done: true },
    );
    expect(s.activeId).toBe('b');
    expect(s.loading).toBe(false);
  });

  it('LOADED falls back to the first dream once done, keeps unknown id while loading', () => {
    const partial = dreamlandReducer(
      { ...initialState, activeId: 'zzz' },
      { type: 'LOADED', dreams: [a], done: false },
    );
    expect(partial.activeId).toBe('zzz');
    expect(partial.loading).toBe(false); // first batch with data exits loading
    const done = dreamlandReducer(partial, { type: 'LOADED', dreams: [a], done: true });
    expect(done.activeId).toBe('a');
    const empty = dreamlandReducer(initialState, { type: 'LOADED', dreams: [], done: false });
    expect(empty.loading).toBe(true);
    expect(
      dreamlandReducer(initialState, { type: 'LOADED', dreams: [], done: true }).activeId,
    ).toBeNull();
  });

  it('UPSERT inserts or replaces and keeps newest first', () => {
    let s = dreamlandReducer(initialState, { type: 'UPSERT', dream: b });
    s = dreamlandReducer(s, { type: 'UPSERT', dream: a });
    expect(s.dreams.map((d) => d.id)).toEqual(['a', 'b']);
    s = dreamlandReducer(s, { type: 'UPSERT', dream: { ...b, updatedAt: 9, name: 'B2' } });
    expect(s.dreams.map((d) => d.name)).toEqual(['B2', 'Dream one']);
  });

  it('REMOVE drops the dream, moves the active id and clears generating', () => {
    const start = { ...initialState, dreams: [a, b], activeId: 'a', generatingIds: ['a'] };
    const s = dreamlandReducer(start, { type: 'REMOVE', id: 'a' });
    expect(s.dreams).toEqual([b]);
    expect(s.activeId).toBe('b');
    expect(s.generatingIds).toEqual([]);
    expect(dreamlandReducer(start, { type: 'REMOVE', id: 'b' }).activeId).toBe('a');
    expect(
      dreamlandReducer({ ...start, dreams: [a] }, { type: 'REMOVE', id: 'a' }).activeId,
    ).toBeNull();
  });

  it('PATCH updates one dream and its timestamp; unknown id is a no-op', () => {
    const start = { ...initialState, dreams: [a, b] };
    const s = dreamlandReducer(start, {
      type: 'PATCH',
      id: 'b',
      patch: { weather: 'rain' },
      now: 99,
    });
    expect(s.dreams.find((d) => d.id === 'b')).toMatchObject({ weather: 'rain', updatedAt: 99 });
    expect(dreamlandReducer(start, { type: 'PATCH', id: 'x', patch: {}, now: 1 })).toBe(start);
  });

  it('tracks generating ids, sound and clamped volume', () => {
    let s = dreamlandReducer(initialState, { type: 'SET_GENERATING', id: 'a', generating: true });
    s = dreamlandReducer(s, { type: 'SET_GENERATING', id: 'a', generating: true });
    expect(s.generatingIds).toEqual(['a']);
    s = dreamlandReducer(s, { type: 'SET_GENERATING', id: 'a', generating: false });
    expect(s.generatingIds).toEqual([]);
    expect(dreamlandReducer(s, { type: 'SET_SOUND', enabled: true }).soundEnabled).toBe(true);
    expect(dreamlandReducer(s, { type: 'SET_VOLUME', volume: 2 }).volume).toBe(1);
    expect(dreamlandReducer(s, { type: 'SET_VOLUME', volume: -1 }).volume).toBe(0);
    expect(dreamlandReducer(s, { type: 'SET_ACTIVE', id: 'b' }).activeId).toBe('b');
  });

  it('APPLY_STATE only applies present fields and known dream ids', () => {
    const start = { ...initialState, dreams: [a, b], activeId: 'a', volume: 0.5 };
    expect(dreamlandReducer(start, { type: 'APPLY_STATE', fields: {} })).toMatchObject({
      activeId: 'a',
      volume: 0.5,
      soundEnabled: false,
    });
    expect(
      dreamlandReducer(start, {
        type: 'APPLY_STATE',
        fields: { activeDreamspaceId: 'b', soundEnabled: true, volume: 0.2 },
      }),
    ).toMatchObject({ activeId: 'b', soundEnabled: true, volume: 0.2 });
    expect(
      dreamlandReducer(start, { type: 'APPLY_STATE', fields: { activeDreamspaceId: 'zzz' } })
        .activeId,
    ).toBe('a');
    expect(
      dreamlandReducer(start, { type: 'APPLY_STATE', fields: { activeDreamspaceId: null } })
        .activeId,
    ).toBeNull();
  });

  it('ignores unknown actions', () => {
    expect(dreamlandReducer(initialState, { type: 'NOPE' } as never)).toBe(initialState);
  });

  it('selectActiveDream falls back to the first dream', () => {
    expect(selectActiveDream({ ...initialState, dreams: [a, b], activeId: 'b' })).toBe(b);
    expect(selectActiveDream({ ...initialState, dreams: [a, b], activeId: 'x' })).toBe(a);
    expect(selectActiveDream(initialState)).toBeNull();
  });
});
