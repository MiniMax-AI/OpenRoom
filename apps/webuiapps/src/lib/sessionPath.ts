/**
 * Global session path holder.
 * Set by ChatPanel when character/mod selection changes.
 * Used by diskStorage and file tools to scope all file operations.
 */

let _sessionPath = '';

const LS_SESSION_KEY = 'openroom_session_path';

export function setSessionPath(path: string): void {
  _sessionPath = path;
  // Persist so non-ChatPanel apps (Diary, etc.) can recover the session scope
  try {
    localStorage.setItem(LS_SESSION_KEY, path);
  } catch {
    // localStorage unavailable
  }
}

export function getSessionPath(): string {
  if (_sessionPath) return _sessionPath;
  // Recover from localStorage if not yet set in this lifecycle
  try {
    const stored = localStorage.getItem(LS_SESSION_KEY);
    if (stored) {
      _sessionPath = stored;
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return _sessionPath;
}
