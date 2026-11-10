/**
 * Builds the background image prompt. The image generator sees only this text,
 * so it spells out time, weather, mood and a fixed art style. The avatar is
 * drawn by the app on top, so the background asks for no people.
 */

import type { Dreamspace, Mood, TimeOfDay, Weather } from '../types';

const TIME_TEXT: Record<TimeOfDay, string> = {
  dawn: 'at dawn, soft pink and gold first light',
  day: 'in bright daylight under a clear sky',
  dusk: 'at dusk, warm orange and violet sunset light',
  night: 'at night, moonlit with deep blue shadows',
};

const WEATHER_TEXT: Record<Weather, string> = {
  clear: '',
  rain: 'gentle rain falling',
  snow: 'soft snow falling',
  fog: 'drifting mist and fog',
  fireflies: 'glowing fireflies drifting in the air',
  stars: 'a sky full of bright stars',
  petals: 'flower petals drifting on the breeze',
};

const MOOD_TEXT: Record<Mood, string> = {
  serene: 'calm and peaceful atmosphere',
  mystical: 'mystical, ethereal atmosphere with soft glowing light',
  warm: 'warm, cozy, golden atmosphere',
  melancholic: 'quiet, wistful, melancholic atmosphere',
  energetic: 'vivid, energetic atmosphere with saturated colors',
};

export const STYLE_SUFFIX =
  'dreamlike cinematic digital painting, wide landscape, highly detailed, no people, no text';

export const DEFAULT_SCENE = 'a peaceful dreamlike landscape';

type PromptInput = Pick<Dreamspace, 'scenePrompt' | 'timeOfDay' | 'weather' | 'mood'>;

export function buildImagePrompt(dream: PromptInput): string {
  const scene = dream.scenePrompt.trim().replace(/[.\s]+$/, '') || DEFAULT_SCENE;
  const parts = [
    scene,
    TIME_TEXT[dream.timeOfDay],
    WEATHER_TEXT[dream.weather],
    MOOD_TEXT[dream.mood],
  ]
    .filter(Boolean)
    .join(', ');
  return `${parts}. ${STYLE_SUFFIX}`;
}
