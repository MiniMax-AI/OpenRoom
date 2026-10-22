import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useFileSystem,
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  createAppFileApi,
  fetchVibeInfo,
  useVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import styles from './index.module.scss';
import {
  newGame,
  executeMove,
  legalMovesFor,
  findKing,
  isValidState,
  toNotation,
  posEq,
  type Piece,
  type PieceType,
  type Pos,
  type GameState,
} from './engine';

const ChessBoard3D = lazy(() => import('./components/ChessBoard3D'));

// ============ Constants ============
const APP_ID = 12;
const APP_NAME = 'chess';
const STATE_FILE = '/state.json';

const chessFileApi = createAppFileApi(APP_NAME);

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
