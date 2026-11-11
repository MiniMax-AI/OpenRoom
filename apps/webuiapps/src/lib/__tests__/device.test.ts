import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTouchDevice } from '../device';

describe('isTouchDevice', () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  const mockMatchMedia = (matches: boolean) => {
    const fn = vi.fn().mockReturnValue({ matches } as MediaQueryList);
    window.matchMedia = fn as unknown as typeof window.matchMedia;
    return fn;
  };

  it('returns true when the primary pointer is coarse', () => {
    const fn = mockMatchMedia(true);
    expect(isTouchDevice()).toBe(true);
    expect(fn).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('returns false when the primary pointer is fine', () => {
    mockMatchMedia(false);
    expect(isTouchDevice()).toBe(false);
  });

  it('returns false when matchMedia is unavailable', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(isTouchDevice()).toBe(false);
  });
});
