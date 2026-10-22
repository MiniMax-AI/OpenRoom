/**
 * Chess Engine — pure functions for board state, legal moves, and move execution.
 *
 * Extracted from index.tsx so that the Agent-side action dispatcher (vibe_action)
 * can share the exact same rules logic as the UI component. The UI imports
 * these symbols back in place, so there is no behavioral change.
 *
 * Additions on top of the original in-file engine:
 *   - boardToFen()         — GameState -> FEN string
 *   - fromNotation()       — "e2" -> [row, col]
 *   - legalMovesAlgebraic()— all legal moves for side-to-move as "e2e4" strings
 *   - suggestMove()        — pick a reasonable move (HINT action)
 */

import { generateId } from '@/lib';

// ============ Types ============
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
export type Color = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Board = (Piece | null)[][];
export type Pos = [number, number]; // [row, col]

export interface MoveRecord {
  from: Pos;
  to: Pos;
  piece: Piece;
  captured: Piece | null;
  promotion: PieceType | null;
  castling: 'K' | 'Q' | null;
  enPassant: boolean;
}

export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

export interface GameState {
  board: Board;
  currentTurn: Color;
  castlingRights: CastlingRights;
  enPassantTarget: Pos | null;
  halfMoveClock: number;
  moveHistory: MoveRecord[];
  gameStatus: 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';
  winner: Color | null;
  gameId: string;
  lastMove: { from: Pos; to: Pos } | null;
  isAgentThinking: boolean;
}

// ============ Coordinate Utilities ============
export const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < 8 && c >= 0 && c < 8;
export const posEq = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1];
export const toNotation = (r: number, c: number): string =>
  String.fromCharCode(97 + c) + String(8 - r);

/** Parse algebraic notation like "e2" into [row, col]. Returns null on bad input. */
export function fromNotation(sq: string): Pos | null {
  if (!sq || sq.length !== 2) return null;
  const file = sq.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(sq[1], 10);
  if (!Number.isFinite(rank) || rank < 1 || rank > 8) return null;
  if (file < 0 || file > 7) return null;
  return [8 - rank, file];
}

// ============ Initial Board ============
export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: 'b' };
    board[1][c] = { type: 'P', color: 'b' };
    board[6][c] = { type: 'P', color: 'w' };
    board[7][c] = { type: backRank[c], color: 'w' };
  }
  return board;
}

export function newGame(): GameState {
  return {
    board: createInitialBoard(),
    currentTurn: 'w',
    castlingRights: { wK: true, wQ: true, bK: true, bQ: true },
    enPassantTarget: null,
    halfMoveClock: 0,
    moveHistory: [],
    gameStatus: 'playing',
    winner: null,
    gameId: generateId(),
    lastMove: null,
    isAgentThinking: false,
  };
}

// ============ Chess Engine (Pure Functions) ============
export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** Check if a square is attacked by the specified color */
export function isAttackedBy(board: Board, r: number, c: number, byColor: Color): boolean {
  const opp = byColor;
  // Knight attacks
  const knightDeltas: Pos[] = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightDeltas) {
    const nr = r + dr,
      nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === opp && p.type === 'N') return true;
    }
  }

  // Straight-line attacks (Rook/Queen)
  const straightDirs: Pos[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of straightDirs) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i,
        nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const p = board[nr][nc];
      if (p) {
        if (p.color === opp && (p.type === 'R' || p.type === 'Q')) return true;
        break;
      }
    }
  }

  // Diagonal attacks (Bishop/Queen)
  const diagDirs: Pos[] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of diagDirs) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i,
        nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const p = board[nr][nc];
      if (p) {
        if (p.color === opp && (p.type === 'B' || p.type === 'Q')) return true;
        break;
      }
    }
  }

  // King attacks (one-step range)
  const kingDeltas: Pos[] = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];
  for (const [dr, dc] of kingDeltas) {
    const nr = r + dr,
      nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === opp && p.type === 'K') return true;
    }
  }

  // Pawn attacks
  const pawnDir = opp === 'w' ? -1 : 1;
  for (const dc of [-1, 1]) {
    const nr = r + pawnDir,
      nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === opp && p.type === 'P') return true;
    }
  }

  return false;
}

/** Find the position of the king of the specified color */
export function findKing(board: Board, color: Color): Pos {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'K' && p.color === color) return [r, c];
    }
  }
  return [-1, -1]; // Should not happen
}

export function isInCheck(board: Board, color: Color): boolean {
  const [kr, kc] = findKing(board, color);
  return isAttackedBy(board, kr, kc, color === 'w' ? 'b' : 'w');
}

/** Generate all pseudo-legal targets for a piece (without check validation) */
export function pseudoMoves(
  board: Board,
  r: number,
  c: number,
  castling: CastlingRights,
  epTarget: Pos | null,
): Pos[] {
  const piece = board[r][c];
  if (!piece) return [];
  const { type, color } = piece;
  const targets: Pos[] = [];
  const opp = color === 'w' ? 'b' : 'w';

  const addIfValid = (nr: number, nc: number): boolean => {
    if (!inBounds(nr, nc)) return false;
    const t = board[nr][nc];
    if (t && t.color === color) return false;
    targets.push([nr, nc]);
    return !t; // true = can continue sliding
  };

  const slide = (dirs: Pos[]) => {
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < 8; i++) {
        if (!addIfValid(r + dr * i, c + dc * i)) break;
      }
    }
  };

  switch (type) {
    case 'P': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      // Move forward one step
      if (inBounds(r + dir, c) && !board[r + dir][c]) {
        targets.push([r + dir, c]);
        // Move forward two steps
        if (r === startRow && !board[r + dir * 2][c]) {
          targets.push([r + dir * 2, c]);
        }
      }
      // Capture (including en passant)
      for (const dc of [-1, 1]) {
        const nr = r + dir,
          nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const t = board[nr][nc];
        if (t && t.color === opp) targets.push([nr, nc]);
        if (epTarget && nr === epTarget[0] && nc === epTarget[1]) targets.push([nr, nc]);
      }
      break;
    }
    case 'N': {
      const deltas: Pos[] = [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ];
      for (const [dr, dc] of deltas) addIfValid(r + dr, c + dc);
      break;
    }
    case 'B':
      slide([
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]);
      break;
    case 'R':
      slide([
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
      break;
    case 'Q':
      slide([
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
      break;
    case 'K': {
      const deltas: Pos[] = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ];
      for (const [dr, dc] of deltas) addIfValid(r + dr, c + dc);
      // Castling
      const row = color === 'w' ? 7 : 0;
      if (r === row && c === 4) {
        const oppColor = color === 'w' ? 'b' : 'w';
        const kSide = color === 'w' ? castling.wK : castling.bK;
        const qSide = color === 'w' ? castling.wQ : castling.bQ;
        if (
          kSide &&
          !board[row][5] &&
          !board[row][6] &&
          board[row][7]?.type === 'R' &&
          board[row][7]?.color === color &&
          !isAttackedBy(board, row, 4, oppColor) &&
          !isAttackedBy(board, row, 5, oppColor) &&
          !isAttackedBy(board, row, 6, oppColor)
        ) {
          targets.push([row, 6]);
        }
        if (
          qSide &&
          !board[row][3] &&
          !board[row][2] &&
          !board[row][1] &&
          board[row][0]?.type === 'R' &&
          board[row][0]?.color === color &&
          !isAttackedBy(board, row, 4, oppColor) &&
          !isAttackedBy(board, row, 3, oppColor) &&
          !isAttackedBy(board, row, 2, oppColor)
        ) {
          targets.push([row, 2]);
        }
      }
      break;
    }
  }

  return targets;
}

/** Apply a move on the board and return the new board (without global state update) */
export function applyMoveOnBoard(
  board: Board,
  from: Pos,
  to: Pos,
  epTarget: Pos | null,
): Board {
  const b = cloneBoard(board);
  const piece = b[from[0]][from[1]]!;

  // En passant capture
  if (piece.type === 'P' && epTarget && posEq(to, epTarget)) {
    const capturedRow = piece.color === 'w' ? to[0] + 1 : to[0] - 1;
    b[capturedRow][to[1]] = null;
  }

  // Move rook for castling
  if (piece.type === 'K' && Math.abs(to[1] - from[1]) === 2) {
    const row = from[0];
    if (to[1] === 6) {
      b[row][5] = b[row][7];
      b[row][7] = null;
    } else if (to[1] === 2) {
      b[row][3] = b[row][0];
      b[row][0] = null;
    }
  }

  // Pawn promotion (auto-promote to Queen)
  const promotionRow = piece.color === 'w' ? 0 : 7;
  if (piece.type === 'P' && to[0] === promotionRow) {
    b[to[0]][to[1]] = { type: 'Q', color: piece.color };
  } else {
    b[to[0]][to[1]] = piece;
  }
  b[from[0]][from[1]] = null;

  return b;
}

/** Generate all legal moves for the specified color */
export function allLegalMoves(
  board: Board,
  color: Color,
  castling: CastlingRights,
  epTarget: Pos | null,
): { from: Pos; to: Pos }[] {
  const moves: { from: Pos; to: Pos }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      const targets = pseudoMoves(board, r, c, castling, epTarget);
      for (const target of targets) {
        const newBoard = applyMoveOnBoard(board, [r, c], target, epTarget);
        if (!isInCheck(newBoard, color)) {
          moves.push({ from: [r, c], to: target });
        }
      }
    }
  }
  return moves;
}

/** Get legal move targets for a specific square */
export function legalMovesFor(
  board: Board,
  r: number,
  c: number,
  castling: CastlingRights,
  epTarget: Pos | null,
): Pos[] {
  const piece = board[r][c];
  if (!piece) return [];
  const targets = pseudoMoves(board, r, c, castling, epTarget);
  return targets.filter((to) => {
    const newBoard = applyMoveOnBoard(board, [r, c], to, epTarget);
    return !isInCheck(newBoard, piece.color);
  });
}

/** Execute a move and return the new complete GameState */
export function executeMove(state: GameState, from: Pos, to: Pos): GameState {
  const { board, castlingRights, enPassantTarget, moveHistory, currentTurn } = state;
  const piece = board[from[0]][from[1]]!;
  const captured = board[to[0]][to[1]];
  const isEP = piece.type === 'P' && enPassantTarget && posEq(to, enPassantTarget);
  const isCastling = piece.type === 'K' && Math.abs(to[1] - from[1]) === 2;
  const promotionRow = piece.color === 'w' ? 0 : 7;
  const isPromotion = piece.type === 'P' && to[0] === promotionRow;

  // New board
  const newBoard = applyMoveOnBoard(board, from, to, enPassantTarget);

  // Update castling rights
  const cr = { ...castlingRights };
  if (piece.type === 'K') {
    if (piece.color === 'w') {
      cr.wK = false;
      cr.wQ = false;
    } else {
      cr.bK = false;
      cr.bQ = false;
    }
  }
  if (piece.type === 'R') {
    if (from[0] === 7 && from[1] === 7) cr.wK = false;
    if (from[0] === 7 && from[1] === 0) cr.wQ = false;
    if (from[0] === 0 && from[1] === 7) cr.bK = false;
    if (from[0] === 0 && from[1] === 0) cr.bQ = false;
  }
  // If opponent's rook was captured, also update castling rights
  if (to[0] === 0 && to[1] === 7) cr.bK = false;
  if (to[0] === 0 && to[1] === 0) cr.bQ = false;
  if (to[0] === 7 && to[1] === 7) cr.wK = false;
  if (to[0] === 7 && to[1] === 0) cr.wQ = false;

  // En passant target
  let newEP: Pos | null = null;
  if (piece.type === 'P' && Math.abs(to[0] - from[0]) === 2) {
    newEP = [(from[0] + to[0]) / 2, from[1]];
  }

  // Record
  const epCaptured = isEP ? board[piece.color === 'w' ? to[0] + 1 : to[0] - 1][to[1]] : null;
  const record: MoveRecord = {
    from,
    to,
    piece: { ...piece },
    captured: isEP ? epCaptured : captured ? { ...captured } : null,
    promotion: isPromotion ? 'Q' : null,
    castling: isCastling ? (to[1] === 6 ? 'K' : 'Q') : null,
    enPassant: !!isEP,
  };

  const oppColor = currentTurn === 'w' ? 'b' : 'w';
  const oppHasLegalMoves = allLegalMoves(newBoard, oppColor, cr, newEP).length > 0;
  const oppInCheck = isInCheck(newBoard, oppColor);

  let gameStatus: GameState['gameStatus'] = 'playing';
  let winner: Color | null = null;

  if (!oppHasLegalMoves && oppInCheck) {
    gameStatus = 'checkmate';
    winner = currentTurn;
  } else if (!oppHasLegalMoves && !oppInCheck) {
    gameStatus = 'stalemate';
  } else if (oppInCheck) {
    gameStatus = 'check';
  }

  // 50-move rule
  const halfMoveClock = piece.type === 'P' || captured || isEP ? 0 : state.halfMoveClock + 1;
  if (halfMoveClock >= 100 && gameStatus === 'playing') {
    gameStatus = 'draw';
  }

  const isGameOver =
    gameStatus === 'checkmate' || gameStatus === 'stalemate' || gameStatus === 'draw';

  return {
    ...state,
    board: newBoard,
    currentTurn: oppColor,
    castlingRights: cr,
    enPassantTarget: newEP,
    halfMoveClock,
    moveHistory: [...moveHistory, record],
    gameStatus,
    winner,
    lastMove: { from, to },
    // If game is not over and it's black's turn -> agent is thinking
    isAgentThinking: !isGameOver && oppColor === 'b',
  };
}

export function isValidState(d: unknown): d is GameState {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return (
    Array.isArray(o.board) &&
    o.board.length === 8 &&
    typeof o.currentTurn === 'string' &&
    typeof o.gameStatus === 'string' &&
    typeof o.gameId === 'string'
  );
}

// ============ FEN + Agent Helpers (additions) ============

const FEN_PIECE: Record<string, string> = {
  wK: 'K',
  wQ: 'Q',
  wR: 'R',
  wB: 'B',
  wN: 'N',
  wP: 'P',
  bK: 'k',
  bQ: 'q',
  bR: 'r',
  bB: 'b',
  bN: 'n',
  bP: 'p',
};

/** Convert GameState -> FEN string (standard 6-field notation). */
export function boardToFen(state: GameState): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += FEN_PIECE[`${p.color}${p.type}`];
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const placement = rows.join('/');
  const turn = state.currentTurn;
  const cr = state.castlingRights;
  let castle = '';
  if (cr.wK) castle += 'K';
  if (cr.wQ) castle += 'Q';
  if (cr.bK) castle += 'k';
  if (cr.bQ) castle += 'q';
  if (!castle) castle = '-';
  const ep = state.enPassantTarget
    ? toNotation(state.enPassantTarget[0], state.enPassantTarget[1])
    : '-';
  const halfmove = state.halfMoveClock;
  const fullmove = Math.floor(state.moveHistory.length / 2) + 1;
  return `${placement} ${turn} ${castle} ${ep} ${halfmove} ${fullmove}`;
}

/** List legal moves for the side-to-move as algebraic strings ("e2e4"). */
export function legalMovesAlgebraic(state: GameState): string[] {
  const moves = allLegalMoves(
    state.board,
    state.currentTurn,
    state.castlingRights,
    state.enPassantTarget,
  );
  return moves.map(
    (m) => `${toNotation(m.from[0], m.from[1])}${toNotation(m.to[0], m.to[1])}`,
  );
}

const PIECE_VALUE: Record<PieceType, number> = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 100,
};

/**
 * Suggest a move for the current player. Heuristic:
 *   1. Prefer moves that deliver checkmate.
 *   2. Prefer captures of highest-value pieces.
 *   3. Otherwise pick a random legal move.
 *
 * Returns { move: "e2e4", reason: "capture queen" } or null if no legal moves.
 */
export function suggestMove(
  state: GameState,
): { move: string; reason: string } | null {
  const moves = allLegalMoves(
    state.board,
    state.currentTurn,
    state.castlingRights,
    state.enPassantTarget,
  );
  if (moves.length === 0) return null;

  let bestCapture: { m: { from: Pos; to: Pos }; value: number; victim: PieceType } | null = null;
  let mateMove: { from: Pos; to: Pos } | null = null;

  for (const m of moves) {
    const nextState = executeMove(state, m.from, m.to);
    if (nextState.gameStatus === 'checkmate') {
      mateMove = m;
      break;
    }
    const victim = state.board[m.to[0]][m.to[1]];
    if (victim) {
      const value = PIECE_VALUE[victim.type];
      if (!bestCapture || value > bestCapture.value) {
        bestCapture = { m, value, victim: victim.type };
      }
    }
  }

  const fmt = (mv: { from: Pos; to: Pos }): string =>
    `${toNotation(mv.from[0], mv.from[1])}${toNotation(mv.to[0], mv.to[1])}`;

  if (mateMove) {
    return { move: fmt(mateMove), reason: 'delivers checkmate' };
  }
  if (bestCapture) {
    return { move: fmt(bestCapture.m), reason: `capture ${bestCapture.victim}` };
  }
  const fallback = moves[Math.floor(Math.random() * moves.length)];
  return { move: fmt(fallback), reason: 'developing move' };
}
