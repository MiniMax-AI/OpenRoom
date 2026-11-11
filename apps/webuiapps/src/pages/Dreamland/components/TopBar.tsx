import React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import styles from '../index.module.scss';

interface TopBarProps {
  title: string;
  soundEnabled: boolean;
  soundSupported: boolean;
  canEdit: boolean;
  onOpenLibrary: () => void;
  onToggleSound: () => void;
  onOpenInspector: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
  title,
  soundEnabled,
  soundSupported,
  canEdit,
  onOpenLibrary,
  onToggleSound,
  onOpenInspector,
}) => {
  const { t } = useTranslation('dreamland');
  return (
    <header className={styles.topBar}>
      <button
        className={styles.barButton}
        onClick={onOpenLibrary}
        aria-label={t('topbar.library')}
        data-testid="dl-library-btn"
      >
        <LayoutGrid size={18} />
        <span className={styles.barLabel}>{t('topbar.library')}</span>
      </button>
      <h1 className={styles.title} data-testid="dl-title">
        {title}
      </h1>
      <div className={styles.barActions}>
        {soundSupported && (
          <button
            className={`${styles.barButton} ${soundEnabled ? styles.barButtonOn : ''}`}
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? t('topbar.soundOn') : t('topbar.soundOff')}
            title={soundEnabled ? t('topbar.soundOn') : t('topbar.soundOff')}
            data-testid="dl-sound-btn"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        )}
        {canEdit && (
          <button
            className={styles.barButton}
            onClick={onOpenInspector}
            aria-label={t('topbar.edit')}
            data-testid="dl-edit-btn"
          >
            <SlidersHorizontal size={18} />
            <span className={styles.barLabel}>{t('topbar.edit')}</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default TopBar;
