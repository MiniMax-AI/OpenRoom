/** Dreamland app identity and action types. */

export const APP_ID = 15;
export const APP_NAME = 'dreamland';

export const DREAMSPACES_DIR = '/dreamspaces';
export const IMAGES_DIR = '/images';
export const STATE_FILE = '/state.json';
/** The user's 3D companion model (binary) */
export const AVATAR_FILE = '/avatar/companion.vrm';

/** Operations: the app executes them directly on the active (or given) dream. */
export const OperationActions = {
  SET_SCENE: 'SET_SCENE',
  REGENERATE_BACKGROUND: 'REGENERATE_BACKGROUND',
  SET_WEATHER: 'SET_WEATHER',
  SET_TIME_OF_DAY: 'SET_TIME_OF_DAY',
  SET_MOOD: 'SET_MOOD',
  SET_AMBIENT_SOUND: 'SET_AMBIENT_SOUND',
  SET_EXPRESSION: 'SET_EXPRESSION',
  SET_CAPTION: 'SET_CAPTION',
  SWITCH_DREAMSPACE: 'SWITCH_DREAMSPACE',
} as const;

/** Mutations: the Agent already wrote/deleted the file; the app syncs. */
export const MutationActions = {
  CREATE_DREAMSPACE: 'CREATE_DREAMSPACE',
  UPDATE_DREAMSPACE: 'UPDATE_DREAMSPACE',
  DELETE_DREAMSPACE: 'DELETE_DREAMSPACE',
} as const;

export const RefreshActions = {
  REFRESH_DREAMSPACES: 'REFRESH_DREAMSPACES',
} as const;

export const SystemActions = {
  SYNC_STATE: 'SYNC_STATE',
} as const;

/** Reported only (user interactions the Agent can react to). */
export const UserOnlyActions = {
  RENAME_DREAMSPACE: 'RENAME_DREAMSPACE',
  TOGGLE_SOUND: 'TOGGLE_SOUND',
  POKE_AVATAR: 'POKE_AVATAR',
  SET_AVATAR_MODEL: 'SET_AVATAR_MODEL',
  CLEAR_AVATAR_MODEL: 'CLEAR_AVATAR_MODEL',
} as const;

export const ActionTypes = {
  ...OperationActions,
  ...MutationActions,
  ...RefreshActions,
  ...SystemActions,
  ...UserOnlyActions,
} as const;

export type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];
