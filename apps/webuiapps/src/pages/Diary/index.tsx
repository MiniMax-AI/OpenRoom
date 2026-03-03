import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useFileSystem,
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  generateId,
  createAppFileApi,
  fetchVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import MarkdownEditor from './components/MarkdownEditor';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 4;
const APP_NAME = 'diary';
const ENTRIES_DIR = '/entries';
const STATE_FILE = '/state.json';
const COMPACT_BREAKPOINT = 560;

const diaryFileApi = createAppFileApi(APP_NAME);
const getEntryFilePath = (entryId: string): string => `${ENTRIES_DIR}/${entryId}.json`;

// ============ Type Definitions ============
type DiaryMood =
  | 'happy'
  | 'sad'
  | 'neutral'
  | 'excited'
  | 'tired'
  | 'anxious'
  | 'hopeful'
  | 'angry';
type DiaryWeather = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy' | 'foggy';

export type DiaryAction =
  | {
      type: 'CREATE_ENTRY';
      payload?: {
        date?: string;
        title?: string;
        content?: string;
        mood?: string;
        weather?: string;
      };
    }
  | {
      type: 'UPDATE_ENTRY';
      payload: {
        entryId: string;
        title?: string;
        content?: string;
        mood?: string;
        weather?: string;
      };
    }
  | { type: 'DELETE_ENTRY'; payload: { entryId: string } }
  | { type: 'SELECT_ENTRY'; payload: { entryId: string } }
  | { type: 'SELECT_DATE'; payload: { date: string } };

interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
  mood?: DiaryMood;
  weather?: DiaryWeather;
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  selectedDate: string | null;
}

// ============ SVG Hand-drawn Decoration Components ============
const HandDrawnCircle = ({
  color = '#ef4444',
  style,
}: {
  color?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    viewBox="0 0 100 100"
    style={{
      position: 'absolute',
      pointerEvents: 'none',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      ...style,
    }}
  >
    <motion.path
      d="M20,50 C20,20 80,20 80,50 C80,80 20,80 20,50 M15,55 C15,90 85,90 85,45"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.6 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    />
  </svg>
);

const HandDrawnUnderline = ({
  color = '#3b82f6',
  width = 100,
  style,
}: {
  color?: string;
  width?: number;
  style?: React.CSSProperties;
}) => (
  <svg
    width={width}
    height="10"
    viewBox={`0 0 ${width} 10`}
    style={{
      position: 'absolute',
      pointerEvents: 'none',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      ...style,
    }}
  >
    <motion.path
      d={`M0,5 Q${width / 4},0 ${width / 2},5 T${width},5`}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.5 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  </svg>
);

const HandDrawnStar = ({
  color = '#fbbf24',
  style,
}: {
  color?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    style={{
      position: 'absolute',
      pointerEvents: 'none',
      fill: 'none',
      stroke: color,
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      ...style,
    }}
  >
    <motion.path
      d="M12,2 L12,22 M2,12 L22,12 M5,5 L19,19 M19,5 L5,19"
      initial={{ pathLength: 0, scale: 0 }}
      animate={{ pathLength: 1, scale: 1 }}
      transition={{ duration: 0.4, type: 'spring' }}
    />
  </svg>
);

const HandDrawnStrike = ({ color = '#ef4444' }: { color?: string }) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 100 20"
    preserveAspectRatio="none"
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: 'none',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      overflow: 'visible',
    }}
  >
    <motion.path
      d="M0,10 Q25,5 50,10 T100,10"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.7 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    />
  </svg>
);

const HandDrawnScribble = ({ color = '#1f2937' }: { color?: string }) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 100 30"
    preserveAspectRatio="none"
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: 'none',
      fill: 'none',
      stroke: color,
      strokeWidth: 3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      overflow: 'visible',
    }}
  >
    <motion.path
      d="M0,15 L10,5 L20,25 L30,5 L40,25 L50,5 L60,25 L70,5 L80,25 L90,5 L100,15"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.8 }}
      transition={{ duration: 0.6, ease: 'linear' }}
    />
  </svg>
);

// ============ Special Marker Content Rendering ============
const renderDiaryContent = (content: string) => {
  const parts = content.split(
    /(\{\{(?:strike|scribble|messy)\}\}.*?\{\{\/(?:strike|scribble|messy)\}\})/s,
  );
  return parts.map((part, index) => {
    if (part.startsWith('{{strike}}')) {
      const text = part.replace(/\{\{\/?strike\}\}/g, '');
      return (
        <span
          key={index}
          style={{ position: 'relative', display: 'inline-block', margin: '0 2px' }}
        >
          {text}
          <HandDrawnStrike color="#ef4444" />
        </span>
      );
    } else if (part.startsWith('{{scribble}}')) {
      const text = part.replace(/\{\{\/?scribble\}\}/g, '');
      return (
        <span
          key={index}
          style={{ position: 'relative', display: 'inline-block', margin: '0 2px' }}
        >
          {text}
          <HandDrawnStrike color="#1f2937" />
          <HandDrawnStrike color="#1f2937" />
        </span>
      );
    } else if (part.startsWith('{{messy}}')) {
      const text = part.replace(/\{\{\/?messy\}\}/g, '');
      return (
        <span
          key={index}
          style={{
            position: 'relative',
            display: 'inline-block',
            margin: '0 2px',
            color: 'transparent',
          }}
        >
          {text}
          <HandDrawnScribble />
          <span style={{ position: 'absolute', left: 0, top: 0, color: '#374151', opacity: 0.1 }}>
            {text}
          </span>
        </span>
      );
    }
    // Plain text: preserve line breaks
    return (
      <span key={index}>
        {part.split('\n').map((line, i, arr) => (
          <React.Fragment key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    );
  });
};

// ============ Mood/Weather Configuration ============
const MOOD_CONFIG: Record<
  DiaryMood,
  { color: string; labelKey: string; elements: React.ReactNode }
> = {
  happy: {
    color: '#f472b6',
    labelKey: 'moods.happy',
    elements: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
        <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
      </>
    ),
  },
  sad: {
    color: '#94a3b8',
    labelKey: 'moods.sad',
    elements: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
        <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
        <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
      </>
    ),
  },
  neutral: {
    color: '#fbbf24',
    labelKey: 'moods.neutral',
    elements: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="8" y1="15" x2="16" y2="15" />
        <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
        <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
      </>
    ),
  },
  excited: {
    color: '#c084fc',
    labelKey: 'moods.excited',
    elements: (
      <>
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
        <path d="M5 19l1 3 1-3" />
        <path d="M18 17l1.5 3 1.5-3" />
      </>
    ),
  },
  tired: {
    color: '#64748b',
    labelKey: 'moods.tired',
    elements: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 15h8" />
        <path d="M9 9l-1 1 1 1" />
        <path d="M15 9l1 1-1 1" />
      </>
    ),
  },
  anxious: {
    color: '#ef4444',
    labelKey: 'moods.anxious',
    elements: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  },
  hopeful: {
    color: '#22c55e',
    labelKey: 'moods.hopeful',
    elements: (
      <>
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
      </>
    ),
  },
  angry: {
    color: '#dc2626',
    labelKey: 'moods.angry',
    elements: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
        <path d="M7.5 8l3 1.5" />
        <path d="M16.5 8l-3 1.5" />
      </>
    ),
  },
};

const WEATHER_CONFIG: Record<
  DiaryWeather,
  { color: string; labelKey: string; elements: React.ReactNode }
> = {
  sunny: {
    color: '#fbbf24',
    labelKey: 'weathers.sunny',
    elements: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </>
    ),
  },
  cloudy: {
    color: '#94a3b8',
    labelKey: 'weathers.cloudy',
    elements: <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />,
  },
  rainy: {
    color: '#60a5fa',
    labelKey: 'weathers.rainy',
    elements: (
      <>
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
        <line x1="8" y1="19" x2="8" y2="21" />
        <line x1="12" y1="17" x2="12" y2="19" />
        <line x1="16" y1="19" x2="16" y2="21" />
      </>
    ),
  },
  snowy: {
    color: '#93c5fd',
    labelKey: 'weathers.snowy',
    elements: (
      <>
        <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
        <path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" strokeWidth="3" />
      </>
    ),
  },
  windy: {
    color: '#a78bfa',
    labelKey: 'weathers.windy',
    elements: (
      <>
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
        <path d="M12.59 19.41A2 2 0 1 0 14 16H2" />
        <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" />
      </>
    ),
  },
  foggy: {
    color: '#6b7280',
    labelKey: 'weathers.foggy',
    elements: (
      <>
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
        <line x1="4" y1="19" x2="20" y2="19" />
        <line x1="6" y1="22" x2="18" y2="22" />
      </>
    ),
  },
};

const MoodIcon: React.FC<{ mood: DiaryMood; size?: number }> = ({ mood, size = 20 }) => {
  const c = MOOD_CONFIG[mood] ?? MOOD_CONFIG.neutral;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={c.color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {c.elements}
    </svg>
  );
};

const WeatherIcon: React.FC<{ weather: DiaryWeather; size?: number }> = ({
  weather,
  size = 20,
}) => {
  const c = WEATHER_CONFIG[weather] ?? WEATHER_CONFIG.sunny;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={c.color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {c.elements}
    </svg>
  );
};

// ============ SVG Icons ============
const Icons = {
  plus: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  trash: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
  book: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  pen: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  ),
  edit: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  eye: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

// ============ Utility Functions ============
const toDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getToday = (): string => toDateString(new Date());

const formatDateFull = (dateStr: string, locale: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
};

const formatTime = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ============ Page Turn Animation Variants ============
const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    rotateY: direction > 0 ? 12 : -12,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    rotateY: 0,
    scale: 1,
    transition: {
      x: { type: 'spring', stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
      rotateY: { duration: 0.35 },
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
    rotateY: direction < 0 ? 12 : -12,
    scale: 0.96,
    transition: {
      x: { type: 'spring', stiffness: 300, damping: 30 },
      opacity: { duration: 0.15 },
    },
  }),
};

// ============ Main Component ============
const Diary: React.FC = () => {
  const { t, i18n } = useTranslation('diary');

  // --- State ---
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [direction, setDirection] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | ''>('');
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [showWeatherPicker, setShowWeatherPicker] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const [compactView, setCompactView] = useState<'calendar' | 'editor'>('calendar');
  const [calendarCollapsed, setCalendarCollapsed] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Derived State ---
  const isCompact = containerWidth < COMPACT_BREAKPOINT;
  const today = getToday();

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    [...entries]
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((e) => {
        const list = map.get(e.date) || [];
        list.push(e);
        map.set(e.date, list);
      });
    return map;
  }, [entries]);

  const selectedDateEntries = useMemo(
    () => entriesByDate.get(selectedDate) || [],
    [entriesByDate, selectedDate],
  );

  const selectedEntry = useMemo(
    () =>
      selectedDateEntries.find((e) => e.id === selectedEntryId) || selectedDateEntries[0] || null,
    [selectedDateEntries, selectedEntryId],
  );

  // All entries sorted by date descending (for sidebar list)
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );

  const calendarDays = useMemo((): (Date | null)[] => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  }, [currentMonth]);

  const weekdayLabels = useMemo(
    () =>
      [
        'weekdays.sun',
        'weekdays.mon',
        'weekdays.tue',
        'weekdays.wed',
        'weekdays.thu',
        'weekdays.fri',
        'weekdays.sat',
      ].map((k) => t(k)),
    [t],
  );

  // --- File System ---
  const {
    saveFile: fsSaveFile,
    syncToCloud,
    deleteFromCloud,
    initFromCloud,
    getChildrenByPath,
    getByPath,
    updateNode,
    removeByPath,
  } = useFileSystem({
    fileApi: diaryFileApi,
  });

  // --- Container Size Observer ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((obs) => {
      for (const entry of obs) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // --- File System Helpers ---
  const loadEntriesFromFS = useCallback((): DiaryEntry[] => {
    const children = getChildrenByPath(ENTRIES_DIR);
    return children
      .filter((n) => n.type === 'file' && n.content !== null)
      .map((n) => {
        let entry: DiaryEntry;
        if (typeof n.content === 'string') {
          try {
            entry = JSON.parse(n.content);
          } catch {
            return null;
          }
        } else {
          entry = n.content as DiaryEntry;
        }
        // Backward compatibility: derive date from createdAt if date field is missing
        if (!entry.date && entry.createdAt) {
          entry.date = toDateString(new Date(entry.createdAt));
        }
        return {
          ...entry,
          title: entry.title || '',
          content: entry.content || '',
          date: entry.date || getToday(),
        };
      })
      .filter((e): e is DiaryEntry => e !== null && !!e.id);
  }, [getChildrenByPath]);

  const loadState = useCallback((): AppState | null => {
    const node = getByPath(STATE_FILE);
    return (node?.content as AppState) || null;
  }, [getByPath]);

  const saveState = useCallback(
    async (state: AppState) => {
      fsSaveFile(STATE_FILE, state);
      try {
        await syncToCloud(STATE_FILE, state);
      } catch (error) {
        console.error('[Diary] Failed to sync state:', error);
      }
    },
    [fsSaveFile, syncToCloud],
  );

  // --- Calendar Operations ---
  const changeMonth = useCallback((delta: number) => {
    setCurrentMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(prev.getMonth() + delta);
      return d;
    });
  }, []);

  // --- Business Logic ---
  const handleSelectDate = useCallback(
    (date: string, entryId?: string) => {
      if (date === selectedDate && !entryId && !isCompact) return;
      setDirection(date > selectedDate ? 1 : -1);
      setSelectedDate(date);
      setSelectedEntryId(entryId || null);
      setIsEditing(false);
      setShowMoodPicker(false);
      setShowWeatherPicker(false);
      if (isCompact) setCompactView('editor');
      saveState({ selectedDate: date });
    },
    [selectedDate, isCompact, saveState],
  );

  const handleCreateEntry = useCallback(
    async (
      date?: string,
      opts?: { title?: string; content?: string; mood?: DiaryMood; weather?: DiaryWeather },
    ) => {
      const entryDate = date || selectedDate;
      const id = generateId();
      const now = Date.now();
      const entry: DiaryEntry = {
        id,
        date: entryDate,
        title: opts?.title || '',
        content: opts?.content || '',
        mood: opts?.mood,
        weather: opts?.weather,
        createdAt: now,
        updatedAt: now,
      };
      const filePath = getEntryFilePath(id);
      setEntries((prev) => [...prev, entry]);
      setSelectedDate(entryDate);
      setSelectedEntryId(id);
      setIsEditing(true);
      if (isCompact) setCompactView('editor');
      fsSaveFile(filePath, entry);
      try {
        await syncToCloud(filePath, entry);
      } catch (error) {
        console.error('[Diary] Failed to sync new entry:', error);
      }
      saveState({ selectedDate: entryDate });
      reportAction(APP_ID, 'CREATE_ENTRY', { entryId: id, date: entryDate, ...(opts || {}) });
      return id;
    },
    [selectedDate, fsSaveFile, syncToCloud, saveState, isCompact],
  );

  const handleUpdateEntry = useCallback(
    async (
      entryId: string,
      updates: { title?: string; content?: string; mood?: DiaryMood; weather?: DiaryWeather },
    ) => {
      const now = Date.now();
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, ...updates, updatedAt: now } : e)),
      );
      setSaveStatus('saving');
      const filePath = getEntryFilePath(entryId);
      const node = getByPath(filePath);
      if (node) {
        const existing = node.content as DiaryEntry;
        const updated = { ...existing, ...updates, updatedAt: now };
        updateNode(node.id, { content: updated });
        try {
          await syncToCloud(filePath, updated);
        } catch (error) {
          console.error('[Diary] Failed to sync entry update:', error);
        }
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
      reportAction(APP_ID, 'UPDATE_ENTRY', { entryId, ...updates });
    },
    [getByPath, updateNode, syncToCloud],
  );

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      const filePath = getEntryFilePath(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setSelectedEntryId(null);
      setIsEditing(false);
      if (isCompact) setCompactView('calendar');
      removeByPath(filePath);
      try {
        await deleteFromCloud(filePath);
      } catch (error) {
        console.error('[Diary] Failed to delete entry:', error);
      }
      reportAction(APP_ID, 'DELETE_ENTRY', { entryId });
    },
    [removeByPath, deleteFromCloud, isCompact],
  );

  const handleMoodChange = useCallback(
    (mood: DiaryMood) => {
      if (!selectedEntry) return;
      handleUpdateEntry(selectedEntry.id, { mood });
      setShowMoodPicker(false);
    },
    [selectedEntry, handleUpdateEntry],
  );

  const handleWeatherChange = useCallback(
    (weather: DiaryWeather) => {
      if (!selectedEntry) return;
      handleUpdateEntry(selectedEntry.id, { weather });
      setShowWeatherPicker(false);
    },
    [selectedEntry, handleUpdateEntry],
  );

  // Auto-resize title textarea height
  const autoResizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResizeTextarea(titleTextareaRef.current);
  }, [selectedDate, selectedEntry?.title, autoResizeTextarea]);

  // Debounced auto-save (separate timers for title and content to avoid cancelling each other)
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const contentSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleTitleChange = useCallback(
    (value: string) => {
      if (!selectedEntry) return;
      setEntries((prev) =>
        prev.map((e) => (e.id === selectedEntry.id ? { ...e, title: value } : e)),
      );
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = setTimeout(
        () => handleUpdateEntry(selectedEntry.id, { title: value }),
        800,
      );
    },
    [selectedEntry, handleUpdateEntry],
  );

  const handleContentChange = useCallback(
    (value: string) => {
      if (!selectedEntry) return;
      setEntries((prev) =>
        prev.map((e) => (e.id === selectedEntry.id ? { ...e, content: value } : e)),
      );
      if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
      contentSaveTimerRef.current = setTimeout(
        () => handleUpdateEntry(selectedEntry.id, { content: value }),
        800,
      );
    },
    [selectedEntry, handleUpdateEntry],
  );

  // --- Cloud Single-file Sync ---
  const syncEntryFromCloud = useCallback(
    async (filePath: string): Promise<DiaryEntry | null> => {
      try {
        const result = await diaryFileApi.readFile(filePath);
        if (!result.content) return null;
        const entry: DiaryEntry =
          typeof result.content === 'string'
            ? JSON.parse(result.content)
            : (result.content as DiaryEntry);
        if (!entry.date && entry.createdAt) entry.date = toDateString(new Date(entry.createdAt));
        const normalized: DiaryEntry = {
          ...entry,
          title: entry.title || '',
          content: entry.content || '',
          date: entry.date || getToday(),
        };
        fsSaveFile(filePath, normalized);
        return normalized;
      } catch (error) {
        console.error('[Diary] syncEntryFromCloud failed:', filePath, error);
        return null;
      }
    },
    [fsSaveFile],
  );

  // --- Agent Action Listener ---
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'CREATE_ENTRY': {
          const filePath = action.params?.filePath;
          if (!filePath) return 'error: missing filePath';
          const entry = await syncEntryFromCloud(filePath);
          if (!entry) return 'error: failed to sync entry from cloud';
          setEntries((prev) => {
            const filtered = prev.filter((e) => e.id !== entry.id);
            return [...filtered, entry];
          });
          setSelectedDate(entry.date);
          setSelectedEntryId(entry.id);
          setIsEditing(false);
          if (isCompact) setCompactView('editor');
          return `success:${entry.id}`;
        }
        case 'UPDATE_ENTRY': {
          const filePath = action.params?.filePath;
          if (!filePath) return 'error: missing filePath';
          const entry = await syncEntryFromCloud(filePath);
          if (!entry) return 'error: failed to sync entry from cloud';
          setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
          return 'success';
        }
        case 'DELETE_ENTRY': {
          const entryId = action.params?.entryId;
          if (!entryId) return 'error: missing entryId';
          removeByPath(getEntryFilePath(entryId));
          setEntries((prev) => prev.filter((e) => e.id !== entryId));
          if (isCompact) setCompactView('calendar');
          return 'success';
        }
        case 'SELECT_ENTRY': {
          const entryId = action.params?.entryId;
          if (!entryId) return 'error: missing entryId';
          const entry = entries.find((e) => e.id === entryId);
          if (entry) handleSelectDate(entry.date, entry.id);
          return 'success';
        }
        case 'SELECT_DATE': {
          const date = action.params?.date;
          if (!date) return 'error: missing date';
          handleSelectDate(date);
          return 'success';
        }
        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [syncEntryFromCloud, removeByPath, entries, isCompact, handleSelectDate],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Diary',
          windowStyle: { width: 800, height: 600 },
        });
        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Diary',
          windowStyle: { width: 800, height: 600 },
        });
        reportLifecycle(AppLifecycle.DOM_READY);
        try {
          await fetchVibeInfo();
        } catch (error) {
          console.warn('[Diary] fetchVibeInfo failed:', error);
        }
        try {
          await initFromCloud();
        } catch (error) {
          console.warn('[Diary] Cloud init failed:', error);
        }
        const loaded = loadEntriesFromFS();
        if (loaded.length > 0) setEntries(loaded);

        const savedState = loadState();
        if (savedState?.selectedDate) {
          setSelectedDate(savedState.selectedDate);
          const parts = savedState.selectedDate.split('-');
          setCurrentMonth(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1));
        }
        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Diary] Init error:', error);
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

  // ============ Render Helpers ============

  // Calendar sidebar
  const renderCalendar = () => (
    <>
      <div className={styles.monthNav}>
        <button className={styles.monthNavBtn} onClick={() => changeMonth(-1)}>
          {Icons.chevronLeft}
        </button>
        <span className={styles.monthLabel}>
          {currentMonth.toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', {
            year: 'numeric',
            month: 'long',
          })}
        </span>
        <button className={styles.monthNavBtn} onClick={() => changeMonth(1)}>
          {Icons.chevronRight}
        </button>
      </div>

      <div className={styles.weekdayHeaders}>
        {weekdayLabels.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className={styles.calendarGrid}>
        {calendarDays.map((day, index) => {
          if (!day) return <div key={`e-${index}`} />;
          const dateStr = toDateString(day);
          const dayEntries = entriesByDate.get(dateStr) || [];
          const hasEntry = dayEntries.length > 0;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const firstMood = dayEntries.find((e) => e.mood)?.mood;
          return (
            <motion.button
              key={dateStr}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              className={`${styles.calendarDay} ${hasEntry ? styles.hasEntry : ''} ${isSelected ? styles.selected : ''} ${isToday ? styles.isToday : ''}`}
              onClick={() => handleSelectDate(dateStr)}
            >
              {day.getDate()}
              {hasEntry && firstMood && MOOD_CONFIG[firstMood] && (
                <span
                  className={styles.dayMoodDot}
                  style={{ background: MOOD_CONFIG[firstMood].color }}
                />
              )}
              {dayEntries.length > 1 && (
                <span className={styles.dayEntryCount}>{dayEntries.length}</span>
              )}
              {isSelected && (
                <HandDrawnCircle
                  color={isSelected ? '#fff' : '#8b4513'}
                  style={{ width: 38, height: 38, top: -3, left: -3, opacity: 0.5 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </>
  );

  // Entry list (sidebar)
  const renderDiaryList = () => (
    <div className={styles.diaryList}>
      {sortedEntries.length === 0 ? (
        <div className={styles.diaryListEmpty}>{t('noDiaries')}</div>
      ) : (
        sortedEntries.map((entry) => {
          const isActive = entry.id === selectedEntry?.id;
          return (
            <motion.button
              key={entry.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`${styles.diaryListItem} ${isActive ? styles.diaryListItemActive : ''}`}
              onClick={() => handleSelectDate(entry.date, entry.id)}
            >
              <div className={styles.diaryListItemDate}>
                {entry.date.slice(5).replace('-', '/')}
              </div>
              <div className={styles.diaryListItemContent}>
                <div className={styles.diaryListItemTitle}>{entry.title || t('untitled')}</div>
                {entry.content && (
                  <div className={styles.diaryListItemPreview}>
                    {entry.content.replace(/\{\{\/?\w+\}\}/g, '').slice(0, 40)}
                  </div>
                )}
              </div>
              {entry.mood && (
                <div className={styles.diaryListItemMood}>
                  <MoodIcon mood={entry.mood} size={14} />
                </div>
              )}
            </motion.button>
          );
        })
      )}
    </div>
  );
  const renderEditorContent = () => {
    if (!selectedEntry) {
      return (
        <div className={styles.noEntryState}>
          <p className={styles.noEntryText}>{t('noEntryForDate')}</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={styles.createBtn}
            onClick={() => handleCreateEntry(selectedDate)}
          >
            <span className={styles.createBtnIcon}>{Icons.plus}</span>
            {t('createEntry')}
          </motion.button>
        </div>
      );
    }

    return (
      <>
        {/* Switch between multiple entries on the same day */}
        {selectedDateEntries.length > 1 && (
          <div className={styles.entryTabs}>
            {selectedDateEntries.map((entry, idx) => (
              <button
                key={entry.id}
                className={`${styles.entryTab} ${entry.id === selectedEntry.id ? styles.entryTabActive : ''}`}
                onClick={() => setSelectedEntryId(entry.id)}
              >
                {entry.mood && <MoodIcon mood={entry.mood} size={14} />}
                <span className={styles.entryTabLabel}>
                  {entry.title || `${t('entryIndex', { index: idx + 1 })}`}
                </span>
                <span className={styles.entryTabTime}>{formatTime(entry.createdAt)}</span>
              </button>
            ))}
            <button
              className={styles.entryTabAdd}
              onClick={() => handleCreateEntry(selectedDate)}
              title={t('newDiary')}
            >
              {Icons.plus}
            </button>
          </div>
        )}

        {/* Date title + mood/weather + action buttons */}
        <div className={styles.editorHeader}>
          <div className={styles.editorMeta}>
            <span className={styles.editorDate} style={{ position: 'relative' }}>
              {formatDateFull(selectedDate, i18n.language)}
              <HandDrawnUnderline width={200} color="#8b4513" style={{ bottom: -8, left: 0 }} />
            </span>
            {saveStatus && (
              <span className={styles.editorStatus}>
                {saveStatus === 'saving' ? t('saving') : t('saved')}
              </span>
            )}
          </div>
          <div className={styles.editorIcons}>
            {/* Mood selector */}
            <div className={styles.pickerWrapper}>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 8 }}
                className={styles.iconBtn}
                onClick={() => {
                  setShowMoodPicker(!showMoodPicker);
                  setShowWeatherPicker(false);
                }}
                title={t('moodLabel')}
              >
                {selectedEntry.mood ? (
                  <MoodIcon mood={selectedEntry.mood} size={18} />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="#a1887f"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="8" y1="15" x2="16" y2="15" />
                    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
                    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
                  </svg>
                )}
              </motion.button>
              <AnimatePresence>
                {showMoodPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={styles.pickerDropdown}
                  >
                    {(Object.keys(MOOD_CONFIG) as DiaryMood[]).map((mood) => (
                      <button
                        key={mood}
                        className={`${styles.pickerOption} ${selectedEntry.mood === mood ? styles.pickerActive : ''}`}
                        onClick={() => handleMoodChange(mood)}
                      >
                        <MoodIcon mood={mood} size={16} />
                        <span>{t(MOOD_CONFIG[mood].labelKey)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Weather selector */}
            <div className={styles.pickerWrapper}>
              <motion.button
                whileHover={{ scale: 1.1, rotate: -8 }}
                className={styles.iconBtn}
                onClick={() => {
                  setShowWeatherPicker(!showWeatherPicker);
                  setShowMoodPicker(false);
                }}
                title={t('weatherLabel')}
              >
                {selectedEntry.weather ? (
                  <WeatherIcon weather={selectedEntry.weather} size={18} />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="#a1887f"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                )}
              </motion.button>
              <AnimatePresence>
                {showWeatherPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={styles.pickerDropdown}
                  >
                    {(Object.keys(WEATHER_CONFIG) as DiaryWeather[]).map((w) => (
                      <button
                        key={w}
                        className={`${styles.pickerOption} ${selectedEntry.weather === w ? styles.pickerActive : ''}`}
                        onClick={() => handleWeatherChange(w)}
                      >
                        <WeatherIcon weather={w} size={16} />
                        <span>{t(WEATHER_CONFIG[w].labelKey)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Edit/preview toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              className={styles.iconBtn}
              onClick={() => setIsEditing(!isEditing)}
              title={isEditing ? t('viewMode') : t('editMode')}
            >
              {isEditing ? Icons.eye : Icons.edit}
            </motion.button>

            {/* Delete */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              className={`${styles.iconBtn} ${styles.deleteBtn}`}
              onClick={() => handleDeleteEntry(selectedEntry.id)}
              title={t('deleteDiary')}
            >
              {Icons.trash}
            </motion.button>
          </div>
        </div>

        {/* Title */}
        {isEditing ? (
          <textarea
            ref={titleTextareaRef}
            className={styles.titleInput}
            placeholder={t('titlePlaceholder')}
            value={selectedEntry.title}
            rows={1}
            onChange={(e) => {
              handleTitleChange(e.target.value);
              autoResizeTextarea(e.target);
            }}
          />
        ) : (
          selectedEntry.title && <h2 className={styles.titleDisplay}>{selectedEntry.title}</h2>
        )}

        {/* Content */}
        {isEditing ? (
          <MarkdownEditor
            content={selectedEntry.content}
            placeholder={t('contentPlaceholder')}
            onChange={handleContentChange}
            className={styles.contentArea}
          />
        ) : (
          <div className={styles.readContent}>
            {selectedEntry.content ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                {renderDiaryContent(selectedEntry.content)}
              </motion.div>
            ) : (
              <p className={styles.emptyContent}>{t('emptyDiary')}</p>
            )}
          </div>
        )}

        {/* Word count + time */}
        <div className={styles.wordCount}>
          <span>{formatTime(selectedEntry.createdAt)}</span>
          <span>{t('wordCount', { count: selectedEntry.content.length })}</span>
        </div>

        {/* Pen nib decoration */}
        <div className={styles.penDecoration}>{Icons.pen}</div>
      </>
    );
  };

  // ============ Loading ============
  if (isLoading) {
    return (
      <div className={styles.diary} ref={containerRef}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  // ============ Compact Mode: Edit View ============
  if (isCompact && compactView === 'editor') {
    return (
      <div className={styles.diary} ref={containerRef}>
        <div className={styles.compactEditorView}>
          <div className={styles.compactEditorHeader}>
            <button className={styles.backBtn} onClick={() => setCompactView('calendar')}>
              {Icons.chevronLeft}
            </button>
            <span className={styles.compactEditorTitle}>
              {selectedEntry?.title || formatDateFull(selectedDate, i18n.language)}
            </span>
          </div>
          <div className={styles.editorBody}>{renderEditorContent()}</div>
        </div>
      </div>
    );
  }

  // ============ Compact Mode: Calendar View ============
  if (isCompact) {
    return (
      <div className={styles.diary} ref={containerRef}>
        <div className={styles.compactCalendarView}>
          <div className={styles.compactCalendarToolbar}>
            <div className={styles.sidebarTitle}>
              <span className={styles.bookIcon}>{Icons.book}</span>
              <span className={styles.titleText}>{t('appTitle')}</span>
            </div>
            <button
              className={styles.newBtn}
              onClick={() => handleCreateEntry(selectedDate)}
              title={t('newDiary')}
            >
              {Icons.plus}
            </button>
          </div>
          {renderCalendar()}
          <div className={styles.sidebarFooter}>
            <span className={styles.entryCount}>{entries.length}</span> {t('totalEntries')}
          </div>
        </div>
      </div>
    );
  }

  // ============ Standard Two-column Layout ============
  return (
    <div className={styles.diary} ref={containerRef}>
      {/* Calendar sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitle}>
            <span className={styles.bookIcon} style={{ position: 'relative' }}>
              {Icons.book}
              <HandDrawnStar style={{ top: -8, right: -10 }} color="#f59e0b" />
            </span>
            <span className={styles.titleText}>{t('appTitle')}</span>
          </div>
        </div>
        <button
          className={styles.calendarToggle}
          onClick={() => setCalendarCollapsed(!calendarCollapsed)}
        >
          <span
            className={styles.calendarToggleIcon}
            style={{ transform: calendarCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            {Icons.chevronLeft}
          </span>
          <span className={styles.calendarToggleLabel}>
            {currentMonth.toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', {
              year: 'numeric',
              month: 'long',
            })}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {!calendarCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden', flexShrink: 0 }}
            >
              {renderCalendar()}
            </motion.div>
          )}
        </AnimatePresence>
        {renderDiaryList()}
        <div className={styles.sidebarActions}>
          <button
            className={styles.newBtn}
            onClick={() => handleCreateEntry(selectedDate)}
            title={t('newDiary')}
          >
            {Icons.plus}
          </button>
        </div>
        <div className={styles.sidebarFooter}>
          <span className={styles.entryCount}>{entries.length}</span> {t('totalEntries')}
        </div>
      </div>

      {/* Editor area (with page turn animation) */}
      <div className={styles.main}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={selectedDate}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className={styles.editorBody}
          >
            {renderEditorContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Diary;
