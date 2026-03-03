import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useFileSystem,
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  createAppFileApi,
  generateId,
  fetchVibeInfo,
  useVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import styles from './index.module.scss';

const ChessBoard3D = lazy(() => import('./components/ChessBoard3D'));

// ============ Constants ============
const APP_ID = 12;
const APP_NAME = 'chess';
const STATE_FILE = '/state.json';

const chessFileApi = createAppFileApi(APP_NAME);

// ============ Types ============
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type Color = 'w' | 'b';

interface Piece {
  type: PieceType;
  color: Color;
}

type Board = (Piece | null)[][];
type Pos = [number, number]; // [row, col]

interface MoveRecord {
  from: Pos;
  to: Pos;
  piece: Piece;
  captured: Piece | null;
  promotion: PieceType | null;
  castling: 'K' | 'Q' | null;
  enPassant: boolean;
}

interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

interface GameState {
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

// ============ Piece Symbols ============
const PIECE_SYMBOLS: Record<string, string> = {
  wK: '\u2654',
  wQ: '\u2655',
  wR: '\u2656',
  wB: '\u2657',
  wN: '\u2658',
  wP: '\u2659',
  bK: '\u265A',
  bQ: '\u265B',
  bR: '\u265C',
  bB: '\u265D',
  bN: '\u265E',
  bP: '\u265F',
};

// ============ Coordinate Utilities ============
const inBounds = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;
const posEq = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1];
const toNotation = (r: number, c: number): string => String.fromCharCode(97 + c) + String(8 - r);

// ============ Initial Board ============
function createInitialBoard(): Board {
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

function newGame(): GameState {
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
function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** Check if a square is attacked by the specified color */
function isAttackedBy(board: Board, r: number, c: number, byColor: Color): boolean {
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
function findKing(board: Board, color: Color): Pos {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'K' && p.color === color) return [r, c];
    }
  }
  return [-1, -1]; // Should not happen
}

function isInCheck(board: Board, color: Color): boolean {
  const [kr, kc] = findKing(board, color);
  return isAttackedBy(board, kr, kc, color === 'w' ? 'b' : 'w');
}

/** Generate all pseudo-legal targets for a piece (without check validation) */
function pseudoMoves(
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
function applyMoveOnBoard(board: Board, from: Pos, to: Pos, epTarget: Pos | null): Board {
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
function allLegalMoves(
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
function legalMovesFor(
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
function executeMove(state: GameState, from: Pos, to: Pos): GameState {
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

function isValidState(d: unknown): d is GameState {
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

// ============ Move Notation (reserved for future use) ============
// function moveNotation(record: MoveRecord): string {
//   if (record.castling === 'K') return 'O-O';
//   if (record.castling === 'Q') return 'O-O-O';
//   const sym = PIECE_SYMBOLS[`${record.piece.color}${record.piece.type}`];
//   const fromStr = toNotation(record.from[0], record.from[1]);
//   const toStr = toNotation(record.to[0], record.to[1]);
//   const cap = record.captured ? 'x' : '-';
//   const promo = record.promotion ? `=${PIECE_SYMBOLS[`${record.piece.color}Q`]}` : '';
//   return `${sym}${fromStr}${cap}${toStr}${promo}`;
// }

// ============ Component ============
const Chess: React.FC = () => {
  const { t } = useTranslation('chess');
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedPos, setSelectedPos] = useState<Pos | null>(null);
  const [validTargets, setValidTargets] = useState<Pos[]>([]);
  const [loading, setLoading] = useState(true);

  const { characterInfo } = useVibeInfo();
  const opponentName = characterInfo?.name ?? t('player.opponent');

  const { initFromCloud, getByPath, syncToCloud, saveFile } = useFileSystem({
    fileApi: chessFileApi,
  });

  // Read state from in-memory file tree
  const loadFromFS = useCallback((): GameState | null => {
    const node = getByPath(STATE_FILE);
    if (!node?.content) return null;
    const data = typeof node.content === 'string' ? JSON.parse(node.content) : node.content;
    return isValidState(data) ? data : null;
  }, [getByPath]);

  // Persist to cloud
  const persist = useCallback(
    async (st: GameState) => {
      saveFile(STATE_FILE, st);
      try {
        await syncToCloud(STATE_FILE, st);
      } catch (e) {
        console.warn('[Chess] syncToCloud error:', e);
      }
    },
    [saveFile, syncToCloud],
  );

  // Refresh from cloud
  const refreshCloud = useCallback(async () => {
    try {
      await initFromCloud();
      const st = loadFromFS();
      if (st) {
        setGame(st);
        setSelectedPos(null);
        setValidTargets([]);
      }
    } catch (e) {
      console.warn('[Chess] refreshCloud error:', e);
    }
  }, [initFromCloud, loadFromFS]);

  // Agent action handler
  const handleAgent = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'AGENT_MOVE':
        case 'SYNC_STATE':
        case 'NEW_GAME':
          await refreshCloud();
          return 'success';
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [refreshCloud],
  );
  useAgentActionListener(APP_ID, handleAgent);

  // Initialization
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const mgr = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'game',
          name: 'Chess',
          windowStyle: { width: 800, height: 640 },
        });

        mgr.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'game',
          name: 'Chess',
          windowStyle: { width: 800, height: 640 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch {
          /* Non-critical path */
        }

        try {
          await initFromCloud();
        } catch {
          /* May have no data on first load */
        }

        if (cancelled) return;

        let st = loadFromFS();
        if (!st) {
          st = newGame();
          await persist(st);
        }

        setGame(st);
        setLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        mgr.ready();
      } catch (e) {
        if (!cancelled) {
          console.error('[Chess] init error:', e);
          setLoading(false);
          reportLifecycle(AppLifecycle.ERROR, String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // Board square click
  const onSquareClick = useCallback(
    (r: number, c: number) => {
      if (!game) return;
      // Disable interaction when game is over or agent is thinking
      if (game.isAgentThinking || game.currentTurn !== 'w') return;
      if (
        game.gameStatus === 'checkmate' ||
        game.gameStatus === 'stalemate' ||
        game.gameStatus === 'draw'
      )
        return;

      const piece = game.board[r][c];

      // A piece is already selected, clicking a target square
      if (selectedPos) {
        // Check if a valid target was clicked
        const isTarget = validTargets.some((t) => posEq(t, [r, c]));
        if (isTarget) {
          // Execute move
          const newState = executeMove(game, selectedPos, [r, c]);
          setGame(newState);
          setSelectedPos(null);
          setValidTargets([]);
          persist(newState);

          // Report user action
          reportAction(APP_ID, 'USER_MOVE', {
            from: toNotation(selectedPos[0], selectedPos[1]),
            to: toNotation(r, c),
            gameId: newState.gameId,
          });
          return;
        }

        // Clicked another own piece -> re-select
        if (piece && piece.color === 'w') {
          const moves = legalMovesFor(game.board, r, c, game.castlingRights, game.enPassantTarget);
          if (moves.length > 0) {
            setSelectedPos([r, c]);
            setValidTargets(moves);
          } else {
            setSelectedPos(null);
            setValidTargets([]);
          }
          return;
        }

        // Clicked empty square or opponent piece (not a valid target) -> deselect
        setSelectedPos(null);
        setValidTargets([]);
        return;
      }

      // No piece selected, clicking own piece
      if (piece && piece.color === 'w') {
        const moves = legalMovesFor(game.board, r, c, game.castlingRights, game.enPassantTarget);
        if (moves.length > 0) {
          setSelectedPos([r, c]);
          setValidTargets(moves);
        }
      }
    },
    [game, selectedPos, validTargets, persist],
  );

  // New game
  const onNewGame = useCallback(async () => {
    const st = newGame();
    setGame(st);
    setSelectedPos(null);
    setValidTargets([]);
    await persist(st);
    reportAction(APP_ID, 'NEW_GAME', { gameId: st.gameId });
  }, [persist]);

  // Captured pieces
  const capturedPieces = useMemo(() => {
    if (!game) return { w: [] as Piece[], b: [] as Piece[] };
    const w: Piece[] = [];
    const b: Piece[] = [];
    for (const m of game.moveHistory) {
      if (m.captured) {
        if (m.captured.color === 'w') w.push(m.captured);
        else b.push(m.captured);
      }
    }
    // Sort by piece value
    const order: Record<PieceType, number> = { Q: 5, R: 4, B: 3, N: 2, P: 1, K: 0 };
    w.sort((a, b_) => order[b_.type] - order[a.type]);
    b.sort((a, b_) => order[b_.type] - order[a.type]);
    return { w, b };
  }, [game]);

  // Status bar text
  const statusText = useMemo(() => {
    if (!game) return '';
    switch (game.gameStatus) {
      case 'checkmate':
        return game.winner === 'w'
          ? t('status.checkmateWin')
          : t('status.checkmateLose', { name: opponentName });
      case 'stalemate':
        return t('status.stalemate');
      case 'draw':
        return t('status.draw');
      case 'check':
        return game.isAgentThinking
          ? t('status.checkThinking', { name: opponentName })
          : t('status.checkYourTurn');
      default:
        return game.isAgentThinking
          ? t('status.thinking', { name: opponentName })
          : t('status.yourTurn');
    }
  }, [game, opponentName, t]);

  // Check highlight
  const checkKingPos = useMemo((): Pos | null => {
    if (!game) return null;
    if (game.gameStatus === 'check' || game.gameStatus === 'checkmate') {
      return findKing(game.board, game.currentTurn);
    }
    return null;
  }, [game]);

  // ============ Render ============
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <span className={styles.errorText}>{t('error.loadFailed')}</span>
        </div>
      </div>
    );
  }

  const isGameOver =
    game.gameStatus === 'checkmate' ||
    game.gameStatus === 'stalemate' ||
    game.gameStatus === 'draw';

  return (
    <div className={styles.container}>
      {/* ===== Full-screen 3D Board ===== */}
      <div className={styles.boardCanvas}>
        <Suspense
          fallback={
            <div className={styles.boardLoading}>
              <div className={styles.spinner} />
            </div>
          }
        >
          <ChessBoard3D
            board={game.board}
            selectedPos={selectedPos}
            validTargets={validTargets}
            lastMove={game.lastMove}
            checkKingPos={checkKingPos}
            canInteract={!game.isAgentThinking && game.currentTurn === 'w' && !isGameOver}
            onSquareClick={onSquareClick}
          />
        </Suspense>
      </div>

      {/* ===== Top-left Menu ===== */}
      <div className={styles.topLeft}>
        <button type="button" className={styles.menuBtn} onClick={onNewGame}>
          {t('controls.newGame')}
        </button>
        <span className={styles.statusHint}>{statusText}</span>
      </div>

      {/* ===== Top-right NPC Info ===== */}
      <div className={styles.topRight}>
        <div className={styles.npcInfo}>
          <div className={styles.avatarWrap}>
            {characterInfo?.avatarUrl ? (
              <img src={characterInfo.avatarUrl} alt="" className={styles.avatar} />
            ) : (
              <div className={styles.avatarFallback}>♚</div>
            )}
          </div>
          <div className={styles.nameBlock}>
            <span className={styles.nameText}>{opponentName}</span>
            {game.isAgentThinking && (
              <div className={styles.thinkingDots}>
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        </div>
        <div className={styles.capturedRow}>
          {capturedPieces.w.map((p, i) => (
            <span key={`cw-${i}`} className={styles.capturedPiece}>
              {PIECE_SYMBOLS[`${p.color}${p.type}`]}
            </span>
          ))}
        </div>
      </div>

      {/* ===== Bottom-left Player Info ===== */}
      <div className={styles.bottomLeft}>
        <div className={styles.playerInfo}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatarFallback}>♔</div>
          </div>
          <span className={styles.nameText}>{t('player.you')}</span>
        </div>
        <div className={styles.capturedRow}>
          {capturedPieces.b.map((p, i) => (
            <span key={`cb-${i}`} className={styles.capturedPiece}>
              {PIECE_SYMBOLS[`${p.color}${p.type}`]}
            </span>
          ))}
        </div>
      </div>

      {/* ===== Game Over Overlay ===== */}
      {isGameOver && (
        <div className={styles.endOverlay}>
          <div className={styles.endBox}>
            <h2 className={styles.endTitle}>
              {game.gameStatus === 'checkmate'
                ? game.winner === 'w'
                  ? t('result.youWin')
                  : t('result.opponentWins', { name: opponentName })
                : game.gameStatus === 'stalemate'
                  ? t('result.stalemate')
                  : t('result.draw')}
            </h2>
            <p className={styles.endSub}>
              {t('result.movesPlayed', { count: game.moveHistory.length })}
            </p>
            <button type="button" className={styles.endBtn} onClick={onNewGame}>
              {t('result.playAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chess;
