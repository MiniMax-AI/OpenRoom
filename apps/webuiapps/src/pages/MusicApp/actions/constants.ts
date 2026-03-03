/**
 * MusicApp constants
 *
 * Actions represent methods the Agent can invoke on the App, divided into three categories:
 * - Operation Actions: directly execute App methods (e.g., play, pause), refresh related Repo and retry on data mismatch
 * - Mutation Actions: Agent has completed data writing, App only needs to refresh Repo
 * - Refresh Actions: notify App to reload specified Repo data (supports navigateTo navigation)
 */

export const APP_ID = 3;
export const APP_NAME = 'musicPlayer';

// File paths
export const SONGS_DIR = '/songs';
export const PLAYLISTS_DIR = '/playlists';
export const STATE_FILE = '/state.json';

// Operation Actions — App directly executes the corresponding method
export const OperationActions = {
  PLAY_SONG: 'PLAY_SONG',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  NEXT_SONG: 'NEXT_SONG',
  PREV_SONG: 'PREV_SONG',
  SET_VOLUME: 'SET_VOLUME',
  SEEK: 'SEEK',
  SELECT_PLAYLIST: 'SELECT_PLAYLIST',
  SET_PLAY_MODE: 'SET_PLAY_MODE',
} as const;

// Mutation Actions — Agent has completed writing, App just refreshes Repo
export const MutationActions = {
  CREATE_SONG: 'CREATE_SONG',
  UPDATE_SONG: 'UPDATE_SONG',
  DELETE_SONG: 'DELETE_SONG',
  CREATE_PLAYLIST: 'CREATE_PLAYLIST',
  UPDATE_PLAYLIST: 'UPDATE_PLAYLIST',
  DELETE_PLAYLIST: 'DELETE_PLAYLIST',
} as const;

// Refresh Actions — notify App to reload specified Repo data
export const RefreshActions = {
  REFRESH_SONGS: 'REFRESH_SONGS',
  REFRESH_PLAYLISTS: 'REFRESH_PLAYLISTS',
} as const;

// System Actions — system-level
export const SystemActions = {
  SYNC_STATE: 'SYNC_STATE',
} as const;

// All Action Types (backward compatible)
export const ActionTypes = {
  ...OperationActions,
  ...MutationActions,
  ...RefreshActions,
  ...SystemActions,
} as const;

// Default player state
export const DEFAULT_PLAYER_STATE = {
  currentSongId: null,
  currentPlaylistContext: null,
  isPlaying: false,
  currentTime: 0,
  volume: 0.7,
  playMode: 'sequential' as const,
};

export const DEFAULT_APP_STATE = {
  currentView: 'all-songs' as const,
  activePlaylistId: null,
  player: DEFAULT_PLAYER_STATE,
  searchQuery: '',
};
