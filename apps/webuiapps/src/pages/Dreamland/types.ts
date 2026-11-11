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
  /**
   * Paint a background automatically when this dream opens without one.
   * Set to false when the user chooses the painted sky.
   */
  autoBackground: boolean;
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
    | 'autoBackground'
  >
>;

/** Where the companion's 3D model file lives. */
export type AvatarModelStorage = 'server' | 'browser';

/** The user's uploaded 3D (VRM) companion model. One per app, not per dream. */
export interface AvatarModelInfo {
  /** Original file name, for display */
  fileName: string;
  /** Bytes */
  size: number;
  /** Upload time; also busts the browser cache of the model URL */
  updatedAt: number;
  /** 'server': /avatar/companion.vrm in app storage; 'browser': this browser only (IndexedDB) */
  storage: AvatarModelStorage;
}

/** Contents of /state.json */
export interface DreamlandPersistedState {
  activeDreamspaceId: string | null;
  soundEnabled: boolean;
  /** 0..1 */
  volume: number;
  /** The 3D companion model, or null to use the built-in dream sprite */
  avatarModel: AvatarModelInfo | null;
  /** Scene follows device tilt (phones/tablets) */
  motionEnabled: boolean;
}

export const DEFAULT_PERSISTED_STATE: DreamlandPersistedState = {
  activeDreamspaceId: null,
  soundEnabled: false,
  volume: 0.6,
  avatarModel: null,
  motionEnabled: false,
};
