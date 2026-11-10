import React, { useEffect, useState } from 'react';
import type { Dreamspace } from '../types';
import { isDark, moodTint, skyBackground, timeGrade } from '../utils/sceneStyle';
import WeatherLayer from './WeatherLayer';
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
 * Background (image or painted sky) with cross-fade between changes,
 * time-of-day grading, mood tint and weather particles.
 */
const Scene: React.FC<{ dream: Dreamspace | null; reducedMotion: boolean }> = ({
  dream,
  reducedMotion,
}) => {
  const time = dream?.timeOfDay ?? 'dusk';
  const url = dream?.backgroundUrl ?? null;
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

  return (
    <div
      className={styles.scene}
      data-testid="dl-scene"
      data-time={time}
      data-weather={dream?.weather ?? 'clear'}
      data-mood={dream?.mood ?? 'serene'}
      data-has-image={url ? 'true' : 'false'}
    >
      {layers.map((layer, i) => (
        <div
          key={layer.key}
          className={`${styles.layer} ${i > 0 && !reducedMotion ? styles.fadeIn : ''}`}
        >
          {layer.url ? (
            <img
              className={styles.image}
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
      {dream && <div className={styles.tint} style={{ background: moodTint(dream.mood) }} />}
      <div className={styles.vignette} />
      {dream && (
        <WeatherLayer
          weather={dream.weather}
          darkScene={isDark(time)}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
};

export default Scene;
