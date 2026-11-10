import React, { useEffect, useRef } from 'react';
import type { Weather } from '../types';
import {
  createParticle,
  drawParticle,
  particleCount,
  stepParticle,
  type Particle,
} from '../utils/particles';
import styles from './Scene.module.scss';

const COMPACT_WIDTH = 600;
const MAX_DPR = 2;

/** Canvas weather particles. Pauses when the page is hidden; static under reduced motion. */
const WeatherLayer: React.FC<{ weather: Weather; darkScene: boolean; reducedMotion: boolean }> = ({
  weather,
  darkScene,
  reducedMotion,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || weather === 'clear') {
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let last = 0;
    let running = false;

    const drawAll = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) drawParticle(ctx, p, weather, time, darkScene);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = particleCount(weather, width, height, width < COMPACT_WIDTH);
      particles = Array.from({ length: count }, () =>
        createParticle(weather, width, height, Math.random, true),
      );
      if (!running) drawAll(performance.now() / 1000);
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const time = now / 1000;
      for (let i = 0; i < particles.length; i++) {
        if (!stepParticle(particles[i], weather, dt, width, height, time)) {
          particles[i] = createParticle(weather, width, height, Math.random, false);
        }
      }
      drawAll(time);
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reducedMotion) return;
      running = true;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    resize();
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [weather, darkScene, reducedMotion]);

  return <canvas ref={canvasRef} className={styles.weather} aria-hidden="true" />;
};

export default WeatherLayer;
