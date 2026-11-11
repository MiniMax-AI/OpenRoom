/**
 * Mouth movement while the browser voice speaks. Browsers don't expose the
 * speech audio, so the mouth follows a syllable-like rhythm while speaking,
 * with an extra opening at each word boundary where the browser reports it.
 * Times are in seconds.
 */

export interface LipState {
  speaking: boolean;
  startedAt: number;
  lastBoundaryAt: number;
  endedAt: number;
}

export const IDLE_LIPS: LipState = {
  speaking: false,
  startedAt: -Infinity,
  lastBoundaryAt: -Infinity,
  endedAt: -Infinity,
};

const RAMP_IN_S = 0.12;
const CLOSE_S = 0.18;

export function lipStart(state: LipState, now: number): LipState {
  return state.speaking ? state : { ...state, speaking: true, startedAt: now, lastBoundaryAt: now };
}

export function lipBoundary(state: LipState, now: number): LipState {
  return { ...state, speaking: true, lastBoundaryAt: now };
}

export function lipEnd(state: LipState, now: number): LipState {
  return state.speaking ? { ...state, speaking: false, endedAt: now } : state;
}

/** How open the mouth is, 0..1. */
export function mouthOpen(state: LipState, now: number): number {
  if (!state.speaking) {
    // Close smoothly after the voice stops
    const since = now - state.endedAt;
    if (since >= CLOSE_S || !Number.isFinite(since)) return 0;
    return 0.35 * (1 - since / CLOSE_S);
  }
  const t = now - state.startedAt;
  const syllable = Math.abs(Math.sin(Math.PI * 5.2 * t));
  const phrase = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.9 * t + 1.3);
  const word = Math.exp(-Math.max(0, now - state.lastBoundaryAt) * 9);
  const rampIn = Math.min(1, Math.max(0, t / RAMP_IN_S));
  const value = 0.12 + 0.6 * syllable * phrase + 0.3 * word;
  return Math.min(1, Math.max(0, value * rampIn));
}
