import React, { useState, useCallback, lazy, Suspense } from 'react';
import { Rnd } from 'react-rnd';
import { X, Minus, Maximize2 } from 'lucide-react';
import {
  type WindowState,
  closeWindow,
  focusWindow,
  minimizeWindow,
  moveWindow,
  resizeWindow,
} from '@/lib/windowManager';
import { getSourceDirToAppId } from '@/lib/appRegistry';
import { reportUserOsAction } from '@/lib/vibeContainerMock';
import styles from './index.module.scss';

/** Auto-discover all App pages via import.meta.glob, build appId to lazy component mapping */
const pageModules = import.meta.glob('../../pages/*/index.tsx') as Record<
  string,
  () => Promise<{ default: React.ComponentType }>
>;
const dirToAppId = getSourceDirToAppId();
const APP_COMPONENTS: Record<number, React.LazyExoticComponent<React.ComponentType>> = {};
for (const [path, loader] of Object.entries(pageModules)) {
  const dirMatch = path.match(/\/pages\/([^/]+)\//);
  if (!dirMatch) continue;
  const appId = dirToAppId[dirMatch[1]];
  if (appId) APP_COMPONENTS[appId] = lazy(loader);
}

interface Props {
  win: WindowState;
}

const AppWindow: React.FC<Props> = ({ win }) => {
  const [maximized, setMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const toggleMax = useCallback(() => {
    if (!maximized) {
      setPreMaxState({ x: win.x, y: win.y, width: win.width, height: win.height });
      // Inset from edges to keep the bottom dock (wallpaper, upload, chat toggle) accessible.
      const inset = 8;
      const dockHeight = 80;
      moveWindow(win.appId, inset, inset);
      resizeWindow(
        win.appId,
        window.innerWidth - inset * 2,
        window.innerHeight - inset * 2 - dockHeight,
      );
      setMaximized(true);
    } else {
      if (preMaxState) {
        moveWindow(win.appId, preMaxState.x, preMaxState.y);
        resizeWindow(win.appId, preMaxState.width, preMaxState.height);
      }
      setMaximized(false);
      setPreMaxState(null);
    }
  }, [maximized, preMaxState, win.appId, win.x, win.y, win.width, win.height]);

  const AppComp = APP_COMPONENTS[win.appId];
  if (!AppComp) return null;
  if (win.minimized) return null;

  return (
    <Rnd
      className={styles.window}
      data-testid={`app-window-${win.appId}`}
      size={{ width: win.width, height: win.height }}
      position={{ x: win.x, y: win.y }}
      minWidth={300}
      minHeight={200}
      bounds="window"
      dragHandleClassName={styles.titleBar}
      enableResizing={!maximized}
      disableDragging={maximized}
      style={{ zIndex: win.zIndex }}
      onMouseDown={() => focusWindow(win.appId)}
      onDragStop={(_, d) => moveWindow(win.appId, d.x, d.y)}
      onResizeStop={(_, __, ref, ___, pos) => {
        resizeWindow(win.appId, ref.offsetWidth, ref.offsetHeight);
        moveWindow(win.appId, pos.x, pos.y);
      }}
    >
      <div className={styles.windowInner}>
        <div className={styles.titleBar}>
          <span className={styles.title}>{win.title}</span>
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              onClick={() => minimizeWindow(win.appId)}
              title="Minimize"
            >
              <Minus size={12} />
            </button>
            <button
              className={styles.actionBtn}
              onClick={toggleMax}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              <Maximize2 size={12} />
            </button>
            <button
              className={`${styles.actionBtn} ${styles.closeBtn}`}
              onClick={() => {
                closeWindow(win.appId);
                reportUserOsAction('CLOSE_APP', { app_id: String(win.appId) });
              }}
              title="Close"
              data-testid={`window-close-${win.appId}`}
            >
              <X size={12} />
            </button>
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
              <AppComp />
            </Suspense>
          </div>
        </div>
      </div>
    </Rnd>
  );
};

export default AppWindow;
