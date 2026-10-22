import React, { useEffect, useState, useMemo } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import { reportLifecycle, fetchVibeInfo } from '@/lib';
import { Heart, BookOpen, CalendarDays, Handshake, Quote } from 'lucide-react';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 16;

const MOMENTS_INDEX = '/kayley-moments-index.json';
const WEEKS_INDEX = '/kayley-weeks-index.json';
const PROMISES_INDEX = '/kayley-promises-index.json';
const STORYLINES_INDEX = '/kayley-storylines-index.json';

// ============ Types ============
interface MomentEntry {
  id: string;
  slug: string;
  date: string;
  title: string;
  summary: string;
  lineThatStays: string;
  body: string;
  createdAt: number;
}

interface WeekEntry {
  id: string;
  weekOf: string;
  weekNumber: number | null;
  score: number | null;
  title: string;
  heading: string;
  narrative_excerpt: string;
  body: string;
  createdAt: number;
}

interface PromiseEntry {
  id: string;
  promise_type: string;
  description: string;
  commitment_context: string | null;
  status: string;
  created_at: string;
  fulfilled_at: string | null;
  estimated_timing: string | null;
}

interface StorylineEntry {
  id: string;
  title: string;
  category: string;
  storyline_type: string;
  phase: string;
  current_emotional_tone: string | null;
  initial_announcement: string | null;
  stakes: string | null;
  created_at: string;
}

type TabKey = 'moments' | 'weeks' | 'promises' | 'storylines';

// ============ Utilities ============
async function fetchJSON<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(path);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[MemoryVault] fetch failed ${path}:`, err);
    return [];
  }
}

function formatDate(isoOrDate: string): string {
  const d = isoOrDate.length > 10 ? new Date(isoOrDate) : new Date(isoOrDate + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ============ Main Component ============
const MemoryVault: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('moments');
  const [moments, setMoments] = useState<MomentEntry[]>([]);
  const [weeks, setWeeks] = useState<WeekEntry[]>([]);
  const [promises, setPromises] = useState<PromiseEntry[]>([]);
  const [storylines, setStorylines] = useState<StorylineEntry[]>([]);
  const [selectedMoment, setSelectedMoment] = useState<MomentEntry | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WeekEntry | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'MemoryVault',
          windowStyle: { width: 880, height: 600 },
        });
        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'MemoryVault',
          windowStyle: { width: 880, height: 600 },
        });
        reportLifecycle(AppLifecycle.DOM_READY);

        const [m, w, p, s] = await Promise.all([
          fetchJSON<MomentEntry>(MOMENTS_INDEX),
          fetchJSON<WeekEntry>(WEEKS_INDEX),
          fetchJSON<PromiseEntry>(PROMISES_INDEX),
          fetchJSON<StorylineEntry>(STORYLINES_INDEX),
        ]);
        setMoments(m);
        setWeeks(w);
        setPromises(p);
        setStorylines(s);

        try {
          await fetchVibeInfo();
        } catch (err) {
          console.warn('[MemoryVault] fetchVibeInfo failed:', err);
        }

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[MemoryVault] Init error:', err);
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };
    init();
    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  const sortedPromises = useMemo(() => {
    return [...promises].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [promises]);

  const tabs: { key: TabKey; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'moments', label: 'Moments', count: moments.length, icon: <Quote size={14} /> },
    { key: 'weeks', label: 'Weeks', count: weeks.length, icon: <CalendarDays size={14} /> },
    { key: 'promises', label: 'Promises', count: promises.length, icon: <Handshake size={14} /> },
    ...(storylines.length > 0
      ? [{ key: 'storylines' as TabKey, label: 'Storylines', count: storylines.length, icon: <BookOpen size={14} /> }]
      : []),
  ];

  return (
    <div className={styles.memoryvault}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Heart size={20} className={styles.headerIcon} />
          <h1 className={styles.headerTitle}>Memory Vault</h1>
        </div>
        <p className={styles.headerSubtitle}>
          The artifacts of us — captured moments, weekly reflections, promises.
        </p>
        <nav className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => {
                setActiveTab(t.key);
                setSelectedMoment(null);
                setSelectedWeek(null);
              }}
            >
              {t.icon}
              <span>{t.label}</span>
              <span className={styles.tabCount}>{t.count}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className={styles.content}>
        {activeTab === 'moments' && (
          <div className={styles.momentsGrid}>
            {moments.length === 0 && <div className={styles.empty}>No moments yet.</div>}
            {moments.map((m) => (
              <article
                key={m.id}
                className={styles.momentCard}
                onClick={() => setSelectedMoment(m)}
              >
                <div className={styles.momentDate}>{formatDate(m.date)}</div>
                <h3 className={styles.momentTitle}>{m.title}</h3>
                {m.lineThatStays && (
                  <blockquote className={styles.lineThatStays}>
                    <Quote size={12} className={styles.quoteIcon} />
                    <span>{m.lineThatStays}</span>
                  </blockquote>
                )}
                {!m.lineThatStays && m.summary && (
                  <p className={styles.momentSummary}>{m.summary}</p>
                )}
              </article>
            ))}
          </div>
        )}

        {activeTab === 'weeks' && (
          <div className={styles.weeksList}>
            {weeks.length === 0 && <div className={styles.empty}>No weekly reflections yet.</div>}
            {weeks.map((w) => (
              <article
                key={w.id}
                className={styles.weekCard}
                onClick={() => setSelectedWeek(w)}
              >
                <div className={styles.weekHeader}>
                  <div>
                    <div className={styles.weekLabel}>
                      {w.weekNumber != null ? `Week ${w.weekNumber}` : 'Week'} · {formatDate(w.weekOf)}
                    </div>
                    <h3 className={styles.weekTitle}>{w.title}</h3>
                  </div>
                  {w.score != null && (
                    <div className={styles.weekScore}>
                      <span className={styles.scoreNumber}>{w.score.toFixed(1)}</span>
                      <span className={styles.scoreOutOf}>/10</span>
                    </div>
                  )}
                </div>
                {w.narrative_excerpt && (
                  <p className={styles.weekExcerpt}>{w.narrative_excerpt}</p>
                )}
              </article>
            ))}
          </div>
        )}

        {activeTab === 'promises' && (
          <div className={styles.promisesList}>
            {promises.length === 0 && <div className={styles.empty}>No promises logged yet.</div>}
            {sortedPromises.map((p) => (
              <article
                key={p.id}
                className={`${styles.promiseRow} ${
                  p.status === 'pending' ? styles.promisePending : styles.promiseFulfilled
                }`}
              >
                <div className={styles.promiseStatus}>
                  <span className={styles.promiseDot} />
                  <span className={styles.promiseType}>{p.promise_type}</span>
                  <span className={styles.promiseDate}>{formatDate(p.created_at)}</span>
                  <span className={styles.promiseStatusLabel}>{p.status}</span>
                </div>
                <p className={styles.promiseDescription}>{p.description}</p>
                {p.commitment_context && (
                  <p className={styles.promiseContext}>
                    <em>“{p.commitment_context.slice(0, 180)}{p.commitment_context.length > 180 ? '…' : ''}”</em>
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        {activeTab === 'storylines' && (
          <div className={styles.storylinesList}>
            {storylines.length === 0 && <div className={styles.empty}>No storylines logged yet.</div>}
            {storylines.map((s) => (
              <article key={s.id} className={styles.storylineCard}>
                <div className={styles.storylineMeta}>
                  <span className={styles.storylineTag}>{s.category}</span>
                  <span className={styles.storylineTag}>{s.storyline_type}</span>
                  <span className={`${styles.storylinePhase} ${styles[`phase_${s.phase}`] || ''}`}>
                    {s.phase}
                  </span>
                </div>
                <h3 className={styles.storylineTitle}>{s.title}</h3>
                {s.initial_announcement && (
                  <p className={styles.storylineAnnouncement}>{s.initial_announcement}</p>
                )}
                {s.stakes && (
                  <p className={styles.storylineStakes}>
                    <strong>Stakes:</strong> {s.stakes}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      {selectedMoment && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedMoment(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setSelectedMoment(null)}>
              ×
            </button>
            <div className={styles.modalDate}>{formatDate(selectedMoment.date)}</div>
            <h2 className={styles.modalTitle}>{selectedMoment.title}</h2>
            {selectedMoment.lineThatStays && (
              <blockquote className={styles.modalLine}>
                “{selectedMoment.lineThatStays}”
              </blockquote>
            )}
            <pre className={styles.modalBody}>{selectedMoment.body}</pre>
          </div>
        </div>
      )}

      {selectedWeek && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedWeek(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setSelectedWeek(null)}>
              ×
            </button>
            <div className={styles.modalDate}>
              {selectedWeek.weekNumber != null ? `Week ${selectedWeek.weekNumber} · ` : ''}
              {formatDate(selectedWeek.weekOf)}
            </div>
            <h2 className={styles.modalTitle}>{selectedWeek.title}</h2>
            {selectedWeek.score != null && (
              <div className={styles.modalScore}>
                Overall: <strong>{selectedWeek.score.toFixed(2)}</strong> / 10
              </div>
            )}
            <pre className={styles.modalBody}>{selectedWeek.body}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryVault;
