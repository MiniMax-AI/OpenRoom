import React from 'react';
import type { Mood } from '../types';
import { moodLightGradients } from '../utils/sceneStyle';
import styles from './Scene.module.scss';

/** Slowly drifting pools of mood-colored light, between the picture and the weather. */
const LightLayer: React.FC<{ mood: Mood; reducedMotion: boolean }> = ({ mood, reducedMotion }) => {
  const [a, b] = moodLightGradients(mood);
  return (
    <div
      className={`${styles.moodLight} ${reducedMotion ? styles.still : ''}`}
      data-testid="dl-mood-light"
      aria-hidden="true"
    >
      <span className={styles.poolA} style={{ background: a }} />
      <span className={styles.poolB} style={{ background: b }} />
    </div>
  );
};

export default LightLayer;
