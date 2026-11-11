import React, { useEffect, useState } from 'react';
import type { Dreamspace } from '../types';
import {
  bloomGradient,
  isDark,
  moodAccent,
  moodTint,
  skyBackground,
  timeGrade,
} from '../utils/sceneStyle';
import WeatherLayer from './WeatherLayer';
import LightLayer from './LightLayer';
import styles from './Scene.module.scss';

interface Layer {
  key: number;
  url: string | null;
  time: Dreamspace['timeOfDay'];
}

const CROSSFADE_MS = 900;

/** Procedural sky with soft hill silhouettes, used when there is no image. */
const PaintedSky: React.FC<{ time: Dreamspace['timeOfDay'] }> = ({ time }) => (
  <div className={styles.paintedSky} style={{ background: skyBackground(time) }}>
    <svg
      className={styles.hills}
      viewBox="0 0 1200 300"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 190 C 160 120 300 170 450 140 S 760 90 900 150 S 1120 120 1200 160 L1200 300 L0 300 Z"
        fill="rgba(10, 12, 30, 0.35)"
      />
      <path
        d="M0 240 C 200 190 340 230 520 205 S 820 170 1000 215 S 1150 200 1200 210 L1200 300 L0 300 Z"
        fill="rgba(8, 10, 24, 0.6)"
      />
    </svg>
  </div>
);

/**
 * The dream scene, back to front, each depth moving with the viewer
 * (--dl-px / --dl-py, set by useParallax):
 * - back: picture (slow Ken Burns drift) or painted sky, time grade, bloom
 * - middle: drifting mood light, ground shimmer
 * - static: mood tint, vignette
 * - front: weather particles
 * The avatar sits in front of all of these (AvatarStage).
 */
const Scene: React.FC<{ dream: Dreamspace | null; reducedMotion: boolean }> = ({
  dream,
  reducedMotion,
}) => {
  const time = dream?.timeOfDay ?? 'dusk';
  const url = dream?.backgroundUrl ?? null;
  const mood = dream?.mood ?? 'serene';
  const [layers, setLayers] = useState<Layer[]>([{ key: 0, url, time }]);

  // Cross-fade: add the new layer on top, drop older ones after the fade
  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.url === url && top.time === time) return prev;
      return [...prev.slice(-1), { key: top.key + 1, url, time }];
    });
  }, [url, time]);

  useEffect(() => {
    if (layers.length < 2) return;
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [layers]);

  const still = reducedMotion ? styles.still : '';

  return (
    <div
      className={`${styles.scene} ${still}`}
      style={{ '--dl-mood-accent': moodAccent(mood) } as React.CSSProperties}
      data-testid="dl-scene"
      data-time={time}
      data-weather={dream?.weather ?? 'clear'}
      data-mood={mood}
      data-has-image={url ? 'true' : 'false'}
    >
      <div className={`${styles.depth} ${styles.depthBack}`} data-testid="dl-depth-back">
        {layers.map((layer, i) => (
          <div
            key={layer.key}
            className={`${styles.layer} ${i > 0 && !reducedMotion ? styles.fadeIn : ''}`}
          >
            {layer.url ? (
              <img
                className={`${styles.image} ${styles.kenBurns}`}
                src={layer.url}
                alt=""
                draggable={false}
                data-testid={i === layers.length - 1 ? 'dl-bg-image' : undefined}
              />
            ) : (
              <PaintedSky time={layer.time} />
            )}
          </div>
        ))}
        {url && <div className={styles.grade} style={{ background: timeGrade(time) }} />}
        <div
          className={styles.bloom}
          style={{ background: bloomGradient(time) }}
          data-testid="dl-bloom"
        />
      </div>

      {dream && (
        <div className={`${styles.depth} ${styles.depthMid}`}>
          <LightLayer mood={mood} reducedMotion={reducedMotion} />
          <div className={styles.shimmer} data-testid="dl-shimmer" />
        </div>
      )}

      {dream && <div className={styles.tint} style={{ background: moodTint(mood) }} />}
      <div className={styles.vignette} />

      {dream && (
        <div className={`${styles.depth} ${styles.depthFront}`}>
          <WeatherLayer
            weather={dream.weather}
            darkScene={isDark(time)}
            reducedMotion={reducedMotion}
          />
        </div>
      )}
    </div>
  );
};

export default Scene;
