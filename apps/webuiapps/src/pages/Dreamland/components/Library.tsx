import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { Dreamspace } from '../types';
import { skyBackground } from '../utils/sceneStyle';
import Drawer from './common/Drawer';
import common from './common/common.module.scss';
import styles from '../index.module.scss';

interface LibraryProps {
  open: boolean;
  dreams: Dreamspace[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (dream: Dreamspace) => void;
}

const DreamCard: React.FC<{
  dream: Dreamspace;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ dream, active, onSelect, onDelete }) => {
  const { t } = useTranslation('dreamland');
  return (
    <li
      className={`${styles.card} ${active ? styles.cardActive : ''}`}
      data-testid="dl-dream-card"
      data-id={dream.id}
      data-active={active ? 'true' : 'false'}
    >
      <button className={styles.cardMain} onClick={onSelect} aria-current={active}>
        <span
          className={styles.thumb}
          style={
            dream.backgroundUrl
              ? { backgroundImage: `url("${dream.backgroundUrl}")` }
              : { background: skyBackground(dream.timeOfDay) }
          }
        />
        <span className={styles.cardText}>
          <span className={styles.cardName}>{dream.name}</span>
          <span className={styles.cardMeta}>
            {t(`timeOfDay.${dream.timeOfDay}`)} · {t(`weather.${dream.weather}`)}
            {active && <span className={styles.activeBadge}>{t('library.active')}</span>}
          </span>
        </span>
      </button>
      <button
        className={common.iconButton}
        onClick={onDelete}
        aria-label={`${t('library.delete')}: ${dream.name}`}
        data-testid="dl-delete-btn"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
};

const Library: React.FC<LibraryProps> = ({
  open,
  dreams,
  activeId,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}) => {
  const { t } = useTranslation('dreamland');
  return (
    <Drawer
      side="left"
      open={open}
      title={t('library.title')}
      closeLabel={t('library.close')}
      onClose={onClose}
      testId="dl-library"
    >
      <button className={styles.createButton} onClick={onCreate} data-testid="dl-create-btn">
        <Plus size={16} />
        {t('library.create')}
      </button>
      {dreams.length === 0 ? (
        <p className={styles.hint}>{t('library.empty')}</p>
      ) : (
        <ul className={styles.cardList}>
          {dreams.map((dream) => (
            <DreamCard
              key={dream.id}
              dream={dream}
              active={dream.id === activeId}
              onSelect={() => onSelect(dream.id)}
              onDelete={() => onDelete(dream)}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
};

export default Library;
