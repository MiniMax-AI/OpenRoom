import React, { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  MessageCircle,
  Twitter,
  Music,
  BookOpen,
  Image,
  Circle,
  LayoutGrid,
  Mail,
  Crown,
  Shield,
  Newspaper,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import ChatPanel from '../ChatPanel';
import AppWindow from '../AppWindow';
import { getWindows, subscribe, openWindow } from '@/lib/windowManager';
import { getDesktopApps } from '@/lib/appRegistry';
import { reportUserOsAction } from '@/lib/vibeContainerMock';
import { setReportUserActions } from '@/lib';
import i18next from 'i18next';
import { seedMetaFiles } from '@/lib/seedMeta';
import styles from './index.module.scss';

function useWindows() {
  return useSyncExternalStore(subscribe, getWindows);
}

/** Lucide icon name to component mapping */
const ICON_MAP: Record<string, LucideIcon> = {
  Twitter,
  Music,
  BookOpen,
  Image,
  Circle,
  LayoutGrid,
  Mail,
  Crown,
  Shield,
  Newspaper,
  Radio,
  MessageCircle,
};

const DESKTOP_APPS = getDesktopApps().map((app) => ({
  ...app,
  IconComp: ICON_MAP[app.icon] || Circle,
}));

const Shell: React.FC = () => {
  const [chatOpen, setChatOpen] = useState(false);
  const [reportEnabled, setReportEnabled] = useState(true);
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const windows = useWindows();

  const handleToggleReport = useCallback(() => {
    setReportEnabled((prev) => {
      const next = !prev;
      setReportUserActions(next);
      return next;
    });
  }, []);

  const handleToggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'en' ? 'zh' : 'en';
      i18next.changeLanguage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    seedMetaFiles();
  }, []);

  return (
    <div className={styles.shell}>
      {/* Desktop with app icons */}
      <div className={styles.desktop}>
        <div className={styles.iconGrid}>
          {DESKTOP_APPS.map((app) => (
            <button
              key={app.appId}
              className={styles.appIcon}
              onDoubleClick={() => {
                openWindow(app.appId);
                reportUserOsAction('OPEN_APP', { app_id: String(app.appId) });
              }}
              title={`Double-click to open ${app.displayName}`}
            >
              <div
                className={styles.iconCircle}
                style={{ background: `${app.color}22`, borderColor: `${app.color}44` }}
              >
                <app.IconComp size={24} color={app.color} />
              </div>
              <span className={styles.iconLabel}>{app.displayName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* App windows */}
      {windows.map((win) => (
        <AppWindow key={win.appId} win={win} />
      ))}

      {/* Chat Panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}

      <button
        className={`${styles.langToggle} ${chatOpen ? styles.chatOpen : ''}`}
        onClick={handleToggleLang}
        title={lang === 'en' ? 'Switch to Chinese' : 'Switch to English'}
      >
        {lang === 'en' ? 'EN' : 'ZH'}
      </button>

      <button
        className={`${styles.reportToggle} ${chatOpen ? styles.chatOpen : ''} ${reportEnabled ? styles.reportOn : styles.reportOff}`}
        onClick={handleToggleReport}
        title={reportEnabled ? 'User action reporting: ON' : 'User action reporting: OFF'}
      >
        <Radio size={16} />
      </button>

      <button
        className={`${styles.chatToggle} ${chatOpen ? styles.chatOpen : ''}`}
        onClick={() => setChatOpen(!chatOpen)}
        title="Toggle Chat"
      >
        <MessageCircle size={20} />
      </button>
    </div>
  );
};

export default Shell;
