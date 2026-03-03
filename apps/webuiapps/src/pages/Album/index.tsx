import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useFileSystem,
  useAgentActionListener,
  reportLifecycle,
  createAppFileApi,
  fetchVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 8;
const APP_NAME = 'album';
const IMAGES_DIR = '/images';

const albumFileApi = createAppFileApi(APP_NAME);

// ============ Types ============
export type AlbumAction = { type: 'REFRESH' };

interface ImageItem {
  id: string;
  src: string;
  createdAt: number;
}

// ============ SVG Icons ============
const Icons = {
  back: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronLeft: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  ),
};

// ============ Utility Functions ============
/** Format createdAt timestamp to localized date-time string, returns empty string if unparseable */
function formatImageDate(createdAt: number, lang: string): string {
  if (!createdAt || createdAt <= 0) return '';
  try {
    const date = new Date(createdAt);
    if (isNaN(date.getTime())) return '';
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '';
  }
}

// ============ Main Component ============
const Album: React.FC = () => {
  const { t, i18n } = useTranslation('album');
  const [items, setItems] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Preview uses index, -1 means unselected (grid view)
  const [previewIndex, setPreviewIndex] = useState(-1);

  const { initFromCloud, getChildrenByPath } = useFileSystem({ fileApi: albumFileApi });

  const loadImagesFromFS = useCallback((): ImageItem[] => {
    const children = getChildrenByPath(IMAGES_DIR);
    return children
      .filter((node) => node.type === 'file' && node.content !== null)
      .map((node) => {
        let raw: unknown;
        if (typeof node.content === 'string') {
          try {
            raw = JSON.parse(node.content);
          } catch {
            console.warn('[Album] Failed to parse image:', node.path);
            return null;
          }
        } else {
          raw = node.content;
        }
        const o = raw as Record<string, unknown>;
        const id = typeof o?.id === 'string' ? o.id : '';
        const src = typeof o?.src === 'string' ? o.src : '';
        const createdAt = typeof o?.createdAt === 'number' ? o.createdAt : 0;
        if (!id || !src) return null;
        return { id, src, createdAt };
      })
      .filter((item): item is ImageItem => item !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [getChildrenByPath]);

  const refreshFromCloud = useCallback(async () => {
    try {
      await initFromCloud();
      const loaded = loadImagesFromFS();
      setItems(loaded);
    } catch (error) {
      console.warn('[Album] refreshFromCloud failed:', error);
    }
  }, [initFromCloud, loadImagesFromFS]);

  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      if (action.action_type === 'REFRESH') {
        await refreshFromCloud();
        return 'success';
      }
      return `error: unknown action_type ${action.action_type}`;
    },
    [refreshFromCloud],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Album',
          windowStyle: { width: 800, height: 600 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Album',
          windowStyle: { width: 800, height: 600 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Fetch user / character / system settings (language auto-syncs to i18n)
        try {
          await fetchVibeInfo();
        } catch (error) {
          console.warn('[Album] fetchVibeInfo failed:', error);
        }

        try {
          await initFromCloud();
        } catch (error) {
          console.warn('[Album] Cloud init failed:', error);
        }

        const loaded = loadImagesFromFS();
        setItems(loaded);
        setIsLoading(false);

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Album] Init error:', error);
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

  // ============ Preview Navigation ============
  const openPreview = useCallback((index: number) => {
    setPreviewIndex(index);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewIndex(-1);
  }, []);

  const goPrev = useCallback(() => {
    setPreviewIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goNext = useCallback(() => {
    setPreviewIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
  }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    if (previewIndex < 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'Escape':
          e.preventDefault();
          closePreview();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, goPrev, goNext, closePreview]);

  // ============ Currently Previewed Image ============
  const previewItem = previewIndex >= 0 && previewIndex < items.length ? items[previewIndex] : null;

  // ============ Loading ============
  if (isLoading) {
    return (
      <div className={styles.album}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.album}>
      {/* Grid view */}
      <div className={styles.gridWrap}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{t('empty')}</p>
          </div>
        ) : (
          <ul className={styles.grid}>
            {items.map((item, index) => (
              <li key={item.id} className={styles.gridItem}>
                <button
                  type="button"
                  className={styles.thumbBtn}
                  onClick={() => openPreview(index)}
                >
                  <img
                    src={item.src}
                    alt={item.id}
                    className={styles.thumbImg}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.background = '#161b22';
                      (e.target as HTMLImageElement).src = '';
                    }}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Secondary page: Full image preview */}
      {previewItem && (
        <div className={styles.previewPage}>
          <div className={styles.previewToolbar}>
            <button
              type="button"
              className={styles.previewBackBtn}
              onClick={closePreview}
              title={t('back')}
            >
              {Icons.back}
            </button>
            {(() => {
              const dateStr = formatImageDate(previewItem.createdAt, i18n.language);
              return dateStr ? <span className={styles.previewTitle}>{dateStr}</span> : null;
            })()}
            <span className={styles.previewCounter}>
              {previewIndex + 1} / {items.length}
            </span>
          </div>

          <div className={styles.previewBody}>
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navPrev}`}
              onClick={goPrev}
              disabled={previewIndex <= 0}
              title={t('prev')}
            >
              {Icons.chevronLeft}
            </button>

            <img src={previewItem.src} alt={previewItem.id} className={styles.previewImg} />

            <button
              type="button"
              className={`${styles.navBtn} ${styles.navNext}`}
              onClick={goNext}
              disabled={previewIndex >= items.length - 1}
              title={t('next')}
            >
              {Icons.chevronRight}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Album;
