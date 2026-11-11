import { describe, it, expect } from 'vitest';
import {
  cleanEnumParam,
  idFromPath,
  isWeather,
  isTimeOfDay,
  normalizeAvatarModel,
  normalizeBackgroundUrl,
  normalizeDreamspace,
  normalizePersistedState,
  parseEnum,
  parseFileContent,
  sortDreams,
  withStateDefaults,
} from '../utils/normalize';
import { buildImagePrompt, DEFAULT_SCENE, STYLE_SUFFIX } from '../utils/prompt';
import {
  bloomGradient,
  hexToRgba,
  isDark,
  moodLightGradients,
  moodAccent,
  moodTint,
  skyBackground,
  timeGrade,
} from '../utils/sceneStyle';
import { makeDream } from './helpers';

describe('normalize', () => {
  it('parses enum params with case, spaces and synonyms', () => {
    expect(cleanEnumParam(' Fire Flies ')).toBe('fire_flies');
    expect(cleanEnumParam(undefined)).toBe('');
    expect(parseEnum('Night', isTimeOfDay)).toBe('night');
    expect(parseEnum('sunset', isTimeOfDay)).toBe('dusk');
    expect(parseEnum('rainy', isWeather)).toBe('rain');
    expect(parseEnum('hurricane', isWeather)).toBeNull();
    expect(parseEnum(undefined, isWeather)).toBeNull();
  });

  it('accepts only safe background URLs', () => {
    expect(normalizeBackgroundUrl('https://x.test/a.jpg')).toBe('https://x.test/a.jpg');
    expect(normalizeBackgroundUrl('/api/session-data?path=a')).toBe('/api/session-data?path=a');
    expect(normalizeBackgroundUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(normalizeBackgroundUrl('http://x.test/a.jpg')).toBeNull();
    expect(normalizeBackgroundUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBackgroundUrl('  ')).toBeNull();
    expect(normalizeBackgroundUrl(42)).toBeNull();
  });

  it('normalizes a valid dream unchanged', () => {
    const d = makeDream({ caption: 'hi', backgroundUrl: 'https://x.test/a.jpg' });
    expect(normalizeDreamspace(d)).toEqual(d);
  });

  it('fills defaults for bad or missing fields and clamps text', () => {
    const d = normalizeDreamspace(
      {
        name: '  ',
        scenePrompt: 'x'.repeat(700),
        timeOfDay: 'noonish',
        weather: 5,
        caption: 'c'.repeat(200),
        createdAt: -1,
      },
      'from-file',
    );
    expect(d).toMatchObject({
      id: 'from-file',
      name: 'Untitled dream',
      timeOfDay: 'dusk',
      weather: 'clear',
      mood: 'serene',
      ambientSound: 'none',
      expression: 'peaceful',
      backgroundUrl: null,
    });
    expect(d?.scenePrompt).toHaveLength(600);
    expect(d?.caption).toHaveLength(140);
    expect(d?.updatedAt).toBe(d?.createdAt);
  });

  it('rejects non-objects and dreams without an id', () => {
    expect(normalizeDreamspace(null)).toBeNull();
    expect(normalizeDreamspace('x')).toBeNull();
    expect(normalizeDreamspace({ name: 'no id' })).toBeNull();
  });

  it('parses file content that is a string or an object', () => {
    expect(parseFileContent('{"a":1}')).toEqual({ a: 1 });
    expect(parseFileContent({ a: 1 })).toEqual({ a: 1 });
    expect(parseFileContent('{bad')).toBeNull();
  });

  it('normalizes persisted state defensively', () => {
    expect(normalizePersistedState(null)).toEqual({});
    expect(
      normalizePersistedState({ activeDreamspaceId: 'a', soundEnabled: true, volume: 3 }),
    ).toEqual({ activeDreamspaceId: 'a', soundEnabled: true, volume: 1 });
    expect(normalizePersistedState({ activeDreamspaceId: null, volume: -2 })).toEqual({
      activeDreamspaceId: null,
      volume: 0,
    });
    expect(
      normalizePersistedState({ activeDreamspaceId: 5, soundEnabled: 'yes', volume: NaN }),
    ).toEqual({});
    expect(withStateDefaults({ soundEnabled: true })).toEqual({
      activeDreamspaceId: null,
      soundEnabled: true,
      volume: 0.6,
      avatarModel: null,
      motionEnabled: false,
    });
  });

  it('normalizes the 3D model and tilt preference', () => {
    const model = { fileName: 'Aoi.vrm', size: 1234, updatedAt: 99, storage: 'server' };
    expect(normalizePersistedState({ avatarModel: model, motionEnabled: true })).toEqual({
      avatarModel: model,
      motionEnabled: true,
    });
    expect(normalizePersistedState({ avatarModel: null })).toEqual({ avatarModel: null });
    // malformed model info is ignored (field left untouched)
    expect(normalizePersistedState({ avatarModel: { storage: 'cloud' } })).toEqual({});
    expect(normalizePersistedState({ avatarModel: 'x', motionEnabled: 'yes' })).toEqual({});
    expect(normalizeAvatarModel({ storage: 'browser', size: -1, updatedAt: 'x' })).toEqual({
      fileName: 'companion.vrm',
      size: 0,
      updatedAt: 0,
      storage: 'browser',
    });
  });

  it('defaults autoBackground to true and keeps an explicit false', () => {
    expect(normalizeDreamspace({ id: 'x' })?.autoBackground).toBe(true);
    expect(normalizeDreamspace({ id: 'x', autoBackground: false })?.autoBackground).toBe(false);
    expect(normalizeDreamspace({ id: 'x', autoBackground: 'no' })?.autoBackground).toBe(true);
  });

  it('sorts newest first with a stable tiebreak, and reads ids from paths', () => {
    const a = makeDream({ id: 'a', updatedAt: 1 });
    const b = makeDream({ id: 'b', updatedAt: 2 });
    const c = makeDream({ id: 'c', updatedAt: 2 });
    expect(sortDreams([a, c, b]).map((d) => d.id)).toEqual(['b', 'c', 'a']);
    expect(idFromPath('/dreamspaces/abc.json')).toBe('abc');
    expect(idFromPath('/dreamspaces/abc.txt')).toBeUndefined();
  });
});

describe('buildImagePrompt', () => {
  it('combines scene, time, weather, mood and the style', () => {
    const p = buildImagePrompt(
      makeDream({
        scenePrompt: 'A castle. ',
        timeOfDay: 'night',
        weather: 'snow',
        mood: 'mystical',
      }),
    );
    expect(p).toBe(
      'A castle, at night, moonlit with deep blue shadows, soft snow falling, ' +
        `mystical, ethereal atmosphere with soft glowing light. ${STYLE_SUFFIX}`,
    );
  });

  it('skips clear weather and uses a default scene', () => {
    const p = buildImagePrompt(makeDream({ scenePrompt: '  ', weather: 'clear' }));
    expect(p.startsWith(`${DEFAULT_SCENE}, in bright daylight`)).toBe(true);
    expect(p).not.toContain(', ,');
    expect(p).toContain('no people');
  });
});

describe('sceneStyle', () => {
  it('builds bloom and mood light gradients', () => {
    expect(bloomGradient('night')).toMatch(/^radial-gradient\(circle at 78% 20%/);
    expect(bloomGradient('day')).toContain('48%');
    const [a, b] = moodLightGradients('warm');
    expect(a).toContain('rgba(255, 179, 71, 0.55)');
    expect(b).toContain('rgba(255, 179, 71, 0.35)');
  });

  it('builds sky backgrounds for every time of day', () => {
    for (const time of ['dawn', 'day', 'dusk', 'night'] as const) {
      const bg = skyBackground(time);
      expect(bg).toMatch(/^radial-gradient\(circle at \d+% \d+%/);
      expect(bg).toContain('linear-gradient(180deg');
      expect(timeGrade(time)).toContain('linear-gradient');
    }
  });

  it('gives mood accents and tints', () => {
    expect(moodAccent('warm')).toBe('#ffb347');
    expect(moodTint('warm')).toBe('rgba(255, 179, 71, 0.16)');
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
  });

  it('marks dusk and night as dark', () => {
    expect(isDark('night')).toBe(true);
    expect(isDark('dusk')).toBe(true);
    expect(isDark('day')).toBe(false);
    expect(isDark('dawn')).toBe(false);
  });
});
