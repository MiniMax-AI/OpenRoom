import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2 } from 'lucide-react';
import { useVibeInfo } from '@/lib';
import { useController, useDreamland } from '../store/DreamlandContext';
import { AmbientAudio } from '../services/ambientAudio';
import { isTiltSupported, isTouchDevice } from '../services/motionInput';
import { useParallax } from '../hooks/useParallax';
import type { Dreamspace } from '../types';
import Scene from './Scene';
import TopBar from './TopBar';
import Inspector from './Inspector';
import Library from './Library';
import AvatarStage from './avatar/AvatarStage';
import ConfirmDialog from './common/ConfirmDialog';
import Toast from './common/Toast';
import common from './common/common.module.scss';
import styles from '../index.module.scss';

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

const DreamlandApp: React.FC = () => {
  const { t } = useTranslation('dreamland');
  const controller = useController();
  const snap = useDreamland();
  const { characterInfo } = useVibeInfo();
  const reducedMotion = usePrefersReducedMotion();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Dreamspace | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewer = useParallax(rootRef, { enabled: !reducedMotion, tilt: snap.tiltActive });
  const [tiltAvailable] = useState(() => isTiltSupported() && isTouchDevice());

  const active = snap.active;
  const generating = !!active && snap.generatingIds.includes(active.id);

  const closeLibrary = useCallback(() => setLibraryOpen(false), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

  const handleCreate = useCallback(async () => {
    try {
      await controller.createDream();
      setLibraryOpen(false);
    } catch {
      controller.showToast(t('toast.loadFailed'), true);
    }
  }, [controller, t]);

  const handleSelect = useCallback(
    (id: string) => {
      controller.switchDream(id);
      setLibraryOpen(false);
    },
    [controller],
  );

  const confirmDelete = useCallback(async () => {
    const dream = pendingDelete;
    setPendingDelete(null);
    if (!dream) return;
    try {
      await controller.deleteDream(dream.id);
    } catch {
      controller.showToast(t('toast.loadFailed'), true);
    }
  }, [controller, pendingDelete, t]);

  return (
    <div
      ref={rootRef}
      className={styles.app}
      // Any tap may start audio or tilt that was switched on in an earlier visit (Safari rule)
      onClickCapture={() => {
        controller.unlockAudioIfNeeded();
        controller.unlockMotionIfNeeded();
      }}
      data-testid="dreamland"
    >
      <Scene dream={active} reducedMotion={reducedMotion} />

      {snap.loading ? (
        <div className={styles.center} data-testid="dl-loading">
          <Loader2 size={28} className={styles.spin} />
        </div>
      ) : active ? (
        <AvatarStage
          dream={active}
          name={characterInfo?.name ?? ''}
          label={t('avatar.label')}
          reducedMotion={reducedMotion}
          onPoke={() => controller.pokeAvatar()}
          modelUrl={snap.avatarModelUrl}
          modelFailed={snap.avatarModelFailed}
          onModelError={(reason) => controller.avatarFailed(reason)}
          viewer={viewer}
        />
      ) : (
        <div className={styles.center} data-testid="dl-empty">
          <p className={styles.emptyTitle}>{t('empty.title')}</p>
          <button className={common.primaryButton} onClick={handleCreate}>
            <Plus size={16} />
            {t('empty.action')}
          </button>
        </div>
      )}

      <TopBar
        title={active?.name ?? ''}
        soundEnabled={snap.soundEnabled}
        soundSupported={AmbientAudio.isSupported()}
        canEdit={!!active}
        onOpenLibrary={() => setLibraryOpen(true)}
        onToggleSound={() => controller.toggleSound()}
        onOpenInspector={() => setInspectorOpen(true)}
      />
      {generating && <div className={styles.generatingBar} data-testid="dl-generating" />}

      <Library
        open={libraryOpen}
        dreams={snap.dreams}
        activeId={active?.id ?? null}
        onClose={closeLibrary}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={setPendingDelete}
      />
      {active && (
        <Inspector
          open={inspectorOpen}
          dream={active}
          generating={generating}
          imageGenAvailable={snap.imageGenAvailable}
          volume={snap.volume}
          onClose={closeInspector}
          onChange={(patch) => controller.updateDream(active.id, patch)}
          onEditText={(field, value) => controller.editText(active.id, field, value)}
          onCommitText={(field) => controller.commitText(active.id, field)}
          onRegenerate={() => void controller.regenerate(active.id)}
          onUsePaintedSky={() => controller.usePaintedSky(active.id)}
          onVolume={(v) => controller.setVolume(v)}
          avatarModel={snap.avatarModel}
          avatarBusy={snap.avatarBusy}
          avatarFailed={snap.avatarModelFailed}
          onUploadModel={(file) => void controller.uploadAvatarModel(file)}
          onRemoveModel={() => void controller.removeAvatarModel()}
          tilt={{
            available: tiltAvailable,
            enabled: snap.motionEnabled,
            onToggle: (enabled) => void controller.setMotionEnabled(enabled),
          }}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title={t('confirm.deleteTitle')}
        message={t('confirm.deleteMessage', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('confirm.delete')}
        cancelLabel={t('confirm.cancel')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
      <Toast toast={snap.toast} />
    </div>
  );
};

export default DreamlandApp;
