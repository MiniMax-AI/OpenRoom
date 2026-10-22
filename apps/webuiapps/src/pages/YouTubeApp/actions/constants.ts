/**
 * YouTubeApp constants
 *
 * Actions represent methods the Agent can invoke on the App.
 * Kayley can search, play, pause/resume, advance, set volume, and queue
 * multiple videos — enough to DJ a full date-night.
 */

export const APP_ID = 3;
export const APP_NAME = 'youtube';

// Operation Actions — App directly executes the corresponding method
export const OperationActions = {
  SEARCH: 'SEARCH',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  NEXT: 'NEXT',
  SET_VOLUME: 'SET_VOLUME',
  QUEUE: 'QUEUE',
} as const;

// All Action Types
export const ActionTypes = {
  ...OperationActions,
} as const;

// Defaults
export const DEFAULT_MAX_RESULTS = 10;
export const MAX_MAX_RESULTS = 25;
export const DEFAULT_QUEUE_SIZE = 10;
export const MAX_QUEUE_SIZE = 25;
