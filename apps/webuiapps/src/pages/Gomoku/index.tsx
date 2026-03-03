import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  fetchVibeInfo,
  useVibeInfo,
  createAppFileApi,
  generateId,
  batchConcurrent,
  type CharacterAppAction,
} from '@/lib';
import { RotateCcw, Undo2, Flag, Minus } from 'lucide-react';
import './i18n';
import type {
  StoneColor,
  GamePhase,
  Position,
  Move,
  WinLine,
  Player,
  GameRecord,
  GameState,
  AppState,
} from './types';
import {
  APP_ID,
  APP_NAME,
  BOARD_SIZE,
  HISTORY_DIR,
  STATE_FILE,
  ActionTypes,
  DEFAULT_GAME_STATE,
  DEFAULT_APP_STATE,
} from './actions/constants';
import styles from './index.module.scss';

const gomokuFileApi = createAppFileApi(APP_NAME);

// ============ Game Logic Utilities ============

function createEmptyBoard(): (StoneColor | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

function checkWin(
  board: (StoneColor | null)[][],
  row: number,
  col: number,
  color: StoneColor,
): Position[] | null {
  const directions = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal \
    [1, -1], // diagonal /
  ];

  for (const [dr, dc] of directions) {
    const line: Position[] = [{ row, col }];

    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
      if (board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }

    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
      if (board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }

    if (line.length >= 5) {
      return line;
    }
  }

  return null;
}

function isBoardFull(board: (StoneColor | null)[][]): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

// Star points for 15x15 board
const STAR_POINTS: Position[] = [
  { row: 3, col: 3 },
  { row: 3, col: 7 },
  { row: 3, col: 11 },
  { row: 7, col: 3 },
  { row: 7, col: 7 },
  { row: 7, col: 11 },
  { row: 11, col: 3 },
  { row: 11, col: 7 },
  { row: 11, col: 11 },
];

// ============ Board SVG Constants ============
const PADDING = 24;
const CELL_SIZE = 36;
const STONE_RADIUS = 14;
const BOARD_PX = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE;

function toSvgX(col: number): number {
  return PADDING + col * CELL_SIZE;
}

function toSvgY(row: number): number {
  return PADDING + row * CELL_SIZE;
}

// ============ StartScreen Component ============
interface StartScreenProps {
  onSelectColor: (color: StoneColor) => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onSelectColor }) => {
  const { t } = useTranslation('gomoku');

  return (
    <div className={styles.startScreen}>
      <div className={styles.startSubtitle}>{t('start.subtitle')}</div>
      <div className={styles.colorSelection}>
        <button className={styles.colorOption} onClick={() => onSelectColor('black')}>
          <div className={`${styles.stonePreview} ${styles.black}`} />
          <span className={styles.colorLabel}>{t('start.black')}</span>
          <span className={styles.colorHint}>{t('start.first')}</span>
        </button>
        <button className={styles.colorOption} onClick={() => onSelectColor('white')}>
          <div className={`${styles.stonePreview} ${styles.white}`} />
          <span className={styles.colorLabel}>{t('start.white')}</span>
          <span className={styles.colorHint}>{t('start.second')}</span>
        </button>
      </div>
    </div>
  );
};

// ============ GameBoard Component ============
interface GameBoardProps {
  board: (StoneColor | null)[][];
  currentTurn: StoneColor;
  humanColor: StoneColor | null;
  lastMove: Position | null;
  winLine: WinLine | null;
  phase: GamePhase;
  onPlaceStone: (row: number, col: number) => void;
}

const GameBoard: React.FC<GameBoardProps> = ({
  board,
  currentTurn,
  humanColor,
  lastMove,
  winLine,
  phase,
  onPlaceStone,
}) => {
  const [hoverPos, setHoverPos] = useState<Position | null>(null);
  const boardRef = useRef<SVGSVGElement>(null);

  const isHumanTurn = phase === 'playing' && currentTurn === humanColor;

  const winPositionSet = useMemo(() => {
    if (!winLine) return new Set<string>();
    return new Set(winLine.positions.map((p) => `${p.row}-${p.col}`));
  }, [winLine]);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!isHumanTurn) return;
      if (board[row][col] !== null) return;
      onPlaceStone(row, col);
    },
    [isHumanTurn, board, onPlaceStone],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isHumanTurn) {
        setHoverPos(null);
        return;
      }
      const svg = boardRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const col = Math.round((svgPt.x - PADDING) / CELL_SIZE);
      const row = Math.round((svgPt.y - PADDING) / CELL_SIZE);
      if (
        row >= 0 &&
        row < BOARD_SIZE &&
        col >= 0 &&
        col < BOARD_SIZE &&
        board[row][col] === null
      ) {
        setHoverPos({ row, col });
      } else {
        setHoverPos(null);
      }
    },
    [isHumanTurn, board],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverPos(null);
  }, []);

  return (
    <div className={styles.boardContainer}>
      <svg
        ref={boardRef}
        className={styles.boardSvg}
        viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
        style={{ width: '100%', maxWidth: BOARD_PX, maxHeight: '100%', aspectRatio: '1' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <rect x="0" y="0" width={BOARD_PX} height={BOARD_PX} rx="8" ry="8" fill="#dcb35c" />
        <rect
          x="0"
          y="0"
          width={BOARD_PX}
          height={BOARD_PX}
          rx="8"
          ry="8"
          fill="url(#woodTexture)"
          opacity="0.15"
        />

        <defs>
          <pattern id="woodTexture" patternUnits="userSpaceOnUse" width="100" height="100">
            <line
              x1="0"
              y1="10"
              x2="100"
              y2="12"
              stroke="#5d4e37"
              strokeWidth="0.5"
              opacity="0.3"
            />
            <line
              x1="0"
              y1="30"
              x2="100"
              y2="28"
              stroke="#5d4e37"
              strokeWidth="0.3"
              opacity="0.2"
            />
            <line
              x1="0"
              y1="50"
              x2="100"
              y2="52"
              stroke="#5d4e37"
              strokeWidth="0.5"
              opacity="0.3"
            />
            <line
              x1="0"
              y1="70"
              x2="100"
              y2="68"
              stroke="#5d4e37"
              strokeWidth="0.3"
              opacity="0.2"
            />
            <line
              x1="0"
              y1="90"
              x2="100"
              y2="92"
              stroke="#5d4e37"
              strokeWidth="0.5"
              opacity="0.3"
            />
          </pattern>

          <radialGradient id="blackStoneGrad" cx="0.38" cy="0.35" r="0.55">
            <stop offset="0%" stopColor="#555" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
          <radialGradient id="whiteStoneGrad" cx="0.38" cy="0.35" r="0.55">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e0e0e0" />
          </radialGradient>

          <filter id="stoneShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1.5" stdDeviation="1.5" floodColor="rgba(0,0,0,0.35)" />
          </filter>
        </defs>

        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <React.Fragment key={`grid-${i}`}>
            <line
              x1={toSvgX(0)}
              y1={toSvgY(i)}
              x2={toSvgX(BOARD_SIZE - 1)}
              y2={toSvgY(i)}
              className={styles.gridLine}
            />
            <line
              x1={toSvgX(i)}
              y1={toSvgY(0)}
              x2={toSvgX(i)}
              y2={toSvgY(BOARD_SIZE - 1)}
              className={styles.gridLine}
            />
          </React.Fragment>
        ))}

        {STAR_POINTS.map((p) => (
          <circle
            key={`star-${p.row}-${p.col}`}
            cx={toSvgX(p.col)}
            cy={toSvgY(p.row)}
            r={3}
            className={styles.starPoint}
          />
        ))}

        {board.map((row, ri) =>
          row.map((cell, ci) => {
            if (!cell) return null;
            const isLast = lastMove && lastMove.row === ri && lastMove.col === ci;
            const isWin = winPositionSet.has(`${ri}-${ci}`);
            return (
              <circle
                key={`stone-${ri}-${ci}`}
                cx={toSvgX(ci)}
                cy={toSvgY(ri)}
                r={STONE_RADIUS}
                className={[
                  styles.stone,
                  cell === 'black' ? styles.stoneBlack : styles.stoneWhite,
                  isLast && !isWin ? styles.lastMove : '',
                  isWin ? styles.winStone : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                filter="url(#stoneShadow)"
              />
            );
          }),
        )}

        {winLine &&
          winLine.positions.length >= 2 &&
          (() => {
            const sorted = [...winLine.positions].sort((a, b) => {
              if (a.row !== b.row) return a.row - b.row;
              return a.col - b.col;
            });
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            return (
              <line
                x1={toSvgX(first.col)}
                y1={toSvgY(first.row)}
                x2={toSvgX(last.col)}
                y2={toSvgY(last.row)}
                className={styles.winLine}
              />
            );
          })()}

        {hoverPos && isHumanTurn && humanColor && (
          <circle
            cx={toSvgX(hoverPos.col)}
            cy={toSvgY(hoverPos.row)}
            r={STONE_RADIUS}
            className={styles.hoverStone}
            fill={humanColor === 'black' ? '#333' : '#ddd'}
          />
        )}

        {isHumanTurn &&
          board.map((row, ri) =>
            row.map((cell, ci) => {
              if (cell !== null) return null;
              return (
                <rect
                  key={`click-${ri}-${ci}`}
                  x={toSvgX(ci) - CELL_SIZE / 2}
                  y={toSvgY(ri) - CELL_SIZE / 2}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  className={styles.clickTarget}
                  onClick={() => handleCellClick(ri, ci)}
                />
              );
            }),
          )}
      </svg>
    </div>
  );
};

// ============ ResultOverlay Component ============
interface ResultOverlayProps {
  winner: StoneColor | null;
  reason: 'five-in-a-row' | 'surrender' | 'draw';
  onNewGame: () => void;
}

const ResultOverlay: React.FC<ResultOverlayProps> = ({ winner, reason, onNewGame }) => {
  const { t } = useTranslation('gomoku');

  const getTitle = () => {
    if (!winner) return t('result.draw');
    return winner === 'black' ? t('result.blackWins') : t('result.whiteWins');
  };

  const getSubtitle = () => {
    switch (reason) {
      case 'five-in-a-row':
        return t('result.fiveInARow');
      case 'surrender':
        return t('result.opponentSurrender');
      case 'draw':
        return t('result.boardFull');
    }
  };

  return (
    <div className={styles.resultOverlay}>
      <div className={styles.resultCard}>
        <div
          className={[
            styles.resultIcon,
            winner === 'black' ? styles.blackWin : '',
            winner === 'white' ? styles.whiteWin : '',
            !winner ? styles.draw : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!winner && <Minus size={28} color="rgba(255,255,255,0.5)" />}
        </div>
        <div className={styles.resultTitle}>{getTitle()}</div>
        <div className={styles.resultSubtitle}>{getSubtitle()}</div>
        <div className={styles.resultActions}>
          <button
            className={`${styles.resultBtn} ${styles.resultBtnPrimary}`}
            onClick={() => onNewGame()}
          >
            {t('result.playAgain')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ Main Gomoku App ============
const GomokuApp: React.FC = () => {
  const { t } = useTranslation('gomoku');
  const { characterInfo } = useVibeInfo();
  const npcName = characterInfo?.name || 'Agent';
  const [isLoading, setIsLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState>({ ...DEFAULT_GAME_STATE });
  const [appState, setAppState] = useState<AppState>({ ...DEFAULT_APP_STATE });
  const [showResult, setShowResult] = useState(false);
  const [resultReason, setResultReason] = useState<'five-in-a-row' | 'surrender' | 'draw'>(
    'five-in-a-row',
  );
  const gameIdRef = useRef<string>(generateId());

  // ============ Data Loading ============
  const loadAppState = useCallback(async () => {
    // Check if state.json exists via listFiles before first access
    const rootFiles = await gomokuFileApi.listFiles('/');
    const stateExists = rootFiles.some((f) => f.name === 'state.json');
    if (stateExists) {
      try {
        const result = await gomokuFileApi.readFile(STATE_FILE);
        if (result.content) {
          const saved =
            typeof result.content === 'string'
              ? JSON.parse(result.content)
              : (result.content as Record<string, unknown>);
          setAppState((prev) => ({ ...prev, ...saved }));
        }
      } catch {
        // Read failed, ignore
      }
    } else {
      // state.json does not exist, initialize with default state and write
      setAppState({ ...DEFAULT_APP_STATE });
      await gomokuFileApi.writeFile(STATE_FILE, DEFAULT_APP_STATE).catch(() => {});
    }
  }, []);

  const saveAppState = useCallback(
    async (state: Partial<AppState>) => {
      try {
        const newState = { ...appState, ...state };
        setAppState(newState);
        await gomokuFileApi.writeFile(STATE_FILE, newState);
      } catch (error) {
        console.error('[Gomoku] Failed to save state:', error);
      }
    },
    [appState],
  );

  const saveGameRecord = useCallback(async (record: GameRecord) => {
    try {
      await gomokuFileApi.writeFile(`${HISTORY_DIR}/${record.id}.json`, record);
    } catch (error) {
      console.error('[Gomoku] Failed to save game record:', error);
    }
  }, []);

  const refreshHistory = useCallback(async (): Promise<GameRecord[]> => {
    try {
      const files = await gomokuFileApi.listFiles(HISTORY_DIR);
      const jsonFiles = (files || []).filter((f: { name: string }) => f.name.endsWith('.json'));

      const records: GameRecord[] = [];

      await batchConcurrent(
        jsonFiles,
        (file: { name: string; path?: string }) =>
          gomokuFileApi.readFile(file.path || `${HISTORY_DIR}/${file.name}`),
        {
          onBatch: (batchResults) => {
            batchResults.forEach((result) => {
              if (result.status === 'fulfilled' && result.value.content) {
                try {
                  const data =
                    typeof result.value.content === 'string'
                      ? JSON.parse(result.value.content)
                      : result.value.content;
                  records.push(data as GameRecord);
                } catch {
                  // Skip corrupted files
                }
              }
            });
          },
        },
      );

      return records;
    } catch {
      return [];
    }
  }, []);

  // ============ Game Actions ============
  const handleSelectColor = useCallback((color: StoneColor) => {
    const agentColor: StoneColor = color === 'black' ? 'white' : 'black';
    const newGameId = generateId();
    gameIdRef.current = newGameId;

    const players: [Player, Player] = [
      { name: 'You', color, role: 'human' },
      { name: npcName, color: agentColor, role: 'agent' },
    ];

    setGameState({
      phase: 'playing',
      board: createEmptyBoard(),
      currentTurn: 'black',
      moves: [],
      players,
      humanColor: color,
      agentColor,
      winLine: null,
      winner: null,
    });
    setShowResult(false);

    reportAction(APP_ID, 'NEW_GAME', { humanColor: color, agentColor });
  }, []);

  const handlePlaceStone = useCallback(
    (row: number, col: number, fromAgent = false) => {
      if (gameState.phase !== 'playing') return;
      if (gameState.board[row][col] !== null) return;

      const newBoard = gameState.board.map((r) => [...r]);
      newBoard[row][col] = gameState.currentTurn;

      const newMove: Move = {
        position: { row, col },
        color: gameState.currentTurn,
        moveNumber: gameState.moves.length + 1,
        timestamp: Date.now(),
      };

      const newMoves = [...gameState.moves, newMove];

      // Check win
      const winPositions = checkWin(newBoard, row, col, gameState.currentTurn);
      if (winPositions) {
        const winLine: WinLine = {
          positions: winPositions,
          color: gameState.currentTurn,
        };

        setGameState({
          ...gameState,
          phase: 'ended',
          board: newBoard,
          moves: newMoves,
          winLine,
          winner: gameState.currentTurn,
        });
        setResultReason('five-in-a-row');
        setTimeout(() => setShowResult(true), 800);

        const record: GameRecord = {
          id: gameIdRef.current,
          players: gameState.players!,
          moves: newMoves,
          result: {
            winner: gameState.currentTurn,
            winLine,
            reason: 'five-in-a-row',
          },
          startedAt: gameState.moves.length > 0 ? gameState.moves[0].timestamp : Date.now(),
          endedAt: Date.now(),
        };
        saveGameRecord(record);

        const statsKey = gameState.currentTurn === 'black' ? 'blackWins' : 'whiteWins';
        saveAppState({
          currentGameId: gameIdRef.current,
          totalGames: appState.totalGames + 1,
          stats: {
            ...appState.stats,
            [statsKey]: appState.stats[statsKey] + 1,
          },
        });

        if (!fromAgent) {
          reportAction(APP_ID, 'PLACE_STONE', {
            row: String(row),
            col: String(col),
            color: gameState.currentTurn,
            result: 'win',
          });
        }
        return;
      }

      // Check draw
      if (isBoardFull(newBoard)) {
        setGameState({
          ...gameState,
          phase: 'ended',
          board: newBoard,
          moves: newMoves,
          winLine: null,
          winner: null,
        });
        setResultReason('draw');
        setTimeout(() => setShowResult(true), 400);

        const record: GameRecord = {
          id: gameIdRef.current,
          players: gameState.players!,
          moves: newMoves,
          result: { winner: null, winLine: null, reason: 'draw' },
          startedAt: gameState.moves[0]?.timestamp ?? Date.now(),
          endedAt: Date.now(),
        };
        saveGameRecord(record);

        saveAppState({
          currentGameId: gameIdRef.current,
          totalGames: appState.totalGames + 1,
          stats: {
            ...appState.stats,
            draws: appState.stats.draws + 1,
          },
        });

        if (!fromAgent) {
          reportAction(APP_ID, 'PLACE_STONE', {
            row: String(row),
            col: String(col),
            color: gameState.currentTurn,
            result: 'draw',
          });
        }
        return;
      }

      // Normal move
      const nextTurn: StoneColor = gameState.currentTurn === 'black' ? 'white' : 'black';
      setGameState({
        ...gameState,
        board: newBoard,
        currentTurn: nextTurn,
        moves: newMoves,
      });

      if (!fromAgent) {
        reportAction(APP_ID, 'PLACE_STONE', {
          row: String(row),
          col: String(col),
          color: gameState.currentTurn,
          result: 'continue',
        });
      }
    },
    [gameState, appState, saveGameRecord, saveAppState],
  );

  const handleUndo = useCallback(
    (fromAgent = false) => {
      if (gameState.phase !== 'playing') return;
      if (gameState.moves.length === 0) return;

      const undoCount = gameState.moves.length >= 2 ? 2 : 1;
      const newMoves = gameState.moves.slice(0, -undoCount);
      const newBoard = createEmptyBoard();
      for (const move of newMoves) {
        newBoard[move.position.row][move.position.col] = move.color;
      }

      const lastUndone = gameState.moves[gameState.moves.length - undoCount];
      const restoredTurn = lastUndone.color;

      setGameState({
        ...gameState,
        board: newBoard,
        currentTurn: restoredTurn,
        moves: newMoves,
      });

      if (!fromAgent) {
        reportAction(APP_ID, 'UNDO_MOVE', {
          undoCount: String(undoCount),
          movesLeft: String(newMoves.length),
        });
      }
    },
    [gameState],
  );

  const handleSurrender = useCallback(
    (fromAgent = false) => {
      if (gameState.phase !== 'playing') return;

      const winner = gameState.agentColor!;

      setGameState({
        ...gameState,
        phase: 'ended',
        winner,
        winLine: null,
      });
      setResultReason('surrender');
      setShowResult(true);

      const record: GameRecord = {
        id: gameIdRef.current,
        players: gameState.players!,
        moves: gameState.moves,
        result: { winner, winLine: null, reason: 'surrender' },
        startedAt: gameState.moves[0]?.timestamp ?? Date.now(),
        endedAt: Date.now(),
      };
      saveGameRecord(record);

      const statsKey = winner === 'black' ? 'blackWins' : 'whiteWins';
      saveAppState({
        currentGameId: gameIdRef.current,
        totalGames: appState.totalGames + 1,
        stats: {
          ...appState.stats,
          [statsKey]: appState.stats[statsKey] + 1,
        },
      });

      if (!fromAgent) {
        reportAction(APP_ID, 'SURRENDER', { surrenderedBy: gameState.humanColor! });
      }
    },
    [gameState, appState, saveGameRecord, saveAppState],
  );

  const handleNewGame = useCallback((fromAgent = false) => {
    setGameState({ ...DEFAULT_GAME_STATE });
    setShowResult(false);
    if (!fromAgent) {
      reportAction(APP_ID, 'NEW_GAME', {});
    }
  }, []);

  // ============ Agent Action Handler ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case ActionTypes.PLACE_STONE: {
          const row = parseInt(action.params?.row || '-1', 10);
          const col = parseInt(action.params?.col || '-1', 10);
          if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            return 'error: invalid position';
          }
          if (gameState.phase !== 'playing') {
            // Retry: refresh state and check again
            await loadAppState();
            if (gameState.phase !== 'playing') {
              return 'error: game not in playing phase';
            }
          }
          if (gameState.currentTurn !== gameState.agentColor) {
            return `error: not agent turn, current turn is ${gameState.currentTurn}, agent color is ${gameState.agentColor}`;
          }
          if (gameState.board[row][col] !== null) {
            return 'error: position already occupied';
          }
          handlePlaceStone(row, col, true);
          return 'success';
        }

        case ActionTypes.UNDO_MOVE: {
          if (gameState.moves.length === 0) return 'error: no moves to undo';
          handleUndo(true);
          return 'success';
        }

        case ActionTypes.NEW_GAME: {
          handleNewGame(true);
          return 'success';
        }

        case ActionTypes.SURRENDER: {
          const color = action.params?.color as StoneColor;
          if (!color) return 'error: missing color param';
          handleSurrender(true);
          return 'success';
        }

        // Mutation Actions
        case ActionTypes.CREATE_GAME:
        case ActionTypes.UPDATE_GAME:
        case ActionTypes.DELETE_GAME: {
          await refreshHistory();
          return 'success';
        }

        // Refresh Actions
        case ActionTypes.REFRESH_HISTORY: {
          await refreshHistory();
          return 'success';
        }

        // System Actions
        case ActionTypes.SYNC_STATE: {
          try {
            await loadAppState();
            return 'success';
          } catch (error) {
            return `error: ${String(error)}`;
          }
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [
      gameState,
      handlePlaceStone,
      handleUndo,
      handleNewGame,
      handleSurrender,
      refreshHistory,
      loadAppState,
    ],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // ============ Initialization ============
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Gomoku',
          windowStyle: { width: 700, height: 780 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Gomoku',
          windowStyle: { width: 700, height: 780 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        await fetchVibeInfo();
        await loadAppState();

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Gomoku] Init error:', error);
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Derived Values ============
  const lastMove =
    gameState.moves.length > 0 ? gameState.moves[gameState.moves.length - 1].position : null;

  const isHumanTurn =
    gameState.phase === 'playing' && gameState.currentTurn === gameState.humanColor;

  const getPlayerLabel = (color: StoneColor) => {
    if (color === gameState.humanColor) return 'You';
    return npcName;
  };

  // ============ Render ============
  if (isLoading) {
    return (
      <div className={styles.gomokuApp}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (gameState.phase === 'selecting') {
    return (
      <div className={styles.gomokuApp}>
        <StartScreen onSelectColor={handleSelectColor} />
      </div>
    );
  }

  return (
    <div className={styles.gomokuApp}>
      <div className={styles.gameLayout}>
        {/* Status Bar */}
        <div className={styles.statusBar}>
          <div
            className={[
              styles.playerIndicator,
              gameState.currentTurn === 'black' && gameState.phase === 'playing'
                ? styles.active
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={`${styles.indicatorStone} ${styles.black}`} />
            <span>
              {t('game.blackLabel')} ({getPlayerLabel('black')})
            </span>
          </div>

          <div className={styles.turnLabel}>
            {gameState.phase === 'playing'
              ? isHumanTurn
                ? t('game.yourTurn')
                : t('game.agentThinking', { name: npcName })
              : t('game.gameOver')}
          </div>

          <div
            className={[
              styles.playerIndicator,
              gameState.currentTurn === 'white' && gameState.phase === 'playing'
                ? styles.active
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>
              {t('game.whiteLabel')} ({getPlayerLabel('white')})
            </span>
            <div className={`${styles.indicatorStone} ${styles.white}`} />
          </div>
        </div>

        {/* Board */}
        <GameBoard
          board={gameState.board}
          currentTurn={gameState.currentTurn}
          humanColor={gameState.humanColor}
          lastMove={lastMove}
          winLine={gameState.winLine}
          phase={gameState.phase}
          onPlaceStone={handlePlaceStone}
        />

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={styles.controlBtn}
            onClick={() => handleUndo()}
            disabled={!isHumanTurn || gameState.moves.length < 2}
          >
            <Undo2 size={14} />
            {t('controls.undo')}
          </button>
          <button
            className={`${styles.controlBtn} ${styles.controlBtnDanger}`}
            onClick={() => handleSurrender()}
            disabled={gameState.phase !== 'playing' || gameState.moves.length < 2}
          >
            <Flag size={14} />
            {t('controls.surrender')}
          </button>
          <button className={styles.controlBtn} onClick={() => handleNewGame()}>
            <RotateCcw size={14} />
            {t('controls.newGame')}
          </button>
        </div>
      </div>

      {/* Result Overlay */}
      {showResult && gameState.phase === 'ended' && (
        <ResultOverlay winner={gameState.winner} reason={resultReason} onNewGame={handleNewGame} />
      )}
    </div>
  );
};

export default GomokuApp;
