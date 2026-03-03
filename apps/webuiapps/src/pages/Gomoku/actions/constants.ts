/**
 * Gomoku Constants
 */

export const APP_ID = 9;
export const APP_NAME = 'gomoku';

export const BOARD_SIZE = 15;

// File paths
export const HISTORY_DIR = '/history';
export const STATE_FILE = '/state.json';

// Operation Actions
export const OperationActions = {
  PLACE_STONE: 'PLACE_STONE',
  UNDO_MOVE: 'UNDO_MOVE',
  NEW_GAME: 'NEW_GAME',
  SURRENDER: 'SURRENDER',
} as const;

// Mutation Actions
export const MutationActions = {
  CREATE_GAME: 'CREATE_GAME',
  UPDATE_GAME: 'UPDATE_GAME',
  DELETE_GAME: 'DELETE_GAME',
} as const;

// Refresh Actions
export const RefreshActions = {
  REFRESH_HISTORY: 'REFRESH_HISTORY',
} as const;

// System Actions
export const SystemActions = {
  SYNC_STATE: 'SYNC_STATE',
} as const;

export const ActionTypes = {
  ...OperationActions,
  ...MutationActions,
  ...RefreshActions,
  ...SystemActions,
} as const;

export const DEFAULT_GAME_STATE = {
  phase: 'selecting' as const,
  board: Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null)),
  currentTurn: 'black' as const,
  moves: [],
  players: null,
  humanColor: null,
  agentColor: null,
  winLine: null,
  winner: null,
};

export const DEFAULT_APP_STATE = {
  currentGameId: null,
  totalGames: 0,
  stats: {
    blackWins: 0,
    whiteWins: 0,
    draws: 0,
  },
};
