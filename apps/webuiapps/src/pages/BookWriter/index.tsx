import React, { useEffect, useState } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import { reportLifecycle, fetchVibeInfo } from '@/lib';
import { BookOpen, FilePlus, FileText } from 'lucide-react';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 15;

// ============================================================
// Book chapters live at: Kayley_Cowork/book/chapters/*.md
// (junctioned into public/kayley-book/ once Steven drops files there)
//
// For v1, no chapters exist on disk yet — we ship the graceful empty
// state and a preview of what the list UI will look like once chapters
// are added. When a /public/kayley-book/index.json manifest appears,
// we flip into "loaded" mode.
// ============================================================
const CHAPTERS_MANIFEST_URL = '/kayley-book/index.json';

interface Chapter {
  id: string;
  slug: string;
  title: string;
  order: number;
  wordCount?: number;
  updatedAt?: string;
}

const PREVIEW_CHAPTERS: Chapter[] = [
  { id: 'preview-1', slug: 'chapter-01', title: 'Chapter 1 (example)', order: 1, wordCount: 2400 },
  { id: 'preview-2', slug: 'chapter-02', title: 'Chapter 2 (example)', order: 2, wordCount: 1850 },
  { id: 'preview-3', slug: 'chapter-03', title: 'Chapter 3 (example)', order: 3, wordCount: 3100 },
];

// ============ Main Component ============
const BookWriter: React.FC = () => {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'BookWriter',
          windowStyle: { width: 880, height: 600 },
        });
        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'BookWriter',
          windowStyle: { width: 880, height: 600 },
        });
        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch (err) {
          console.warn('[BookWriter] fetchVibeInfo failed:', err);
        }

        // Try to load the chapters manifest. If it 404s, we show the
        // graceful empty state with setup instructions.
        try {
          const res = await fetch(CHAPTERS_MANIFEST_URL, { cache: 'no-store' });
          if (res.ok) {
            const data = (await res.json()) as { chapters: Chapter[] };
            setChapters(data.chapters || []);
          } else {
            setChapters([]);
          }
        } catch (err) {
          console.warn('[BookWriter] manifest fetch failed:', err);
          setLoadError(String(err));
          setChapters([]);
        } finally {
          setIsLoading(false);
        }

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[BookWriter] Init error:', err);
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };
    init();
    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.bookwriter}>
        <div className={styles.placeholder}>
          <BookOpen size={48} style={{ opacity: 0.3 }} />
          <div className={styles.subtitle}>Loading chapters…</div>
        </div>
      </div>
    );
  }

  const hasChapters = chapters && chapters.length > 0;

  return (
    <div className={styles.bookwriter}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <BookOpen size={28} />
            <div>
              <h1 className={styles.title}>Steven's Book</h1>
              <p className={styles.subtitle}>
                {hasChapters
                  ? `${chapters!.length} chapter${chapters!.length === 1 ? '' : 's'}`
                  : 'Chapters, drafts, notes — co-written with Kayley'}
              </p>
            </div>
          </div>
        </header>

        {hasChapters ? (
          <ul className={styles.chapterList}>
            {chapters!
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((ch) => (
                <li key={ch.id} className={styles.chapterItem}>
                  <FileText size={18} className={styles.chapterIcon} />
                  <div className={styles.chapterMeta}>
                    <div className={styles.chapterTitle}>{ch.title}</div>
                    <div className={styles.chapterSub}>
                      {ch.wordCount ? `${ch.wordCount.toLocaleString()} words` : '—'}
                      {ch.updatedAt ? ` · updated ${ch.updatedAt}` : ''}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <div className={styles.emptyState}>
            <FilePlus size={56} className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>No chapters yet</div>
            <p className={styles.emptyBody}>
              Drop markdown files in{' '}
              <code className={styles.code}>Kayley_Cowork/book/chapters/</code> to start.
              Kayley will index them automatically and you can edit or co-write from here.
            </p>
            {loadError ? (
              <p className={styles.errorHint}>Manifest load error (ok for first run): {loadError}</p>
            ) : null}

            <div className={styles.previewBlock}>
              <div className={styles.previewLabel}>Preview — this is what it will look like</div>
              <ul className={styles.chapterList}>
                {PREVIEW_CHAPTERS.map((ch) => (
                  <li key={ch.id} className={`${styles.chapterItem} ${styles.chapterItemPreview}`}>
                    <FileText size={18} className={styles.chapterIcon} />
                    <div className={styles.chapterMeta}>
                      <div className={styles.chapterTitle}>{ch.title}</div>
                      <div className={styles.chapterSub}>{ch.wordCount?.toLocaleString()} words</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookWriter;
