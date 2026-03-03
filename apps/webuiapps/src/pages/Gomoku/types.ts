/**
 * Gomoku Type Definitions
 */

export type StoneColor = 'black' | 'white';

export type GamePhase = 'selecting' | 'playing' | 'ended';

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  position: Position;
  color: StoneColor;
  moveNumber: number;
  timestamp: number;
}

export interface WinLine {
  positions: Position[];
  color: StoneColor;
}

export type PlayerRole = 'human' | 'agent';

export interface Player {
  name: string;
  color: StoneColor;
  role: PlayerRole;
}

export interface GameRecord {
  id: string;
  players: [Player, Player];
  moves: Move[];
  result: {
    winner: StoneColor | null; // null = draw
    winLine: WinLine | null;
    reason: 'five-in-a-row' | 'surrender' | 'draw';
  } | null;
  startedAt: number;
  endedAt: number | null;
}

export interface GameState {
  phase: GamePhase;
  board: (StoneColor | null)[][];
  currentTurn: StoneColor;
  moves: Move[];
  players: [Player, Player] | null;
  humanColor: StoneColor | null;
  agentColor: StoneColor | null;
  winLine: WinLine | null;
  winner: StoneColor | null;
}

export interface AppState {
  currentGameId: string | null;
  totalGames: number;
  stats: {
    blackWins: number;
    whiteWins: number;
    draws: number;
  };
}

export type GomokuAction =
  // Operation Actions
  | { type: 'PLACE_STONE'; payload: { row: number; col: number } }
  | { type: 'UNDO_MOVE' }
  | { type: 'NEW_GAME' }
  | { type: 'SURRENDER'; payload: { color: StoneColor } }
  // Mutation Actions
  | { type: 'CREATE_GAME' }
  | { type: 'UPDATE_GAME' }
  | { type: 'DELETE_GAME' }
  // Refresh Actions
  | { type: 'REFRESH_HISTORY' }
  // System Actions
  | { type: 'SYNC_STATE' };
