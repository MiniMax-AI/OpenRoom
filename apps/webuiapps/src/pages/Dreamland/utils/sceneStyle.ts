/**
 * Scene artwork colors: procedural sky gradients, time-of-day grading and mood
 * tints. These are scene content (like an image), not UI chrome colors.
 */

import type { Mood, TimeOfDay } from '../types';

/** [zenith, middle, horizon] */
const SKIES: Record<TimeOfDay, [string, string, string]> = {
  dawn: ['#2b2d5c', '#c06c84', '#f8b195'],
  day: ['#2f80ed', '#56ccf2', '#c9eeff'],
  dusk: ['#1f1c3c', '#8e3b6e', '#f7955c'],
  night: ['#04050d', '#0f1b3d', '#25365f'],
};

/** Sun/moon glow: [x%, y%, color, radius%] */
const LIGHT: Record<TimeOfDay, [number, number, string, number]> = {
  dawn: [22, 78, 'rgba(255, 214, 170, 0.75)', 30],
  day: [74, 18, 'rgba(255, 255, 230, 0.85)', 22],
  dusk: [70, 80, 'rgba(255, 170, 100, 0.8)', 34],
  night: [78, 20, 'rgba(220, 230, 255, 0.55)', 12],
};

/** Overlay that grades a background image toward the time of day. */
const TIME_GRADE: Record<TimeOfDay, string> = {
  dawn: 'linear-gradient(to top, rgba(255, 170, 150, 0.28), rgba(255, 170, 150, 0) 65%)',
  day: 'linear-gradient(to top, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))',
  dusk: 'linear-gradient(to top, rgba(255, 120, 60, 0.3), rgba(80, 30, 90, 0.28))',
  night: 'linear-gradient(to bottom, rgba(5, 8, 30, 0.6), rgba(5, 8, 30, 0.4))',
};

const MOOD: Record<Mood, { accent: string; tintAlpha: number }> = {
  serene: { accent: '#7fd1c7', tintAlpha: 0.1 },
  mystical: { accent: '#9d8cff', tintAlpha: 0.18 },
  warm: { accent: '#ffb347', tintAlpha: 0.16 },
  melancholic: { accent: '#7f93b8', tintAlpha: 0.22 },
  energetic: { accent: '#ff6fae', tintAlpha: 0.14 },
};

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Procedural sky used when the dream has no background image (and for thumbnails). */
export function skyBackground(time: TimeOfDay): string {
  const [zenith, middle, horizon] = SKIES[time];
  const [x, y, glow, r] = LIGHT[time];
  return (
    `radial-gradient(circle at ${x}% ${y}%, ${glow} 0%, rgba(255, 255, 255, 0) ${r}%), ` +
    `linear-gradient(180deg, ${zenith} 0%, ${middle} 58%, ${horizon} 100%)`
  );
}

/**
 * Soft bloom around the sun/moon, laid over pictures too (screen blend), so
 * the light source glows. Wider and fainter than the painted sky's glow.
 */
export function bloomGradient(time: TimeOfDay): string {
  const [x, y, glow, r] = LIGHT[time];
  return `radial-gradient(circle at ${x}% ${y}%, ${glow} 0%, rgba(255, 255, 255, 0) ${Math.round(r * 2.2)}%)`;
}

/** Two drifting pools of mood-colored light. */
export function moodLightGradients(mood: Mood): [string, string] {
  const accent = MOOD[mood].accent;
  return [
    `radial-gradient(circle, ${hexToRgba(accent, 0.55)} 0%, ${hexToRgba(accent, 0)} 65%)`,
    `radial-gradient(circle, ${hexToRgba(accent, 0.35)} 0%, ${hexToRgba(accent, 0)} 70%)`,
  ];
}

export function timeGrade(time: TimeOfDay): string {
  return TIME_GRADE[time];
}

export function moodAccent(mood: Mood): string {
  return MOOD[mood].accent;
}

/** Soft full-scene color wash for the mood. */
export function moodTint(mood: Mood): string {
  return hexToRgba(MOOD[mood].accent, MOOD[mood].tintAlpha);
}

/** Night and dusk scenes need lighter particles; day scenes darker rain. */
export function isDark(time: TimeOfDay): boolean {
  return time === 'night' || time === 'dusk';
}
