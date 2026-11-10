import React, { useCallback, useEffect, useState } from 'react';
import type { Dreamspace } from '../../types';
import { moodAccent } from '../../utils/sceneStyle';
import DreamSprite from './DreamSprite';
import type { AvatarRenderer } from './types';
import styles from './Avatar.module.scss';

interface AvatarStageProps {
  dream: Dreamspace;
  name: string;
  label: string;
  reducedMotion: boolean;
  onPoke: () => void;
  /** Swap in another renderer (e.g. a licensed VRM avatar) */
  renderer?: AvatarRenderer;
}

/** Places the avatar bottom-center with its name and an optional caption bubble. */
const AvatarStage: React.FC<AvatarStageProps> = ({
  dream,
  name,
  label,
  reducedMotion,
  onPoke,
  renderer: Renderer = DreamSprite,
}) => {
  const [bounce, setBounce] = useState(0);

  useEffect(() => {
    if (!bounce) return;
    const timer = setTimeout(() => setBounce(0), 600);
    return () => clearTimeout(timer);
  }, [bounce]);

  const poke = useCallback(() => {
    setBounce((n) => n + 1);
    onPoke();
  }, [onPoke]);

  return (
    <div className={styles.stage}>
      {dream.caption && (
        <div className={styles.caption} data-testid="dl-caption">
          {dream.caption}
        </div>
      )}
      <button
        type="button"
        className={`${styles.avatarButton} ${bounce && !reducedMotion ? styles.bounce : ''}`}
        onClick={poke}
        aria-label={name ? `${label}: ${name}` : label}
        data-testid="dl-avatar"
        data-expression={dream.expression}
      >
        <Renderer
          expression={dream.expression}
          mood={dream.mood}
          accent={moodAccent(dream.mood)}
          reducedMotion={reducedMotion}
        />
      </button>
      {name && <div className={styles.nameTag}>{name}</div>}
    </div>
  );
};

export default AvatarStage;
