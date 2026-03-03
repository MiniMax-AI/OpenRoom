import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  fetchVibeInfo,
  createAppFileApi,
  batchConcurrent,
  type CharacterAppAction,
  ActionTriggerBy,
} from '@/lib';
import './i18n';
import { Newspaper, ArrowLeft, AlertTriangle } from 'lucide-react';
import type { Article, Case, Clue, ArticleCategory, AppState } from './types';
import {
  APP_ID,
  APP_NAME,
  ARTICLES_DIR,
  CASES_DIR,
  STATE_FILE,
  ActionTypes,
  DEFAULT_APP_STATE,
} from './actions/constants';
import { SEED_ARTICLES, SEED_CASES } from './mock/seedData';
import styles from './index.module.scss';

import headlinePlaceholder from './assets/headline-placeholder.jpg';

const getArticleImage = (article: Article): string => article.imageUrl || headlinePlaceholder;

const cyberFileApi = createAppFileApi(APP_NAME);

// ============ NavBar ============
interface NavBarProps {
  activeTab: 'news' | 'case-board';
  onTabChange: (tab: 'news' | 'case-board') => void;
}

const NavBar: React.FC<NavBarProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation('cyberNews');
  return (
    <nav className={styles.navBar}>
      <div className={styles.navTitle}>
        <Newspaper size={18} />
        NIGHT CITY NEWS
      </div>
      <button
        className={`${styles.navTab} ${activeTab === 'news' ? styles.active : ''}`}
        onClick={() => onTabChange('news')}
      >
        {t('nav.news')}
      </button>
      <button
        className={`${styles.navTab} ${activeTab === 'case-board' ? styles.active : ''}`}
        onClick={() => onTabChange('case-board')}
      >
        {t('nav.caseBoard')}
      </button>
    </nav>
  );
};

// ============ Category Filter ============
interface CategoryFilterProps {
  active: ArticleCategory | null;
  onSelect: (cat: ArticleCategory | null) => void;
}

const CATEGORIES: (ArticleCategory | null)[] = [null, 'breaking', 'corporate', 'street', 'tech'];

const CategoryFilter: React.FC<CategoryFilterProps> = ({ active, onSelect }) => {
  const { t } = useTranslation('cyberNews');
  const labels: Record<string, string> = {
    all: t('news.all'),
    breaking: t('news.breaking'),
    corporate: t('news.corporate'),
    street: t('news.street'),
    tech: t('news.tech'),
  };
  return (
    <div className={styles.categoryFilter}>
      {CATEGORIES.map((cat) => (
        <button
          key={cat || 'all'}
          className={`${styles.categoryBtn} ${active === cat ? styles.active : ''}`}
          onClick={() => onSelect(cat)}
        >
          {labels[cat || 'all']}
        </button>
      ))}
    </div>
  );
};

// ============ Headline Card ============
interface HeadlineCardProps {
  article: Article;
  onClick: () => void;
}

const HeadlineCard: React.FC<HeadlineCardProps> = ({ article, onClick }) => {
  return (
    <div className={styles.headlineCard} onClick={onClick}>
      <div className={styles.headlineImageWrap}>
        <img src={getArticleImage(article)} alt={article.title} className={styles.headlineImage} />
        <div className={styles.headlineAccentBar} />
      </div>
      <div className={styles.headlineContent}>
        <div className={styles.headlineMeta}>
          <span className={`${styles.headlineBadge} ${styles[article.category]}`}>
            {article.category}
          </span>
          <span className={styles.headlineDate}>{formatDate(article.publishedAt)}</span>
        </div>
        <h2 className={styles.headlineTitle}>{article.title}</h2>
        <p className={styles.headlineSummary}>{article.summary}</p>
      </div>
    </div>
  );
};

// ============ News List Card ============
interface NewsListCardProps {
  article: Article;
  onClick: () => void;
}

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const NewsListCard: React.FC<NewsListCardProps> = ({ article, onClick }) => {
  const { t } = useTranslation('cyberNews');
  return (
    <div
      className={`${styles.newsListCard} ${styles[`card_${article.category}`]}`}
      onClick={onClick}
    >
      <div className={styles.newsListAccent} />
      <div className={styles.newsListThumb}>
        <img
          src={getArticleImage(article)}
          alt={article.title}
          className={styles.newsListThumbImg}
        />
      </div>
      <div className={styles.newsListInfo}>
        <div className={styles.newsListMeta}>
          <span className={`${styles.newsListBadge} ${styles[article.category]}`}>
            {t(`news.${article.category}`)}
          </span>
        </div>
        <div className={styles.newsListTitleWrap}>
          <div className={styles.newsListTitle} title={article.title}>
            {article.title}
          </div>
        </div>
        <div className={styles.newsListSummary}>{article.summary}</div>
      </div>
      <div className={styles.newsListEdge} />
    </div>
  );
};

// ============ News Ticker ============
interface NewsTickerProps {
  articles: Article[];
}

const NewsTicker: React.FC<NewsTickerProps> = ({ articles }) => {
  const { t } = useTranslation('cyberNews');
  const headlines = articles.map((a) => a.title);
  // Duplicate for seamless loop
  const tickerText = [...headlines, ...headlines];

  return (
    <div className={styles.ticker}>
      <div className={styles.tickerLabel}>
        <AlertTriangle size={12} style={{ marginRight: 6 }} />
        {t('news.tickerPrefix')}
      </div>
      <div className={styles.tickerTrack}>
        <div className={styles.tickerContent}>
          {tickerText.map((headline, i) => (
            <React.Fragment key={i}>
              <span>{headline}</span>
              <span className={styles.tickerSeparator}>///</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============ Article Detail ============
interface ArticleDetailProps {
  article: Article;
  onBack: () => void;
}

const ArticleDetail: React.FC<ArticleDetailProps> = ({ article, onBack }) => {
  const { t } = useTranslation('cyberNews');
  return (
    <div className={styles.articleDetail}>
      <button className={styles.articleBack} onClick={onBack}>
        <ArrowLeft size={16} />
        {t('news.backToFeed')}
      </button>
      <div className={styles.articleContainer}>
        <div className={styles.articleImageWrap}>
          <img src={getArticleImage(article)} alt={article.title} className={styles.articleImage} />
        </div>
        <div className={styles.articleMeta}>
          <span className={`${styles.headlineBadge} ${styles[article.category]}`}>
            {article.category}
          </span>
          <span className={styles.newsListDate}>{formatDate(article.publishedAt)}</span>
        </div>
        <h1 className={styles.articleTitle}>{article.title}</h1>
        <p className={styles.articleSummary}>{article.summary}</p>
        <div className={styles.articleContent}>
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// ============ Case Sidebar ============
interface CaseSidebarProps {
  cases: Case[];
  selectedId: string | null;
  onSelect: (caseId: string) => void;
}

const CaseSidebar: React.FC<CaseSidebarProps> = ({ cases, selectedId, onSelect }) => {
  const { t } = useTranslation('cyberNews');
  return (
    <aside className={styles.caseSidebar}>
      <div className={styles.caseSidebarHeader}>{t('caseBoard.cases')}</div>
      <div className={styles.caseList}>
        {cases.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{t('caseBoard.emptyState')}</p>
          </div>
        ) : (
          cases.map((c) => (
            <button
              key={c.id}
              className={`${styles.caseItem} ${selectedId === c.id ? styles.active : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <span className={styles.caseNumber}>{c.caseNumber}</span>
              <span className={styles.caseTitle}>{c.title}</span>
              <span className={`${styles.caseStatus} ${styles[c.status]}`}>
                {t(`caseBoard.${c.status}`)}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
};

// ============ Clue Card (Draggable) ============
interface ClueCardProps {
  clue: Clue;
  onDragEnd: (clueId: string, posX: number, posY: number) => void;
}

const ClueCardComponent: React.FC<ClueCardProps> = ({ clue, onDragEnd }) => {
  const { t } = useTranslation('cyberNews');
  const cardRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: clue.posX,
        origY: clue.posY,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragState.current || !cardRef.current) return;
        const dx = ev.clientX - dragState.current.startX;
        const dy = ev.clientY - dragState.current.startY;
        cardRef.current.style.left = `${dragState.current.origX + dx}px`;
        cardRef.current.style.top = `${dragState.current.origY + dy}px`;
      };

      const handleMouseUp = (ev: MouseEvent) => {
        if (dragState.current) {
          const dx = ev.clientX - dragState.current.startX;
          const dy = ev.clientY - dragState.current.startY;
          const newX = Math.max(0, dragState.current.origX + dx);
          const newY = Math.max(0, dragState.current.origY + dy);
          onDragEnd(clue.id, newX, newY);
          dragState.current = null;
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clue.id, clue.posX, clue.posY, onDragEnd],
  );

  return (
    <div
      ref={cardRef}
      className={styles.clueCard}
      style={{ left: clue.posX, top: clue.posY }}
      onMouseDown={handleMouseDown}
    >
      <div className={`${styles.cluePin} ${styles[clue.type]}`} />
      <div className={styles.clueBody}>
        <div className={`${styles.clueType} ${styles[clue.type]}`}>
          {t(`caseBoard.clueTypes.${clue.type}`)}
        </div>
        <div className={styles.clueTitle}>{clue.title}</div>
        <div className={styles.clueContent}>{clue.content}</div>
      </div>
    </div>
  );
};

// ============ Board Canvas ============
interface BoardCanvasProps {
  selectedCase: Case | null;
  onMoveClue: (caseId: string, clueId: string, posX: number, posY: number) => void;
}

const CLUE_CARD_WIDTH = 260;
const CLUE_CARD_HEIGHT = 160;
const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 800;

const ConnectionLines: React.FC<{ clues: Clue[] }> = ({ clues }) => {
  const clueMap = new Map(clues.map((c) => [c.id, c]));
  const rendered = new Set<string>();

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // 1) Draw connection lines using clue connections
  for (const clue of clues) {
    if (!clue.connections) continue;
    for (const targetId of clue.connections) {
      const key = [clue.id, targetId].sort().join('-');
      if (rendered.has(key)) continue;
      rendered.add(key);
      const target = clueMap.get(targetId);
      if (!target) continue;
      lines.push({
        x1: clue.posX + CLUE_CARD_WIDTH / 2,
        y1: clue.posY + CLUE_CARD_HEIGHT / 2,
        x2: target.posX + CLUE_CARD_WIDTH / 2,
        y2: target.posY + CLUE_CARD_HEIGHT / 2,
      });
    }
  }

  // 2) If no connections exist (e.g. legacy data), connect adjacent clues sequentially to ensure lines are visible
  if (lines.length === 0 && clues.length >= 2) {
    for (let i = 0; i < clues.length - 1; i++) {
      const a = clues[i];
      const b = clues[i + 1];
      lines.push({
        x1: a.posX + CLUE_CARD_WIDTH / 2,
        y1: a.posY + CLUE_CARD_HEIGHT / 2,
        x2: b.posX + CLUE_CARD_WIDTH / 2,
        y2: b.posY + CLUE_CARD_HEIGHT / 2,
      });
    }
  }

  if (lines.length === 0) return null;

  // Slightly curved path (like a naturally drooping string/wire), control point offset perpendicular to the line
  const toCurvedPath = (x1: number, y1: number, x2: number, y2: number) => {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const k = 0.12;
    const cpx = midX - dy * k;
    const cpy = midY + dx * k;
    return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
  };

  return (
    <svg
      className={styles.connectionsSvg}
      viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
      preserveAspectRatio="none"
    >
      {lines.map((line, i) => {
        const d = toCurvedPath(line.x1, line.y1, line.x2, line.y2);
        return (
          <g key={i}>
            {/* Realistic shadow: line shadow cast on the corkboard */}
            <path
              d={d}
              fill="none"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="translate(2, 2)"
            />
            {/* Red line: solid dark red, no glow */}
            <path
              d={d}
              fill="none"
              stroke="#8B2635"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
};

const BoardCanvas: React.FC<BoardCanvasProps> = ({ selectedCase, onMoveClue }) => {
  const { t } = useTranslation('cyberNews');

  if (!selectedCase) {
    return (
      <div className={styles.boardCanvas}>
        <div className={styles.boardEmpty}>{t('caseBoard.emptyBoard')}</div>
      </div>
    );
  }

  const handleClueDragEnd = (clueId: string, posX: number, posY: number) => {
    onMoveClue(selectedCase.id, clueId, posX, posY);
  };

  return (
    <div className={styles.boardCanvas}>
      <div className={styles.boardInner}>
        {selectedCase.clues.length === 0 ? (
          <div className={styles.boardEmpty}>{t('caseBoard.noClues')}</div>
        ) : (
          <>
            <ConnectionLines clues={selectedCase.clues} />
            {selectedCase.clues.map((clue) => (
              <ClueCardComponent key={clue.id} clue={clue} onDragEnd={handleClueDragEnd} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// ============ Main Component ============
const CyberNews: React.FC = () => {
  const { t } = useTranslation('cyberNews');
  const [articles, setArticles] = useState<Article[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [currentView, setCurrentView] = useState<'news' | 'case-board'>('news');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [newsFilter, setNewsFilter] = useState<ArticleCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ============ Image Path Resolution ============
  const resolveArticleImages = useCallback(async (articleList: Article[]) => {
    const refs = articleList.filter(
      (a) => a.imageUrl && a.imageUrl.startsWith('/') && a.imageUrl.endsWith('.json'),
    );
    if (refs.length === 0) return;
    await batchConcurrent(refs, (a) => cyberFileApi.readFile(a.imageUrl), {
      onBatch: (batchResults, startIndex) => {
        batchResults.forEach((result, idx) => {
          const article = refs[startIndex + idx];
          if (result.status === 'fulfilled' && result.value.content) {
            try {
              const imgData =
                typeof result.value.content === 'string'
                  ? JSON.parse(result.value.content)
                  : result.value.content;
              if (imgData.src) {
                article.imageUrl = imgData.src;
                return;
              }
            } catch {
              /* fall through */
            }
          }
          article.imageUrl = '';
        });
      },
    });
  }, []);

  // ============ Repo refresh methods ============
  const refreshArticles = useCallback(async (): Promise<Article[]> => {
    try {
      const articleFiles = await cyberFileApi.listFiles(ARTICLES_DIR);
      const jsonFiles = articleFiles.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
      console.info(
        '[CyberNews] refreshArticles: found',
        jsonFiles.length,
        'files:',
        jsonFiles.map((f) => f.name),
      );
      const loaded: Article[] = [];

      await batchConcurrent(jsonFiles, (file) => cyberFileApi.readFile(file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            const fileIndex = startIndex + i;
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const parsed =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                loaded.push(parsed as Article);
              } catch (e) {
                console.warn(
                  '[CyberNews] Failed to parse article:',
                  jsonFiles[fileIndex].path,
                  '\n  content type:',
                  typeof result.value.content,
                  '\n  content preview:',
                  typeof result.value.content === 'string'
                    ? result.value.content.slice(0, 200)
                    : result.value.content,
                  '\n  error:',
                  e,
                );
              }
            }
          });
        },
      });

      console.info(
        '[CyberNews] refreshArticles: parsed',
        loaded.length,
        '/',
        jsonFiles.length,
        'articles:',
        loaded.map((a) => a.id),
      );
      await resolveArticleImages(loaded);
      setArticles([...loaded]);
      return loaded;
    } catch (error) {
      console.error('[CyberNews] Failed to refresh articles:', error);
      return articles;
    }
  }, [articles]);

  const refreshCases = useCallback(async (): Promise<Case[]> => {
    try {
      const caseFiles = await cyberFileApi.listFiles(CASES_DIR);
      const jsonFiles = caseFiles.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
      const loaded: Case[] = [];

      await batchConcurrent(jsonFiles, (file) => cyberFileApi.readFile(file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            const fileIndex = startIndex + i;
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const parsed =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                loaded.push(parsed as Case);
              } catch {
                console.warn('[CyberNews] Failed to parse case:', jsonFiles[fileIndex].path);
              }
            }
          });
        },
      });

      setCases([...loaded]);
      return loaded;
    } catch (error) {
      console.error('[CyberNews] Failed to refresh cases:', error);
      return cases;
    }
  }, [cases]);

  // ============ Load Data (init) ============
  const loadData = useCallback(async () => {
    let firstBatchRendered = false;

    try {
      const [articleFiles, caseFiles] = await Promise.all([
        cyberFileApi.listFiles(ARTICLES_DIR),
        cyberFileApi.listFiles(CASES_DIR),
      ]);

      const articleJsonFiles = articleFiles.filter(
        (f) => f.type === 'file' && f.name.endsWith('.json'),
      );
      const caseJsonFiles = caseFiles.filter((f) => f.type === 'file' && f.name.endsWith('.json'));

      const allFiles = [
        ...articleJsonFiles.map((f) => ({ file: f, collection: 'article' as const })),
        ...caseJsonFiles.map((f) => ({ file: f, collection: 'case' as const })),
      ];

      const loadedArticles: Article[] = [];
      const loadedCases: Case[] = [];

      await batchConcurrent(allFiles, (item) => cyberFileApi.readFile(item.file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            const item = allFiles[startIndex + i];
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const parsed =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                if (item.collection === 'article') {
                  loadedArticles.push(parsed as Article);
                } else {
                  loadedCases.push(parsed as Case);
                }
              } catch (e) {
                console.warn(
                  '[CyberNews] Failed to parse:',
                  item.file.path,
                  '\n  content type:',
                  typeof result.value.content,
                  '\n  content preview:',
                  typeof result.value.content === 'string'
                    ? result.value.content.slice(0, 500)
                    : JSON.stringify(result.value.content).slice(0, 500),
                  '\n  error:',
                  e,
                );
              }
            }
          });
          if (loadedArticles.length > 0) {
            // Temporarily clear unresolved .json imageUrl to prevent browser 404
            const snapshot = loadedArticles.map((a) => ({
              ...a,
              imageUrl: a.imageUrl?.endsWith('.json') ? '' : a.imageUrl,
            }));
            setArticles(snapshot);
          }
          if (loadedCases.length > 0) setCases([...loadedCases]);
          if (!firstBatchRendered && (loadedArticles.length > 0 || loadedCases.length > 0)) {
            firstBatchRendered = true;
            setIsLoading(false);
          }
        },
      });

      // Resolve image reference paths
      if (loadedArticles.length > 0) {
        await resolveArticleImages(loadedArticles);
        setArticles([...loadedArticles]);
      }

      // Seed data fallback
      if (loadedArticles.length === 0) {
        setArticles(SEED_ARTICLES);
        await batchConcurrent(SEED_ARTICLES, (article) =>
          cyberFileApi.writeFile(`${ARTICLES_DIR}/${article.id}.json`, article),
        );
      }

      if (loadedCases.length === 0) {
        setCases(SEED_CASES);
        await batchConcurrent(SEED_CASES, (c) =>
          cyberFileApi.writeFile(`${CASES_DIR}/${c.id}.json`, c),
        );
      }

      if (!firstBatchRendered) setIsLoading(false);

      // Load state.json
      const rootFiles = await cyberFileApi.listFiles('/');
      const stateExists = rootFiles.some((f) => f.name === 'state.json');
      if (stateExists) {
        try {
          const stateResult = await cyberFileApi.readFile(STATE_FILE);
          if (stateResult.content) {
            const saved =
              typeof stateResult.content === 'string'
                ? JSON.parse(stateResult.content)
                : stateResult.content;
            if (saved.currentView !== undefined) setCurrentView(saved.currentView);
            if (saved.selectedCaseId !== undefined) setSelectedCaseId(saved.selectedCaseId);
            if (saved.newsFilter !== undefined) setNewsFilter(saved.newsFilter);
          }
        } catch {
          // ignore
        }
      } else {
        await cyberFileApi.writeFile(STATE_FILE, DEFAULT_APP_STATE).catch(() => {});
      }
    } catch (error) {
      console.error('[CyberNews] Failed to load data:', error);
      setArticles(SEED_ARTICLES);
      setCases(SEED_CASES);
      setIsLoading(false);
    }
  }, []);

  // ============ State persistence ============
  const saveState = useCallback(
    async (partial: Partial<AppState>) => {
      try {
        const state: AppState = {
          currentView,
          selectedArticleId,
          selectedCaseId,
          newsFilter,
          ...partial,
        };
        await cyberFileApi.writeFile(STATE_FILE, state);
      } catch (error) {
        console.error('[CyberNews] Failed to save state:', error);
      }
    },
    [currentView, selectedArticleId, selectedCaseId, newsFilter],
  );

  // ============ User interaction handlers ============
  const handleTabChange = useCallback(
    (tab: 'news' | 'case-board') => {
      setCurrentView(tab);
      setSelectedArticleId(null);
      saveState({ currentView: tab, selectedArticleId: null });
      reportAction(APP_ID, 'FILTER_NEWS', { view: tab });
    },
    [saveState],
  );

  const handleFilterNews = useCallback((cat: ArticleCategory | null) => {
    setNewsFilter(cat);
    reportAction(APP_ID, 'FILTER_NEWS', { category: cat || 'all' });
  }, []);

  const handleViewArticle = useCallback((articleId: string, fromAgent = false) => {
    setSelectedArticleId(articleId);
    if (!fromAgent) {
      reportAction(APP_ID, 'VIEW_ARTICLE', { articleId });
    }
  }, []);

  const handleBackToFeed = useCallback(() => {
    setSelectedArticleId(null);
    reportAction(APP_ID, 'VIEW_ARTICLE', { articleId: '' }, ActionTriggerBy.User);
  }, []);

  const handleSelectCase = useCallback(
    (caseId: string, fromAgent = false) => {
      setSelectedCaseId(caseId);
      saveState({ selectedCaseId: caseId });
      if (!fromAgent) {
        reportAction(APP_ID, 'SELECT_CASE', { caseId });
      }
    },
    [saveState],
  );

  const handleMoveClue = useCallback(
    async (caseId: string, clueId: string, posX: number, posY: number, fromAgent = false) => {
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c;
          return {
            ...c,
            clues: c.clues.map((cl) => (cl.id === clueId ? { ...cl, posX, posY } : cl)),
          };
        }),
      );
      // Persist to cloud
      const targetCase = cases.find((c) => c.id === caseId);
      if (targetCase) {
        const updated = {
          ...targetCase,
          clues: targetCase.clues.map((cl) => (cl.id === clueId ? { ...cl, posX, posY } : cl)),
        };
        await cyberFileApi.writeFile(`${CASES_DIR}/${caseId}.json`, updated).catch(console.error);
      }
      if (!fromAgent) {
        reportAction(APP_ID, 'MOVE_CLUE', {
          caseId,
          clueId,
          posX: String(posX),
          posY: String(posY),
        });
      }
    },
    [cases],
  );

  // ============ Agent Action Handler ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        // ---- Operation Actions ----
        case ActionTypes.VIEW_ARTICLE: {
          const articleId = action.params?.articleId;
          if (!articleId) return 'error: missing articleId';
          let article = articles.find((a) => a.id === articleId);
          if (!article) {
            const refreshed = await refreshArticles();
            article = refreshed.find((a) => a.id === articleId);
            if (!article) return 'error: article not found after refresh';
          }
          setCurrentView('news');
          handleViewArticle(articleId, true);
          return 'success';
        }
        case ActionTypes.SELECT_CASE: {
          const caseId = action.params?.caseId;
          if (!caseId) return 'error: missing caseId';
          let c = cases.find((cs) => cs.id === caseId);
          if (!c) {
            const refreshed = await refreshCases();
            c = refreshed.find((cs) => cs.id === caseId);
            if (!c) return 'error: case not found after refresh';
          }
          setCurrentView('case-board');
          handleSelectCase(caseId, true);
          return 'success';
        }
        case ActionTypes.MOVE_CLUE: {
          const { caseId, clueId, posX, posY } = action.params || {};
          if (!caseId || !clueId) return 'error: missing caseId or clueId';
          await handleMoveClue(caseId, clueId, Number(posX) || 0, Number(posY) || 0, true);
          return 'success';
        }
        case ActionTypes.FILTER_NEWS: {
          const cat = action.params?.category as ArticleCategory | undefined;
          setCurrentView('news');
          setSelectedArticleId(null);
          setNewsFilter(cat || null);
          return 'success';
        }

        // ---- Mutation Actions ----
        case ActionTypes.CREATE_ARTICLE:
        case ActionTypes.UPDATE_ARTICLE:
        case ActionTypes.DELETE_ARTICLE: {
          await refreshArticles();
          return 'success';
        }
        case ActionTypes.CREATE_CASE:
        case ActionTypes.UPDATE_CASE:
        case ActionTypes.DELETE_CASE:
        case ActionTypes.CREATE_CLUE:
        case ActionTypes.UPDATE_CLUE:
        case ActionTypes.DELETE_CLUE: {
          await refreshCases();
          return 'success';
        }

        // ---- Refresh Actions ----
        case ActionTypes.REFRESH_ARTICLES: {
          if (action.params?.navigateTo === 'news') {
            setCurrentView('news');
            setSelectedArticleId(null);
          }
          await refreshArticles();
          return 'success';
        }
        case ActionTypes.REFRESH_CASES: {
          if (action.params?.navigateTo === 'case-board') {
            setCurrentView('case-board');
          }
          if (action.params?.focusId) {
            setSelectedCaseId(action.params.focusId);
          }
          await refreshCases();
          return 'success';
        }

        // ---- System Actions ----
        case ActionTypes.SYNC_STATE: {
          try {
            const stateResult = await cyberFileApi.readFile(STATE_FILE);
            if (stateResult.content) {
              const saved =
                typeof stateResult.content === 'string'
                  ? JSON.parse(stateResult.content)
                  : (stateResult.content as Record<string, unknown>);
              if (saved.currentView !== undefined)
                setCurrentView(saved.currentView as AppState['currentView']);
              if (saved.selectedArticleId !== undefined)
                setSelectedArticleId(saved.selectedArticleId as string | null);
              if (saved.selectedCaseId !== undefined)
                setSelectedCaseId(saved.selectedCaseId as string | null);
              if (saved.newsFilter !== undefined)
                setNewsFilter(saved.newsFilter as ArticleCategory | null);
            }
            return 'success';
          } catch (error) {
            console.error('[CyberNews] Failed to sync state:', error);
            return `error: ${String(error)}`;
          }
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [
      articles,
      cases,
      refreshArticles,
      refreshCases,
      handleViewArticle,
      handleSelectCase,
      handleMoveClue,
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
          name: 'CyberNews',
          windowStyle: { width: 1100, height: 750 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'CyberNews',
          windowStyle: { width: 1100, height: 750 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);
        await fetchVibeInfo();
        // Force English UI
        const i18nModule = await import('./i18n');
        i18nModule.default.changeLanguage('en');
        await loadData();
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[CyberNews] Init error:', error);
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

  // ============ Derived state ============
  const filteredArticles = newsFilter
    ? articles.filter((a) => a.category === newsFilter)
    : articles;

  const sortedArticles = [...filteredArticles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  const headlineArticle = sortedArticles[0] || null;
  const listArticles = sortedArticles.slice(1);
  const selectedArticle = selectedArticleId
    ? articles.find((a) => a.id === selectedArticleId)
    : null;
  const selectedCase = selectedCaseId ? cases.find((c) => c.id === selectedCaseId) : null;

  // ============ Render ============
  if (isLoading) {
    return (
      <div className={styles.cyberNews}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>{t('loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.cyberNews}>
      <div className={styles.scanlines} />
      <NavBar activeTab={currentView} onTabChange={handleTabChange} />

      <div className={styles.mainContent}>
        {currentView === 'news' && !selectedArticle && (
          <div className={styles.newsFeed}>
            <CategoryFilter active={newsFilter} onSelect={handleFilterNews} />
            {sortedArticles.length === 0 ? (
              <div className={styles.emptyState}>
                <Newspaper size={48} />
                <p>{t('news.emptyState')}</p>
              </div>
            ) : (
              <div className={styles.newsGrid}>
                {headlineArticle && (
                  <HeadlineCard
                    article={headlineArticle}
                    onClick={() => handleViewArticle(headlineArticle.id)}
                  />
                )}
                <div className={styles.newsListColumn}>
                  <div className={styles.newsListHeader}>{t('news.latestFeeds')}</div>
                  <div className={styles.newsList}>
                    {listArticles.map((article) => (
                      <NewsListCard
                        key={article.id}
                        article={article}
                        onClick={() => handleViewArticle(article.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'news' && selectedArticle && (
          <ArticleDetail article={selectedArticle} onBack={handleBackToFeed} />
        )}

        {currentView === 'case-board' && (
          <div className={styles.caseBoardLayout}>
            <CaseSidebar
              cases={cases}
              selectedId={selectedCaseId}
              onSelect={(id) => handleSelectCase(id)}
            />
            <BoardCanvas selectedCase={selectedCase || null} onMoveClue={handleMoveClue} />
          </div>
        )}
      </div>

      <NewsTicker articles={articles} />
    </div>
  );
};

export default CyberNews;
