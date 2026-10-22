import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  MessageCircle,
  Twitter,
  Youtube,
  Flame,
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
  Video,
  VideoOff,
  X,
  Upload,
  FileImage,
  FileArchive,
  GripHorizontal,
  type LucideIcon,
} from 'lucide-react';
import ChatWindow from '../ChatWindow';
import HostedHUD from '../HostedHUD';
import AppWindow from '../AppWindow';
import { getWindows, subscribe, openWindow, claimZIndex } from '@/lib/windowManager';
import { getDesktopApps } from '@/lib/appRegistry';
import { reportUserOsAction, onOSEvent } from '@/lib/vibeContainerMock';
import { setReportUserActions, extractCard } from '@/lib';
import type { ExtractResult, Manifest } from '@/lib';
import { buildModPrompt } from './modPrompt';
import { chat, loadConfig } from '@/lib/llmClient';
import {
  generateModId,
  addMod,
  setActiveMod,
  saveModCollection,
  loadModCollectionSync,
  DEFAULT_MOD_COLLECTION,
} from '@/lib/modManager';
import type { ModConfig } from '@/lib/modManager';
import i18next from 'i18next';
import { seedMetaFiles } from '@/lib/seedMeta';
import { logger } from '@/lib/logger';
import styles from './index.module.scss';

function useWindows() {
  return useSyncExternalStore(subscribe, getWindows);
}

/** Lucide icon name to component mapping */
export const ICON_MAP: Record<string, LucideIcon> = {
  Twitter,
  Youtube,
  Music,
  BookOpen,
  Image,
  Flame,
  Circle,
  LayoutGrid,
  Mail,
  Crown,
  Shield,
  Newspaper,
  Radio,
  MessageCircle,
  X,
};

const DESKTOP_APPS = getDesktopApps().map((app) => ({
  ...app,
  IconComp: ICON_MAP[app.icon] || Circle,
}));

const VIDEO_WALLPAPER =
  'https://cdn.openroom.ai/public-cdn-s3-us-west-2/talkie-op-img/1609284623_1772622757413_1.mp4';

const STATIC_WALLPAPER =
  'https://cdn.openroom.ai/public-cdn-s3-us-west-2/talkie-op-img/image/437110625_1772619481913_Aoi_default_Commander_Room.jpg';

function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|mov|ogg)$/.test(pathname);
  } catch {
    return false;
  }
}

const Shell: React.FC = () => {
  // Hosted-layout default: Chat drawer collapsed — users open it via the
  // avatar orb or the Live/Chat tab button. Matches openroom.ai hosted UX.
  const [chatOpen, setChatOpen] = useState(false);
  const [reportEnabled, setReportEnabled] = useState(true);
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [liveWallpaper, setLiveWallpaper] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [modGenerating, setModGenerating] = useState(false);
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setExtractResult(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    setExtractResult(null);
  }, []);

  const generateMod = useCallback(async (character: Manifest['character']): Promise<string> => {
    const llmConfig = await loadConfig();
    if (!llmConfig) {
      throw new Error(
        'No LLM configuration found. Please open Settings (gear icon) and configure your LLM API key first.',
      );
    }

    const prompt = buildModPrompt([], JSON.stringify({ character, apps: [] }));
    logger.info('Shell', 'Mod generation prompt built, length:', prompt.length);

    setModGenerating(true);
    try {
      const response = await chat([{ role: 'user', content: prompt }], [], llmConfig);
      logger.info('Shell', 'Mod generation LLM response length:', response.content.length);

      let jsonStr = response.content.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();

      let modJson: Record<string, unknown>;
      try {
        modJson = JSON.parse(jsonStr);
      } catch {
        throw new Error('LLM returned invalid JSON. Try again or use a different model.');
      }

      const modId = generateModId();
      const modConfig: ModConfig = {
        id: modId,
        mod_name: (modJson.name as string) || (modJson.identifier as string) || 'Generated Mod',
        mod_name_en: (modJson.name as string) || (modJson.identifier as string) || 'Generated Mod',
        mod_description: (modJson.description as string) || '',
        display_desc: (modJson.display_desc as string) || '',
        prologue: (modJson.prologue as string) || '',
        opening_rec_replies: Array.isArray(modJson.opening_rec_replies)
          ? (modJson.opening_rec_replies as string[]).map((r) => ({ reply_text: r }))
          : [],
        stage_count: Array.isArray(modJson.stages) ? modJson.stages.length : 0,
        stages: Array.isArray(modJson.stages)
          ? Object.fromEntries(
              (
                modJson.stages as Array<{
                  name: string;
                  description: string;
                  targets: Array<{ id: number; description: string }>;
                }>
              ).map((s, i) => [
                i,
                {
                  stage_index: i,
                  stage_name: s.name || `Stage ${i + 1}`,
                  stage_description: s.description || '',
                  stage_targets: Object.fromEntries(
                    (s.targets || []).map((t) => [t.id, t.description]),
                  ),
                },
              ]),
            )
          : {},
      };

      const collection = loadModCollectionSync() ?? DEFAULT_MOD_COLLECTION;
      const updated = setActiveMod(addMod(collection, modConfig), modId);
      await saveModCollection(updated);
      logger.info('Shell', 'Mod saved successfully:', modId, modConfig.mod_name);
      return modId;
    } catch (err) {
      logger.error('Shell', 'Mod generation failed:', err);
      throw err;
    } finally {
      setModGenerating(false);
    }
  }, []);

  const [modGenError, setModGenError] = useState<string | null>(null);

  const handleUploadSubmit = useCallback(async () => {
    if (!uploadedFile) return;
    setExtracting(true);
    setExtractResult(null);
    setModGenError(null);
    try {
      const result = await extractCard(uploadedFile);
      setExtractResult(result);
      if (result.status === 'success') {
        logger.info('Shell', 'Card extracted:', result.manifest);
        setUploadedFile(null);
        setUploadOpen(false);
        setExtractResult(null);
        // extracting will be cleared in finally; generateMod shows its own modGenerating overlay
        const modId = await generateMod(result.manifest.character);
        window.dispatchEvent(new CustomEvent('open-mod-editor', { detail: { modId } }));
      }
    } catch (err) {
      logger.error('Shell', 'Upload submit error:', err);
      setModGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  }, [uploadedFile, generateMod]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [wallpaper, setWallpaper] = useState(VIDEO_WALLPAPER);
  const [chatZIndex, setChatZIndex] = useState(() => claimZIndex());
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const pipRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const windows = useWindows();

  const bgWallpaper = isVideoUrl(wallpaper) ? STATIC_WALLPAPER : wallpaper;
  const showVideo = liveWallpaper && isVideoUrl(wallpaper);

  const PIP_W = 200;
  const PIP_H = 280;

  useEffect(() => {
    if (!pipPos && barRef.current) {
      const bar = barRef.current.getBoundingClientRect();
      const barCenterX = bar.left + bar.width / 2;
      setPipPos({
        x: barCenterX - PIP_W / 2,
        y: bar.top - PIP_H - 16,
      });
    }
  }, [pipPos]);

  const handlePipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button') || !pipPos) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pipPos.x, origY: pipPos.y };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPipPos({
          x: Math.max(0, Math.min(window.innerWidth - PIP_W, dragRef.current.origX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - PIP_H, dragRef.current.origY + dy)),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pipPos],
  );

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

  const handleBarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = barRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const startPosX = rect.left;
    const startPosY = rect.top;
    setBarPos({ x: startPosX, y: startPosY });
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      setBarPos({
        x: startPosX + ev.clientX - startX,
        y: startPosY + ev.clientY - startY,
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Pause user action reporting while upload or mod generation is in progress
  useEffect(() => {
    const shouldListen = !uploadOpen && !modGenerating;
    setReportUserActions(shouldListen);
    setReportEnabled(shouldListen);
  }, [uploadOpen, modGenerating]);

  // Wallpaper dimmer scrim — 0 = fully bright, 1 = fully dark. Driven by
  // the os/SET_OPACITY vibe action so Kayley can create ambient / date-night
  // vibes on the desktop without touching individual app windows.
  const [wallpaperDim, setWallpaperDim] = useState<number>(0);

  // Listen for OS events (e.g. wallpaper changes from agent)
  useEffect(() => {
    return onOSEvent((event) => {
      if (event.type === 'SET_WALLPAPER' && typeof event.wallpaper_url === 'string') {
        setWallpaper(event.wallpaper_url);
      }
      if (event.type === 'SET_OPACITY' && typeof event.opacity === 'number') {
        // Clamp to [0, 1] — agents may pass arbitrary values.
        const clamped = Math.max(0, Math.min(1, event.opacity));
        setWallpaperDim(clamped);
      }
    });
  }, []);

  return (
    <div
      className={styles.shell}
      data-testid="shell"
      style={{
        backgroundImage: `url(${bgWallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Wallpaper dimmer scrim — sits above the wallpaper, below all windows + HUD.
          pointer-events: none so it never blocks clicks. Smooth 300ms fade for
          ambient-mode transitions. */}
      <div
        data-testid="wallpaper-dimmer"
        style={{
          position: 'fixed',
          inset: 0,
          background: `rgba(0, 0, 0, ${wallpaperDim})`,
          pointerEvents: 'none',
          zIndex: 50,
          transition: 'background 300ms ease',
        }}
      />
      {showVideo && pipPos && (
        <div
          ref={pipRef}
          className={styles.videoPip}
          style={{ left: pipPos.x, top: pipPos.y, bottom: 'auto' }}
          onMouseDown={handlePipMouseDown}
          data-testid="video-pip"
        >
          <video src={wallpaper} autoPlay loop muted playsInline />
          <button className={styles.pipClose} onClick={() => setLiveWallpaper(false)} title="Close">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Desktop with app icons */}
      <div className={styles.desktop} data-testid="desktop">
        <div className={styles.iconGrid}>
          {DESKTOP_APPS.map((app) => (
            <button
              key={app.appId}
              className={styles.appIcon}
              data-testid={`app-icon-${app.appId}`}
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

      {/* Floating, draggable + resizable Chat window.
          Replaces the right-stuck drawer. Always mounted when visible so
          chat history and the Kayley WebSocket stay alive across hide/show. */}
      <ChatWindow
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        zIndex={chatZIndex}
        onFocus={() => setChatZIndex(claimZIndex())}
      />

      {/* Hosted-layout HUD — centered-bottom pill, suggested prompts,
          avatar orb, Live/Chat tabs. Keeps the hosted openroom.ai feel
          while the ChatPanel drawer serves as the full chat history. */}
      <HostedHUD
        chatOpen={chatOpen}
        onToggleChat={() => {
          setChatOpen((prev) => !prev);
          setChatZIndex(claimZIndex());
        }}
      />

      {/* Upload Modal */}
      {uploadOpen && (
        <div className={styles.uploadOverlay} onClick={() => setUploadOpen(false)}>
          <div className={styles.uploadModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.uploadHeader}>
              <span>Upload File</span>
              <button className={styles.uploadClose} onClick={() => setUploadOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {uploadedFile ? (
              <div className={styles.uploadedFileCenter}>
                {uploadedFile.name.endsWith('.zip') ? (
                  <FileArchive size={36} />
                ) : (
                  <FileImage size={36} />
                )}
                <span className={styles.uploadFileName}>{uploadedFile.name}</span>
                <button
                  className={styles.uploadRemoveBtn}
                  onClick={handleRemoveFile}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className={styles.uploadDropZone} onClick={() => fileInputRef.current?.click()}>
                <Upload size={32} />
                <p>Click to select a file</p>
                <p className={styles.uploadHint}>PNG image or ZIP archive</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.zip"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {extractResult?.status === 'error' && (
              <p className={styles.uploadError}>{extractResult.message}</p>
            )}
            <button
              className={`${styles.uploadSubmitBtn} ${uploadedFile ? styles.active : ''}`}
              disabled={!uploadedFile || extracting}
              onClick={handleUploadSubmit}
            >
              {extracting ? 'Parsing...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* Mod generating overlay */}
      {modGenerating && (
        <div className={styles.uploadOverlay}>
          <div className={styles.analyzingCard}>
            <div className={styles.analyzingSpinner} />
            <span>Generating mod...</span>
          </div>
        </div>
      )}

      {/* Mod generation error toast */}
      {modGenError && !modGenerating && (
        <div className={styles.uploadOverlay} onClick={() => setModGenError(null)}>
          <div className={styles.uploadModal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.uploadError}>{modGenError}</p>
            <button
              className={`${styles.uploadSubmitBtn} ${styles.active}`}
              onClick={() => setModGenError(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div
        ref={barRef}
        className={`${styles.bottomBar} ${chatOpen ? styles.chatOpen : ''}`}
        style={
          barPos
            ? { position: 'fixed', left: barPos.x, top: barPos.y, transform: 'none', bottom: 'auto' }
            : undefined
        }
      >
        <div
          className={styles.barDragGrip}
          onMouseDown={handleBarDragStart}
          title="Drag to reposition"
        >
          <GripHorizontal size={14} />
        </div>
        <button
          className={`${styles.barBtn} ${liveWallpaper ? styles.liveOn : styles.liveOff}`}
          onClick={() => setLiveWallpaper((prev) => !prev)}
          title={liveWallpaper ? 'Live wallpaper: ON' : 'Live wallpaper: OFF'}
          data-testid="wallpaper-toggle"
        >
          {liveWallpaper ? <Video size={16} /> : <VideoOff size={16} />}
        </button>

        {/* Upload button (same behavior as the old yellow +) */}
        <button
          className={styles.barBtn}
          onClick={() => setUploadOpen(true)}
          title="Upload files"
          data-testid="upload-toggle"
        >
          <Upload size={16} />
        </button>

        <button
          className={`${styles.barBtn} ${reportEnabled ? styles.reportOn : styles.reportOff}`}
          onClick={handleToggleReport}
          title={reportEnabled ? 'User action reporting: ON' : 'User action reporting: OFF'}
          data-testid="report-toggle"
        >
          <Radio size={16} />
        </button>

        <button
          className={`${styles.barBtn} ${styles.chatBtn}`}
          onClick={() => setChatOpen(!chatOpen)}
          title="Toggle Chat"
          data-testid="chat-toggle"
        >
          <MessageCircle size={18} />
        </button>
      </div>
    </div>
  );
};

export default Shell;
