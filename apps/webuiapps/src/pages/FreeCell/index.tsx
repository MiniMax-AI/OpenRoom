import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 10;
const APP_NAME = 'freecell';
const STATE_FILE = '/state.json';

const freecellFileApi = createAppFileApi(APP_NAME);

// ============ Types ============
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

interface Card {
  suit: Suit;
  rank: number; // 1=A … 13=K
}

interface GameState {
  columns: Card[][];
  freeCells: (Card | null)[];
  foundations: Record<Suit, Card[]>;
  moveCount: number;
  gameStatus: 'playing' | 'won';
  gameId: string;
}

interface SelectedSource {
  zone: 'column' | 'freecell';
  colIdx?: number;
  cardIdx?: number;
  cellIdx?: number;
  cards: Card[];
}

// ============ Card Utilities ============
const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '\u2660',
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
};

const RANK_LABELS: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

const isRed = (s: Suit): boolean => s === 'hearts' || s === 'diamonds';
const cid = (c: Card): string => `${c.suit[0]}${c.rank}`;

// ============ Game Engine (Pure Functions) ============

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(arr: Card[]): Card[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(deck: Card[]): Card[][] {
  const cols: Card[][] = Array.from({ length: 8 }, () => []);
  deck.forEach((c, i) => cols[i % 8].push(c));
  return cols;
}

function newGame(): GameState {
  return {
    columns: deal(shuffle(createDeck())),
    freeCells: [null, null, null, null],
    foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    moveCount: 0,
    gameStatus: 'playing',
    gameId: generateId(),
  };
}

function foundTop(st: GameState, suit: Suit): number {
  const p = st.foundations[suit];
  return p.length > 0 ? p[p.length - 1].rank : 0;
}

function canFoundation(card: Card, st: GameState): boolean {
  return card.rank === foundTop(st, card.suit) + 1;
}

function canColumn(card: Card, col: Card[]): boolean {
  if (col.length === 0) return true;
  const top = col[col.length - 1];
  return card.rank === top.rank - 1 && isRed(card.suit) !== isRed(top.suit);
}

function isDescSeq(cards: Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (
      cards[i].rank !== cards[i - 1].rank - 1 ||
      isRed(cards[i].suit) === isRed(cards[i - 1].suit)
    ) {
      return false;
    }
  }
  return true;
}

function maxMovable(st: GameState, destColIdx?: number): number {
  const fc = st.freeCells.filter((c) => c === null).length;
  let ec = 0;
  st.columns.forEach((col, i) => {
    if (i !== destColIdx && col.length === 0) ec++;
  });
  return (1 + fc) * (1 << ec);
}

function isSafeAuto(card: Card, st: GameState): boolean {
  if (card.rank <= 2) return true;
  const opp: Suit[] = isRed(card.suit) ? ['spades', 'clubs'] : ['hearts', 'diamonds'];
  return opp.every((s) => foundTop(st, s) >= card.rank - 1);
}

function autoFound(st: GameState): GameState {
  let cur = st;
  let moved = true;
  while (moved) {
    moved = false;
    for (let i = 0; i < 8; i++) {
      const col = cur.columns[i];
      if (col.length === 0) continue;
      const card = col[col.length - 1];
      if (canFoundation(card, cur) && isSafeAuto(card, cur)) {
        cur = {
          ...cur,
          columns: cur.columns.map((c, j) => (j === i ? c.slice(0, -1) : c)),
          foundations: {
            ...cur.foundations,
            [card.suit]: [...cur.foundations[card.suit], card],
          },
        };
        moved = true;
      }
    }
    for (let i = 0; i < 4; i++) {
      const card = cur.freeCells[i];
      if (!card) continue;
      if (canFoundation(card, cur) && isSafeAuto(card, cur)) {
        const fc = [...cur.freeCells];
        fc[i] = null;
        cur = {
          ...cur,
          freeCells: fc,
          foundations: {
            ...cur.foundations,
            [card.suit]: [...cur.foundations[card.suit], card],
          },
        };
        moved = true;
      }
    }
  }
  return cur;
}

function checkWin(st: GameState): boolean {
  return SUITS.every((s) => st.foundations[s].length === 13);
}

function execMove(
  st: GameState,
  src: SelectedSource,
  dest:
    | { zone: 'column'; colIdx: number }
    | { zone: 'freecell'; cellIdx: number }
    | { zone: 'foundation' },
): GameState | null {
  const cards = src.cards;
  if (cards.length === 0) return null;
  const top = cards[0];

  // Validate destination
  if (dest.zone === 'column') {
    if (src.zone === 'column' && src.colIdx === dest.colIdx) return null;
    if (!canColumn(top, st.columns[dest.colIdx])) return null;
    if (cards.length > maxMovable(st, dest.colIdx)) return null;
  } else if (dest.zone === 'freecell') {
    if (cards.length !== 1) return null;
    if (st.freeCells[dest.cellIdx] !== null) return null;
  } else {
    if (cards.length !== 1) return null;
    if (!canFoundation(top, st)) return null;
  }

  // Clone mutable parts
  const cols = st.columns.map((c) => [...c]);
  const fc = [...st.freeCells] as (Card | null)[];
  const fnd: Record<Suit, Card[]> = {
    hearts: [...st.foundations.hearts],
    diamonds: [...st.foundations.diamonds],
    clubs: [...st.foundations.clubs],
    spades: [...st.foundations.spades],
  };

  // Remove from source
  if (src.zone === 'column' && src.colIdx !== undefined && src.cardIdx !== undefined) {
    cols[src.colIdx] = cols[src.colIdx].slice(0, src.cardIdx);
  } else if (src.zone === 'freecell' && src.cellIdx !== undefined) {
    fc[src.cellIdx] = null;
  }

  // Place at destination
  if (dest.zone === 'column') {
    cols[dest.colIdx] = [...cols[dest.colIdx], ...cards];
  } else if (dest.zone === 'freecell') {
    fc[dest.cellIdx] = top;
  } else {
    fnd[top.suit] = [...fnd[top.suit], top];
  }

  let next: GameState = {
    ...st,
    columns: cols,
    freeCells: fc,
    foundations: fnd,
    moveCount: st.moveCount + 1,
  };

  next = autoFound(next);
  if (checkWin(next)) next = { ...next, gameStatus: 'won' };
  return next;
}

function isValidState(d: unknown): d is GameState {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return (
    Array.isArray(o.columns) &&
    o.columns.length === 8 &&
    Array.isArray(o.freeCells) &&
    o.freeCells.length === 4 &&
    !!o.foundations &&
    typeof o.moveCount === 'number' &&
    typeof o.gameStatus === 'string'
  );
}

// ============ Component ============
const FreeCell: React.FC = () => {
  const { t } = useTranslation('freecell');
  const [game, setGame] = useState<GameState | null>(null);
  const [sel, setSel] = useState<SelectedSource | null>(null);
  const [loading, setLoading] = useState(true);

  const { initFromCloud, getByPath, syncToCloud, saveFile } = useFileSystem({
    fileApi: freecellFileApi,
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
        console.warn('[FreeCell] syncToCloud error:', e);
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
        setSel(null);
      }
    } catch (e) {
      console.warn('[FreeCell] refreshCloud error:', e);
    }
  }, [initFromCloud, loadFromFS]);

  // Agent action handler
  const handleAgent = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      if (action.action_type === 'SYNC_STATE' || action.action_type === 'NEW_GAME') {
        await refreshCloud();
        return 'success';
      }
      return `error: unknown action_type ${action.action_type}`;
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
          name: 'FreeCell',
          windowStyle: { width: 900, height: 650 },
        });

        mgr.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'game',
          name: 'FreeCell',
          windowStyle: { width: 900, height: 650 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Fetch user / character / system settings (language auto-syncs to i18n)
        try {
          await fetchVibeInfo();
        } catch {
          /* non-critical path */
        }

        try {
          await initFromCloud();
        } catch {
          /* may have no data on first run */
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
          console.error('[FreeCell] init error:', e);
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

  // Execute move
  const applyMove = useCallback(
    (
      dest:
        | { zone: 'column'; colIdx: number }
        | { zone: 'freecell'; cellIdx: number }
        | { zone: 'foundation' },
    ) => {
      if (!sel || !game || game.gameStatus === 'won') return false;
      const next = execMove(game, sel, dest);
      if (!next) return false;
      setGame(next);
      setSel(null);
      persist(next);
      reportAction(APP_ID, 'MOVE_CARD', {
        gameId: next.gameId,
        moveCount: String(next.moveCount),
      });
      return true;
    },
    [game, sel, persist],
  );

  // Column card click
  const onColCard = useCallback(
    (ci: number, ri: number) => {
      if (!game || game.gameStatus === 'won') return;
      const col = game.columns[ci];

      if (sel) {
        // Same column, same card -> deselect
        if (sel.zone === 'column' && sel.colIdx === ci && sel.cardIdx === ri) {
          setSel(null);
          return;
        }
        // Same column, different card -> reselect
        if (sel.zone === 'column' && sel.colIdx === ci) {
          const seq = col.slice(ri);
          if (isDescSeq(seq)) {
            setSel({ zone: 'column', colIdx: ci, cardIdx: ri, cards: seq });
          }
          return;
        }
        // Different column -> attempt placement
        applyMove({ zone: 'column', colIdx: ci });
        return;
      }

      // Nothing selected -> select
      const seq = col.slice(ri);
      if (isDescSeq(seq)) {
        setSel({ zone: 'column', colIdx: ci, cardIdx: ri, cards: seq });
      }
    },
    [game, sel, applyMove],
  );

  // Empty column click
  const onEmptyCol = useCallback(
    (ci: number) => {
      if (sel) applyMove({ zone: 'column', colIdx: ci });
    },
    [sel, applyMove],
  );

  // Free cell click
  const onFC = useCallback(
    (i: number) => {
      if (!game || game.gameStatus === 'won') return;
      const card = game.freeCells[i];

      if (sel) {
        if (sel.zone === 'freecell' && sel.cellIdx === i) {
          setSel(null);
          return;
        }
        if (card) {
          setSel({ zone: 'freecell', cellIdx: i, cards: [card] });
          return;
        }
        applyMove({ zone: 'freecell', cellIdx: i });
        return;
      }

      if (card) setSel({ zone: 'freecell', cellIdx: i, cards: [card] });
    },
    [game, sel, applyMove],
  );

  // Foundation click
  const onFnd = useCallback(() => {
    if (sel) applyMove({ zone: 'foundation' });
  }, [sel, applyMove]);

  // New game
  const onNewGame = useCallback(async () => {
    const st = newGame();
    setGame(st);
    setSel(null);
    await persist(st);
    reportAction(APP_ID, 'NEW_GAME', { gameId: st.gameId });
  }, [persist]);

  // Background click to deselect
  const onBg = useCallback(() => setSel(null), []);

  // Valid target highlighting
  const targets = useMemo(() => {
    const t = {
      cols: new Set<number>(),
      fcs: new Set<number>(),
      fnd: null as Suit | null,
    };
    if (!sel || !game || game.gameStatus === 'won') return t;
    const top = sel.cards[0];

    for (let i = 0; i < 8; i++) {
      if (sel.zone === 'column' && sel.colIdx === i) continue;
      if (canColumn(top, game.columns[i]) && sel.cards.length <= maxMovable(game, i)) {
        t.cols.add(i);
      }
    }

    if (sel.cards.length === 1) {
      for (let i = 0; i < 4; i++) {
        if (game.freeCells[i] === null && !(sel.zone === 'freecell' && sel.cellIdx === i)) {
          t.fcs.add(i);
        }
      }
      if (canFoundation(top, game)) t.fnd = top.suit;
    }
    return t;
  }, [game, sel]);

  // Check if a card is selected
  const isSel = useCallback(
    (zone: 'column' | 'freecell', ci?: number, ri?: number, fi?: number): boolean => {
      if (!sel) return false;
      if (zone === 'freecell') return sel.zone === 'freecell' && sel.cellIdx === fi;
      return (
        sel.zone === 'column' &&
        sel.colIdx === ci &&
        sel.cardIdx !== undefined &&
        ri !== undefined &&
        ri >= sel.cardIdx
      );
    },
    [sel],
  );

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
          <span className={styles.errorText}>{t('loadFailed')}</span>
        </div>
      </div>
    );
  }

  const renderCard = (card: Card, selected: boolean) => (
    <div
      className={`${styles.card} ${isRed(card.suit) ? styles.cardRed : styles.cardBlack} ${selected ? styles.cardSelected : ''}`}
    >
      <div className={styles.cardCornerTL}>
        <span className={styles.cardRank}>{RANK_LABELS[card.rank]}</span>
        <span className={styles.cardSuit}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      <div className={styles.cardCenter}>
        <span className={styles.cardCenterSuit}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      <div className={styles.cardCornerBR}>
        <span className={styles.cardRank}>{RANK_LABELS[card.rank]}</span>
        <span className={styles.cardSuit}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  return (
    <div className={styles.container} onClick={onBg}>
      {/* Top bar */}
      <div className={styles.topBar} onClick={(e) => e.stopPropagation()}>
        {/* Free cells */}
        <div className={styles.cellGroup}>
          {game.freeCells.map((card, i) => (
            <div
              key={`fc-${i}`}
              className={`${styles.cellSlot} ${targets.fcs.has(i) ? styles.cellTarget : ''}`}
              onClick={() => onFC(i)}
            >
              {card ? (
                renderCard(card, isSel('freecell', undefined, undefined, i))
              ) : (
                <div className={styles.emptySlot} />
              )}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <span className={styles.moveCount}>{t('moveCount', { count: game.moveCount })}</span>
          <button type="button" className={styles.newGameBtn} onClick={onNewGame}>
            {t('newGame')}
          </button>
        </div>

        {/* Foundations */}
        <div className={styles.cellGroup}>
          {SUITS.map((suit) => {
            const pile = game.foundations[suit];
            const topCard = pile.length > 0 ? pile[pile.length - 1] : null;
            const isTarget = targets.fnd === suit;
            return (
              <div
                key={`fnd-${suit}`}
                className={`${styles.cellSlot} ${isTarget ? styles.cellTarget : ''}`}
                onClick={onFnd}
              >
                {topCard ? (
                  renderCard(topCard, false)
                ) : (
                  <div className={styles.emptySlot}>
                    <span
                      className={`${styles.foundSuit} ${isRed(suit) ? styles.fndRed : styles.fndBlack}`}
                    >
                      {SUIT_SYMBOLS[suit]}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tableau */}
      <div className={styles.tableau} onClick={(e) => e.stopPropagation()}>
        {game.columns.map((col, ci) => (
          <div
            key={`col-${ci}`}
            className={`${styles.column} ${col.length === 0 && targets.cols.has(ci) ? styles.colTarget : ''}`}
            onClick={() => col.length === 0 && onEmptyCol(ci)}
          >
            {col.length === 0 ? (
              <div className={styles.emptyCol} />
            ) : (
              col.map((card, ri) => (
                <div
                  key={cid(card)}
                  className={styles.cardWrap}
                  style={{ zIndex: ri }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onColCard(ci, ri);
                  }}
                >
                  {renderCard(card, isSel('column', ci, ri))}
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {/* Win overlay */}
      {game.gameStatus === 'won' && (
        <div className={styles.winOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.winBox}>
            <h2 className={styles.winTitle}>{t('win.title')}</h2>
            <p className={styles.winMoves}>{t('win.moves', { count: game.moveCount })}</p>
            <button type="button" className={styles.winBtn} onClick={onNewGame}>
              {t('win.playAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreeCell;
