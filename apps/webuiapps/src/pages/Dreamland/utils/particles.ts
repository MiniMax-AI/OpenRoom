/**
 * Weather particle simulation, independent of the canvas so it can be tested.
 * Positions are in CSS pixels; time in seconds.
 */

import type { Weather } from '../types';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  /** Random phase for twinkle/flutter/flicker */
  phase: number;
}

export type Rand = () => number;

/** Particles per 100,000 px² and a hard cap, per weather. */
const DENSITY: Record<Weather, { per100k: number; max: number }> = {
  clear: { per100k: 0, max: 0 },
  rain: { per100k: 16, max: 260 },
  snow: { per100k: 9, max: 160 },
  fog: { per100k: 0.9, max: 12 },
  fireflies: { per100k: 2.4, max: 45 },
  stars: { per100k: 11, max: 220 },
  petals: { per100k: 2.2, max: 40 },
};

export function particleCount(weather: Weather, width: number, height: number, compact: boolean) {
  const { per100k, max } = DENSITY[weather];
  if (per100k === 0 || width <= 0 || height <= 0) return 0;
  const n = Math.round(((width * height) / 100_000) * per100k * (compact ? 0.6 : 1));
  return Math.max(1, Math.min(max, n));
}

const between = (rand: Rand, min: number, max: number) => min + rand() * (max - min);

/**
 * Create a particle. `anywhere` places it randomly in the scene (initial fill);
 * otherwise it enters from the edge it naturally comes from.
 */
export function createParticle(
  weather: Weather,
  width: number,
  height: number,
  rand: Rand,
  anywhere = true,
): Particle {
  const p: Particle = {
    x: rand() * width,
    y: anywhere ? rand() * height : 0,
    vx: 0,
    vy: 0,
    size: 1,
    alpha: 1,
    phase: rand() * Math.PI * 2,
  };
  switch (weather) {
    case 'rain':
      p.vy = between(rand, 700, 1000);
      p.vx = -p.vy * 0.12;
      p.size = between(rand, 10, 20);
      p.alpha = between(rand, 0.25, 0.55);
      if (!anywhere) p.y = -p.size;
      break;
    case 'snow':
      p.vy = between(rand, 25, 70);
      p.vx = between(rand, -15, 15);
      p.size = between(rand, 1.5, 4);
      p.alpha = between(rand, 0.6, 0.95);
      if (!anywhere) p.y = -p.size;
      break;
    case 'petals':
      p.vy = between(rand, 30, 60);
      p.vx = between(rand, 20, 50);
      p.size = between(rand, 4, 8);
      p.alpha = between(rand, 0.7, 0.95);
      if (!anywhere) {
        p.y = rand() * height * 0.6;
        p.x = -p.size;
      }
      break;
    case 'fireflies':
      p.vx = between(rand, -12, 12);
      p.vy = between(rand, -10, 6);
      p.size = between(rand, 1.5, 3);
      p.y = anywhere ? between(rand, height * 0.35, height) : height;
      // New fireflies rise into the scene from below
      if (!anywhere) p.vy = -Math.abs(p.vy) - 4;
      break;
    case 'stars':
      p.y = rand() * height * 0.65;
      p.size = between(rand, 0.6, 1.8);
      p.alpha = between(rand, 0.4, 1);
      break;
    case 'fog':
      p.vx = between(rand, 6, 16);
      p.size = between(rand, Math.max(width, height) * 0.25, Math.max(width, height) * 0.45);
      p.y = between(rand, height * 0.45, height);
      p.alpha = between(rand, 0.06, 0.14);
      if (!anywhere) p.x = -p.size;
      break;
    default:
      break;
  }
  return p;
}

/** Advance a particle by dt seconds. Returns false when it left the scene and should respawn. */
export function stepParticle(
  p: Particle,
  weather: Weather,
  dt: number,
  width: number,
  height: number,
  time: number,
): boolean {
  switch (weather) {
    case 'snow':
      p.x += (p.vx + Math.sin(time * 0.8 + p.phase) * 12) * dt;
      p.y += p.vy * dt;
      break;
    case 'petals':
      p.x += (p.vx + Math.sin(time * 1.2 + p.phase) * 25) * dt;
      p.y += (p.vy + Math.cos(time * 1.5 + p.phase) * 15) * dt;
      break;
    case 'fireflies':
      p.x += (p.vx + Math.sin(time * 0.7 + p.phase) * 10) * dt;
      p.y += (p.vy + Math.cos(time * 0.9 + p.phase) * 8) * dt;
      p.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.6 + p.phase));
      // Fireflies wander; keep them inside by wrapping softly
      if (p.y < height * 0.25) p.vy = Math.abs(p.vy);
      if (p.x < 0) p.x += width;
      if (p.x > width) p.x -= width;
      return p.y <= height + 10;
    case 'stars':
      p.alpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.3 + p.phase));
      return true;
    default:
      p.x += p.vx * dt;
      p.y += p.vy * dt;
  }
  const margin = p.size + 2;
  return (
    p.y < height + margin && p.x > -margin * (weather === 'fog' ? 1 : 3) && p.x < width + margin
  );
}

/** Minimal 2D context surface used for drawing (lets tests pass a fake). */
export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'arc'
  | 'fill'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'ellipse'
  | 'createRadialGradient'
  | 'save'
  | 'restore'
> & {
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  lineWidth: number;
  globalAlpha: number;
};

export function drawParticle(
  ctx: DrawContext,
  p: Particle,
  weather: Weather,
  time: number,
  darkScene: boolean,
): void {
  ctx.globalAlpha = p.alpha;
  switch (weather) {
    case 'rain':
      ctx.strokeStyle = darkScene ? 'rgba(200, 215, 255, 1)' : 'rgba(170, 190, 220, 1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 0.02, p.y + p.size);
      ctx.stroke();
      break;
    case 'petals': {
      const tilt = Math.sin(time * 2 + p.phase);
      ctx.fillStyle = 'rgba(255, 190, 210, 1)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * (0.35 + 0.3 * Math.abs(tilt)), tilt, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fireflies': {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
      g.addColorStop(0, 'rgba(255, 245, 160, 1)');
      g.addColorStop(1, 'rgba(255, 245, 160, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fog': {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, 'rgba(235, 240, 250, 1)');
      g.addColorStop(1, 'rgba(235, 240, 250, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      // snow, stars
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.globalAlpha = 1;
}
