/**
 * Simple window manager
 * Manages App window states on the desktop
 */

import { getAppDisplayName, getAppDefaultSize } from './appRegistry';

export interface WindowState {
  appId: number;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let windows: WindowState[] = [];
let nextZ = 100;
let offsetCounter = 0;

/**
 * Claim the next z-index value from the shared counter.
 * Used by both AppWindow (via focusWindow) and ChatPanel to participate
 * in the same stacking order — click either to bring it to front.
 */
export function claimZIndex(): number {
  return ++nextZ;
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getWindows(): WindowState[] {
  return windows;
}

export function openWindow(appId: number): void {
  const existing = windows.find((w) => w.appId === appId);
  if (existing) {
    // Focus existing window
    existing.zIndex = ++nextZ;
    existing.minimized = false;
    windows = [...windows];
    notify();
    return;
  }

  const size = getAppDefaultSize(appId);
  const offset = (offsetCounter++ % 5) * 30;
  const baseX =
    typeof window !== 'undefined' ? Math.floor((window.innerWidth - size.width) / 2) : 200;
  const baseY =
    typeof window !== 'undefined' ? Math.floor((window.innerHeight - size.height) / 2) : 150;

  const win: WindowState = {
    appId,
    title: getAppDisplayName(appId),
    x: Math.max(10, baseX + offset),
    y: Math.max(10, baseY + offset),
    width: size.width,
    height: size.height,
    zIndex: ++nextZ,
    minimized: false,
  };

  windows = [...windows, win];
  notify();
}

export function closeWindow(appId: number): void {
  windows = windows.filter((w) => w.appId !== appId);
  notify();
}

export function closeAllWindows(): void {
  windows = [];
  notify();
}

export function focusWindow(appId: number): void {
  const win = windows.find((w) => w.appId === appId);
  if (win) {
    win.zIndex = ++nextZ;
    win.minimized = false;
    windows = [...windows];
    notify();
  }
}

export function minimizeWindow(appId: number): void {
  const win = windows.find((w) => w.appId === appId);
  if (win) {
    win.minimized = true;
    windows = [...windows];
    notify();
  }
}

export function moveWindow(appId: number, x: number, y: number): void {
  const win = windows.find((w) => w.appId === appId);
  if (win) {
    win.x = x;
    win.y = y;
    windows = [...windows];
    notify();
  }
}

export function resizeWindow(appId: number, width: number, height: number): void {
  const win = windows.find((w) => w.appId === appId);
  if (win) {
    win.width = Math.max(300, width);
    win.height = Math.max(200, height);
    windows = [...windows];
    notify();
  }
}
