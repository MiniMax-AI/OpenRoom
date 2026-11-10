/**
 * Validation and normalization. Dream files can be written by the Agent, so
 * every read goes through here: unknown values fall back to safe defaults
 * instead of breaking the scene.
 */

import {
  AMBIENT_SOUNDS,
  DEFAULT_PERSISTED_STATE,
  EXPRESSIONS,
  MOODS,
  TIMES_OF_DAY,
  WEATHERS,
  type AmbientSound,
  type Dreamspace,
  type DreamlandPersistedState,
  type Expression,
  type Mood,
  type TimeOfDay,
  type Weather,
} from '../types';

export const NAME_MAX = 60;
export const PROMPT_MAX = 600;
export const CAPTION_MAX = 140;

function makeGuard<T extends string>(values: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value);
}

export const isTimeOfDay = makeGuard<TimeOfDay>(TIMES_OF_DAY);
export const isWeather = makeGuard<Weather>(WEATHERS);
export const isMood = makeGuard<Mood>(MOODS);
export const isAmbientSound = makeGuard<AmbientSound>(AMBIENT_SOUNDS);
export const isExpression = makeGuard<Expression>(EXPRESSIONS);

/** Lowercase/trim a raw action param so "Night " matches "night". */
export function cleanEnumParam(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Map common synonyms the Agent may use onto our values. */
const SYNONYMS: Record<string, string> = {
  morning: 'dawn',
  sunrise: 'dawn',
  noon: 'day',
  daytime: 'day',
  afternoon: 'day',
  evening: 'dusk',
  sunset: 'dusk',
  midnight: 'night',
  sunny: 'clear',
  rainy: 'rain',
  snowy: 'snow',
  foggy: 'fog',
  mist: 'fog',
  starry: 'stars',
  calm: 'serene',
  sad: 'depressing',
  depressed: 'depressing',
  mad: 'angry',
  silence: 'none',
  silent: 'none',
  off: 'none',
  waves: 'ocean',
  sea: 'ocean',
  dreamy: 'drone',
};

/** Parse an enum action param; returns null when it is not a valid value. */
export function parseEnum<T extends string>(
  value: string | undefined,
  guard: (v: unknown) => v is T,
): T | null {
  const cleaned = cleanEnumParam(value);
  if (guard(cleaned)) return cleaned;
  const mapped = SYNONYMS[cleaned];
  return guard(mapped) ? mapped : null;
}

function text(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

/** Accept https URLs, session-data URLs and image data URLs; anything else → null. */
export function normalizeBackgroundUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith('/api/session-data?')) return url;
  if (/^data:image\/[a-z+.-]+;base64,/i.test(url)) return url;
  return null;
}

/**
 * Turn any parsed JSON into a valid Dreamspace, or null if it has no usable id.
 * `fallbackId` is used when the file has no id (e.g. derived from the filename).
 */
export function normalizeDreamspace(raw: unknown, fallbackId?: string): Dreamspace | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : fallbackId;
  if (!id) return null;
  const now = Date.now();
  const createdAt = typeof r.createdAt === 'number' && r.createdAt > 0 ? r.createdAt : now;
  return {
    id,
    name: text(r.name, NAME_MAX, '') || 'Untitled dream',
    scenePrompt: text(r.scenePrompt, PROMPT_MAX, ''),
    backgroundUrl: normalizeBackgroundUrl(r.backgroundUrl),
    timeOfDay: isTimeOfDay(r.timeOfDay) ? r.timeOfDay : 'dusk',
    weather: isWeather(r.weather) ? r.weather : 'clear',
    mood: isMood(r.mood) ? r.mood : 'serene',
    ambientSound: isAmbientSound(r.ambientSound) ? r.ambientSound : 'none',
    expression: isExpression(r.expression) ? r.expression : 'peaceful',
    caption: text(r.caption, CAPTION_MAX, ''),
    createdAt,
    updatedAt: typeof r.updatedAt === 'number' && r.updatedAt > 0 ? r.updatedAt : createdAt,
  };
}

/** Parse readFile content that may be a JSON string or an already-parsed object. */
export function parseFileContent(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function normalizePersistedState(raw: unknown): Partial<DreamlandPersistedState> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<DreamlandPersistedState> = {};
  if (typeof r.activeDreamspaceId === 'string' || r.activeDreamspaceId === null) {
    out.activeDreamspaceId = r.activeDreamspaceId;
  }
  if (typeof r.soundEnabled === 'boolean') out.soundEnabled = r.soundEnabled;
  if (typeof r.volume === 'number' && Number.isFinite(r.volume)) {
    out.volume = Math.min(1, Math.max(0, r.volume));
  }
  return out;
}

export function withStateDefaults(
  partial: Partial<DreamlandPersistedState>,
): DreamlandPersistedState {
  return { ...DEFAULT_PERSISTED_STATE, ...partial };
}

/** Sort dreams newest-updated first. */
export function sortDreams(dreams: Dreamspace[]): Dreamspace[] {
  return [...dreams].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

/** File id from a path like /dreamspaces/abc.json */
export function idFromPath(path: string): string | undefined {
  const match = path.match(/([^/]+)\.json$/);
  return match ? match[1] : undefined;
}
