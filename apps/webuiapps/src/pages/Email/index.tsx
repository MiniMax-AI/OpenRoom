import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useFileSystem,
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  createAppFileApi,
  fetchVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 11;
const APP_NAME = 'email';
const EMAILS_DIR = '/emails';
const STATE_FILE = '/state.json';

// Create file API with app path prefix (module-level singleton, stable reference)
const emailFileApi = createAppFileApi(APP_NAME);

const getEmailFilePath = (emailId: string): string => `${EMAILS_DIR}/${emailId}.json`;

// ============ Type Definitions ============
export type EmailAction =
  | { type: 'READ_EMAIL'; payload: { emailId: string } }
  | { type: 'STAR_EMAIL'; payload: { emailId: string } }
  | { type: 'UNSTAR_EMAIL'; payload: { emailId: string } }
  | { type: 'DELETE_EMAIL'; payload: { emailId: string } };

interface EmailAddress {
  name: string;
  address: string;
}

interface Email {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  content: string;
  timestamp: number;
  isRead: boolean;
  isStarred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash';
}

type FolderType = 'inbox' | 'sent' | 'drafts' | 'trash';

interface AppState {
  selectedEmailId: string | null;
  currentFolder: FolderType;
}

// ============ Default State ============
// const DEFAULT_STATE: AppState = {
//   selectedEmailId: null,
//   currentFolder: 'inbox',
// };

// ============ Utility Functions ============
const formatEmailTime = (timestamp: number): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDetailTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getInitial = (name: string): string => {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
};

const getEmailPreview = (content: string, maxLen = 80): string => {
  const text = content.replace(/\n/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
};

// ============ SVG Icon Components ============
const Icons = {
  inbox: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5v-3h3.56c.69 1.19 1.97 2 3.45 2s2.75-.81 3.45-2H19v3zm0-5h-4.99c0 1.1-.9 2-2 2s-2-.9-2-2H5V5h14v9z" />
    </svg>
  ),
  sent: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  ),
  drafts: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M21.99 8c0-.72-.37-1.35-.94-1.7L12 1 2.95 6.3C2.38 6.65 2 7.28 2 8v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2l-.01-10zm-2 0v.01L12 13 4 8l8-4.68L19.99 8zM4 18V10.2l8 5 8-5V18H4z" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  ),
  star: (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  starFilled: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  ),
  emailEmpty: (
    <svg
      viewBox="0 0 24 24"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  ),
};

// ============ Folder Configuration ============
const FOLDER_CONFIG: {
  key: FolderType;
  icon: React.ReactNode;
  labelKey: string;
}[] = [
  { key: 'inbox', icon: Icons.inbox, labelKey: 'inbox' },
  { key: 'sent', icon: Icons.sent, labelKey: 'sent' },
  { key: 'drafts', icon: Icons.drafts, labelKey: 'drafts' },
  { key: 'trash', icon: Icons.trash, labelKey: 'trash' },
];

// ============ Sub-component: Email List Item ============
interface EmailItemProps {
  email: Email;
  isSelected: boolean;
  onSelect: (emailId: string) => void;
  onStar: (emailId: string) => void;
  onUnstar: (emailId: string) => void;
  onDelete: (emailId: string) => void;
}

const EmailItem: React.FC<EmailItemProps> = ({
  email,
  isSelected,
  onSelect,
  onStar,
  onUnstar,
  onDelete,
}) => {
  const { t } = useTranslation('email');
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (email.isStarred) {
      onUnstar(email.id);
    } else {
      onStar(email.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(email.id);
  };

  return (
    <div
      className={`${styles.emailItem} ${isSelected ? styles.selected : ''} ${!email.isRead ? styles.unread : ''}`}
      onClick={() => onSelect(email.id)}
    >
      {!email.isRead ? (
        <div className={styles.unreadDot} />
      ) : (
        <div className={styles.readPlaceholder} />
      )}
      <button
        className={`${styles.emailStarBtn} ${email.isStarred ? styles.starred : ''}`}
        onClick={handleStarClick}
      >
        {email.isStarred ? Icons.starFilled : Icons.star}
      </button>
      <div className={styles.emailContent}>
        <div className={styles.emailTopRow}>
          <span className={styles.emailSender}>{email.from.name || email.from.address}</span>
          <span className={styles.emailTime}>{formatEmailTime(email.timestamp)}</span>
        </div>
        <div className={styles.emailBottomRow}>
          <span className={styles.emailSubject}>{email.subject || t('noSubject')}</span>
          {email.content && (
            <>
              <span className={styles.emailSeparator}> - </span>
              <span className={styles.emailPreview}>{getEmailPreview(email.content)}</span>
            </>
          )}
        </div>
      </div>
      <button className={styles.emailDeleteBtn} onClick={handleDeleteClick}>
        {Icons.delete}
      </button>
    </div>
  );
};

// ============ Sub-component: Email Detail ============
interface EmailDetailProps {
  email: Email;
  onBack: () => void;
}

const EmailDetail: React.FC<EmailDetailProps> = ({ email, onBack }) => {
  const { t } = useTranslation('email');

  const toStr = email.to.map((a) => a.name || a.address).join(', ');
  const ccStr = email.cc.length > 0 ? email.cc.map((a) => a.name || a.address).join(', ') : '';

  return (
    <div className={styles.detailView}>
      <div className={styles.detailToolbar}>
        <button className={styles.backBtn} onClick={onBack}>
          {Icons.back}
        </button>
      </div>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailSubject}>{email.subject || t('noSubject')}</h2>
        <div className={styles.detailMeta}>
          <div className={styles.detailAvatar}>
            {getInitial(email.from.name || email.from.address)}
          </div>
          <div className={styles.detailSenderInfo}>
            <div className={styles.detailSenderRow}>
              <span className={styles.detailSenderName}>{email.from.name}</span>
              <span className={styles.detailSenderAddress}>&lt;{email.from.address}&gt;</span>
            </div>
            <div className={styles.detailRecipients}>
              {t('to')}: {toStr}
              {ccStr && (
                <>
                  {' | '}
                  {t('cc')}: {ccStr}
                </>
              )}
            </div>
          </div>
          <span className={styles.detailTime}>{formatDetailTime(email.timestamp)}</span>
        </div>
      </div>

      <div className={styles.detailBody}>{email.content}</div>

      <div className={styles.readOnlyNotice}>
        {Icons.lock}
        <span className={styles.noticeText}>{t('readOnlyNotice')}</span>
      </div>
    </div>
  );
};

// ============ Main Component: Email Page ============
const EmailPage: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderType>('inbox');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation('email');

  // File system hook
  const {
    saveFile: fsSaveFile,
    syncToCloud,
    deleteFromCloud,
    initFromCloud,
    getChildrenByPath,
    getByPath,
    updateNode,
    removeByPath,
  } = useFileSystem({ fileApi: emailFileApi });

  // ============ File System Helpers ============

  const loadEmailsFromFS = useCallback((): Email[] => {
    const children = getChildrenByPath(EMAILS_DIR);
    return children
      .filter((node) => node.type === 'file' && node.content !== null && node.content !== undefined)
      .map((node) => {
        let email: Email;
        if (typeof node.content === 'string') {
          try {
            email = JSON.parse(node.content) as Email;
          } catch {
            console.warn('[Email] Failed to parse email content:', node.path);
            return null;
          }
        } else {
          email = node.content as Email;
        }
        return {
          ...email,
          from: email.from || { name: 'Unknown Sender', address: 'unknown@example.com' },
          to: email.to || [],
          cc: email.cc || [],
          content: email.content || '',
          isRead: email.isRead ?? false,
          isStarred: email.isStarred ?? false,
          folder: email.folder || 'inbox',
        };
      })
      .filter((email): email is Email => email !== null && email !== undefined && !!email.id)
      .sort((a, b) => b.timestamp - a.timestamp);
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
        console.error('[Email] Failed to sync state to cloud:', error);
      }
    },
    [fsSaveFile, syncToCloud],
  );

  // ============ Business Logic: User Actions ============

  const handleSelectEmail = useCallback(
    async (emailId: string) => {
      setSelectedEmailId(emailId);

      // Mark as read
      const email = emails.find((e) => e.id === emailId);
      if (email && !email.isRead) {
        setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isRead: true } : e)));

        const filePath = getEmailFilePath(emailId);
        const node = getByPath(filePath);
        if (node) {
          const data = node.content as Email;
          const updated = { ...data, isRead: true };
          updateNode(node.id, { content: updated });
          try {
            await syncToCloud(filePath, updated);
          } catch (error) {
            console.error('[Email] Failed to sync read state:', error);
          }
        }

        reportAction(APP_ID, 'READ_EMAIL', { emailId });
      }

      saveState({ selectedEmailId: emailId, currentFolder });
    },
    [emails, getByPath, updateNode, syncToCloud, saveState, currentFolder],
  );

  const handleStarEmail = useCallback(
    async (emailId: string) => {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: true } : e)));

      const filePath = getEmailFilePath(emailId);
      const node = getByPath(filePath);
      if (node) {
        const data = node.content as Email;
        const updated = { ...data, isStarred: true };
        updateNode(node.id, { content: updated });
        try {
          await syncToCloud(filePath, updated);
        } catch (error) {
          console.error('[Email] Failed to sync star:', error);
        }
      }

      reportAction(APP_ID, 'STAR_EMAIL', { emailId });
    },
    [getByPath, updateNode, syncToCloud],
  );

  const handleUnstarEmail = useCallback(
    async (emailId: string) => {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: false } : e)));

      const filePath = getEmailFilePath(emailId);
      const node = getByPath(filePath);
      if (node) {
        const data = node.content as Email;
        const updated = { ...data, isStarred: false };
        updateNode(node.id, { content: updated });
        try {
          await syncToCloud(filePath, updated);
        } catch (error) {
          console.error('[Email] Failed to sync unstar:', error);
        }
      }

      reportAction(APP_ID, 'UNSTAR_EMAIL', { emailId });
    },
    [getByPath, updateNode, syncToCloud],
  );

  const handleDeleteEmail = useCallback(
    async (emailId: string) => {
      const filePath = getEmailFilePath(emailId);

      if (selectedEmailId === emailId) {
        setSelectedEmailId(null);
      }

      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      removeByPath(filePath);

      try {
        await deleteFromCloud(filePath);
      } catch (error) {
        console.error('[Email] Failed to delete email from cloud:', error);
      }

      reportAction(APP_ID, 'DELETE_EMAIL', { emailId });
    },
    [selectedEmailId, removeByPath, deleteFromCloud],
  );

  const handleBack = useCallback(() => {
    setSelectedEmailId(null);
    saveState({ selectedEmailId: null, currentFolder });
  }, [saveState, currentFolder]);

  const handleFolderChange = useCallback(
    (folder: FolderType) => {
      setCurrentFolder(folder);
      setSelectedEmailId(null);
      saveState({ selectedEmailId: null, currentFolder: folder });
    },
    [saveState],
  );

  // Debounced state save
  const stateTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!isInitialized) return;

    if (stateTimerRef.current) {
      clearTimeout(stateTimerRef.current);
    }
    stateTimerRef.current = setTimeout(() => {
      saveState({ selectedEmailId, currentFolder });
    }, 1000);

    return () => {
      if (stateTimerRef.current) {
        clearTimeout(stateTimerRef.current);
      }
    };
  }, [selectedEmailId, currentFolder, isInitialized, saveState]);

  // ============ Cloud Single-File Sync Helper ============
  const syncEmailFromCloud = useCallback(
    async (filePath: string): Promise<Email | null> => {
      try {
        const result = await emailFileApi.readFile(filePath);
        if (!result.content) {
          console.warn('[Email] syncEmailFromCloud: empty content for', filePath);
          return null;
        }

        const email: Email =
          typeof result.content === 'string'
            ? JSON.parse(result.content)
            : (result.content as Email);

        const normalized: Email = {
          ...email,
          from: email.from || { name: 'Unknown Sender', address: 'unknown@example.com' },
          to: email.to || [],
          cc: email.cc || [],
          content: email.content || '',
          isRead: email.isRead ?? false,
          isStarred: email.isStarred ?? false,
          folder: email.folder || 'inbox',
        };

        fsSaveFile(filePath, normalized);
        return normalized;
      } catch (error) {
        console.error('[Email] syncEmailFromCloud failed:', filePath, error);
        return null;
      }
    },
    [fsSaveFile],
  );

  // ============ Agent Action Listener ============
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'COMPOSE_EMAIL': {
          const filePath = action.params?.filePath;
          if (!filePath) return 'error: missing filePath';

          const email = await syncEmailFromCloud(filePath);
          if (!email) return 'error: failed to sync email from cloud';

          setEmails((prev) => [email, ...prev]);
          return 'success';
        }

        case 'DELETE_EMAIL': {
          const emailId = action.params?.emailId;
          if (!emailId) return 'error: missing emailId';

          const filePath = getEmailFilePath(emailId);
          removeByPath(filePath);

          if (selectedEmailId === emailId) {
            setSelectedEmailId(null);
          }

          setEmails((prev) => prev.filter((e) => e.id !== emailId));
          return 'success';
        }

        case 'MARK_READ': {
          const emailId = action.params?.emailId;
          if (!emailId) return 'error: missing emailId';

          const filePath = getEmailFilePath(emailId);
          const email = await syncEmailFromCloud(filePath);
          if (!email) return 'error: failed to sync email from cloud';

          setEmails((prev) => prev.map((e) => (e.id === emailId ? email : e)));
          return 'success';
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [syncEmailFromCloud, removeByPath, selectedEmailId],
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
          name: 'Email',
          windowStyle: { width: 700, height: 600 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Email',
          windowStyle: { width: 700, height: 600 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Fetch user / character / system settings (language auto-syncs to i18n)
        try {
          await fetchVibeInfo();
        } catch (error) {
          console.warn('[Email] fetchVibeInfo failed:', error);
        }

        try {
          await initFromCloud();
        } catch (error) {
          console.warn('[Email] Cloud init failed, using local store:', error);
        }

        const loadedEmails = loadEmailsFromFS();
        if (loadedEmails.length > 0) {
          setEmails(loadedEmails);
        }

        const savedState = loadState();
        if (savedState) {
          if (savedState.currentFolder) {
            setCurrentFolder(savedState.currentFolder);
          }
          if (savedState.selectedEmailId) {
            setSelectedEmailId(savedState.selectedEmailId);
          }
        }

        setIsInitialized(true);
        setIsLoading(false);

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Email] Init error:', error);
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

  // ============ Filter Emails by Current Folder ============
  const filteredEmails = emails.filter((e) => e.folder === currentFolder);
  const unreadCount = emails.filter((e) => e.folder === 'inbox' && !e.isRead).length;
  const selectedEmail = selectedEmailId
    ? emails.find((e) => e.id === selectedEmailId) || null
    : null;

  // ============ Render ============
  return (
    <div className={styles.email}>
      {selectedEmail ? (
        /* Email detail view */
        <EmailDetail email={selectedEmail} onBack={handleBack} />
      ) : (
        <>
          {/* Folder tabs */}
          <div className={styles.folderTabs}>
            {FOLDER_CONFIG.map((folder) => (
              <button
                key={folder.key}
                className={`${styles.folderTab} ${currentFolder === folder.key ? styles.active : ''}`}
                onClick={() => handleFolderChange(folder.key)}
              >
                <span className={styles.folderIcon}>{folder.icon}</span>
                {t(folder.labelKey)}
                {folder.key === 'inbox' && unreadCount > 0 && (
                  <span className={styles.folderBadge}>{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Email list */}
          <div className={styles.emailList}>
            {isLoading ? (
              <div className={styles.emptyState}>
                <div className={styles.spinner} />
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>{Icons.emailEmpty}</div>
                <p>{t('empty')}</p>
              </div>
            ) : (
              filteredEmails.map((email) => (
                <EmailItem
                  key={email.id}
                  email={email}
                  isSelected={selectedEmailId === email.id}
                  onSelect={handleSelectEmail}
                  onStar={handleStarEmail}
                  onUnstar={handleUnstarEmail}
                  onDelete={handleDeleteEmail}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EmailPage;
