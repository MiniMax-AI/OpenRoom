/**
 * Dreamland types.
 *
 * A Dreamspace is one saved dream scene. One file per dream in /dreamspaces/{id}.json.
 */

export const TIMES_OF_DAY = ['dawn', 'day', 'dusk', 'night'] as const;
export const WEATHERS = ['clear', 'rain', 'snow', 'fog', 'fireflies', 'stars', 'petals'] as const;
export const MOODS = ['serene', 'mystical', 'warm', 'melancholic', 'energetic'] as const;
export const AMBIENT_SOUNDS = ['none', 'rain', 'wind', 'ocean', 'night', 'drone'] as const;
/** Same emotion names OpenRoom's characters use. */
export const EXPRESSIONS = ['happy', 'shy', 'peaceful', 'depressing', 'angry'] as const;

export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export type Weather = (typeof WEATHERS)[number];
export type Mood = (typeof MOODS)[number];
export type AmbientSound = (typeof AMBIENT_SOUNDS)[number];
export type Expression = (typeof EXPRESSIONS)[number];

export interface Dreamspace {
  id: string;
  /** Display name of the dream */
  name: string;
  /** Description of the environment; used to generate the background image */
  scenePrompt: string;
  /** Generated background image URL, or null to use the procedural sky */
  backgroundUrl: string | null;
  timeOfDay: TimeOfDay;
  weather: Weather;
  mood: Mood;
  ambientSound: AmbientSound;
  /** The companion avatar's expression in this dream */
  expression: Expression;
  /** Short whisper text shown above the avatar; empty string hides it */
  caption: string;
  createdAt: number;
  updatedAt: number;
}

/** Fields that can be edited after creation. */
export type DreamspacePatch = Partial<
  Pick<
    Dreamspace,
    | 'name'
    | 'scenePrompt'
    | 'backgroundUrl'
    | 'timeOfDay'
    | 'weather'
    | 'mood'
    | 'ambientSound'
    | 'expression'
    | 'caption'
  >
>;

/** Contents of /state.json */
export interface DreamlandPersistedState {
  activeDreamspaceId: string | null;
  soundEnabled: boolean;
  /** 0..1 */
  volume: number;
}

export const DEFAULT_PERSISTED_STATE: DreamlandPersistedState = {
  activeDreamspaceId: null,
  soundEnabled: false,
  volume: 0.6,
};
