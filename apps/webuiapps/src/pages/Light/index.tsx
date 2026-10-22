import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getCurrentWallpaperOpacity, onOSEvent, setOpacityFromUI } from '@/lib/vibeContainerMock';
import styles from './index.module.scss';

const APP_ID = 18;

const Light: React.FC = () => {
  const [opacity, setOpacity] = useState<number>(() => getCurrentWallpaperOpacity());
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<boolean>(false);

  // Stay in sync when SET_OPACITY events arrive from outside the Light app
  // (agent-driven via vibe_action, or another future surface).
  useEffect(() => {
    const off = onOSEvent((event) => {
      if (event.type === 'SET_OPACITY' && typeof event.opacity === 'number') {
        if (!draggingRef.current) setOpacity(event.opacity);
      }
    });
    return off;
  }, []);

  // Brightness % — inverse of dimmer opacity, top-of-slider = bright.
  const brightnessPct = Math.round((1 - opacity) * 100);

  const applyFromClientY = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / rect.height));
    // Top of track (y=0) = 0% opacity = 100% brightness.
    // Bottom (y=height) = 100% opacity = 0% brightness.
    const newOpacity = ratio;
    setOpacity(newOpacity);
    setOpacityFromUI(newOpacity);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyFromClientY(e.clientY);
    },
    [applyFromClientY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      applyFromClientY(e.clientY);
    },
    [applyFromClientY],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released — safe to ignore.
    }
  }, []);

  // Thumb sits at `opacity` ratio from the top of the track.
  const thumbPct = `${opacity * 100}%`;
  const filledPct = `${opacity * 100}%`;

  return (
    <div className={styles.lightApp} data-app-id={APP_ID}>
      <div className={styles.header}>
        <h2 className={styles.title}>Light</h2>
        <p className={styles.subtitle}>Drag to dim the wallpaper.</p>
      </div>

      <div className={styles.readout}>
        <span className={styles.readoutNumber}>{brightnessPct}</span>
        <span className={styles.readoutPct}>%</span>
        <span className={styles.readoutLabel}>brightness</span>
      </div>

      <div className={styles.sliderRow}>
        <div className={styles.iconTop} aria-hidden>
          <Sun size={18} />
        </div>

        <div
          ref={trackRef}
          className={styles.track}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="slider"
          aria-label="Wallpaper brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={brightnessPct}
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              const next = Math.max(0, opacity - 0.05);
              setOpacity(next);
              setOpacityFromUI(next);
            } else if (e.key === 'ArrowDown') {
              const next = Math.min(1, opacity + 0.05);
              setOpacity(next);
              setOpacityFromUI(next);
            }
          }}
        >
          <div className={styles.fill} style={{ height: filledPct }} />
          <div className={styles.thumb} style={{ top: thumbPct }} />
        </div>

        <div className={styles.iconBottom} aria-hidden>
          <Moon size={18} />
        </div>
      </div>

      <div className={styles.presets}>
        <button
          type="button"
          className={styles.presetBtn}
          onClick={() => {
            setOpacity(0);
            setOpacityFromUI(0);
          }}
        >
          On
        </button>
        <button
          type="button"
          className={styles.presetBtn}
          onClick={() => {
            setOpacity(0.25);
            setOpacityFromUI(0.25);
          }}
        >
          Cinematic
        </button>
        <button
          type="button"
          className={styles.presetBtn}
          onClick={() => {
            setOpacity(0.5);
            setOpacityFromUI(0.5);
          }}
        >
          Dim
        </button>
        <button
          type="button"
          className={styles.presetBtn}
          onClick={() => {
            setOpacity(1);
            setOpacityFromUI(1);
          }}
        >
          Off
        </button>
      </div>
    </div>
  );
};

export default Light;
