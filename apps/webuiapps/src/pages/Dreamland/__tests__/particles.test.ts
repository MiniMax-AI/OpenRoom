import { describe, it, expect, vi } from 'vitest';
import { WEATHERS } from '../types';
import {
  createParticle,
  drawParticle,
  particleCount,
  stepParticle,
  type DrawContext,
} from '../utils/particles';

/** Deterministic pseudo-random sequence. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

function fakeCtx() {
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    ellipse: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 0,
    globalAlpha: 1,
  };
  return ctx as typeof ctx & DrawContext;
}

describe('particleCount', () => {
  it('is zero for clear weather or an empty area', () => {
    expect(particleCount('clear', 800, 600, false)).toBe(0);
    expect(particleCount('rain', 0, 600, false)).toBe(0);
  });

  it('scales with area, is reduced in compact windows and capped', () => {
    const full = particleCount('snow', 800, 600, false);
    expect(full).toBe(Math.round(4.8 * 9));
    expect(particleCount('snow', 800, 600, true)).toBeLessThan(full);
    expect(particleCount('rain', 5000, 5000, false)).toBe(260);
    expect(particleCount('fog', 10, 10, false)).toBe(1);
  });
});

describe('createParticle', () => {
  it('creates weather-specific particles inside the scene', () => {
    for (const weather of WEATHERS) {
      const p = createParticle(weather, 400, 300, seq(0.5), true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(Number.isFinite(p.size)).toBe(true);
    }
  });

  it('spawns new particles at the edge they come from', () => {
    expect(createParticle('rain', 400, 300, seq(0.5), false).y).toBeLessThan(0);
    expect(createParticle('snow', 400, 300, seq(0.5), false).y).toBeLessThan(0);
    expect(createParticle('petals', 400, 300, seq(0.5), false).x).toBeLessThan(0);
    expect(createParticle('fog', 400, 300, seq(0.5), false).x).toBeLessThan(0);
    const firefly = createParticle('fireflies', 400, 300, seq(0.5), false);
    expect(firefly.y).toBe(300);
    expect(firefly.vy).toBeLessThan(0);
  });

  it('keeps stars in the upper sky', () => {
    const star = createParticle('stars', 400, 300, seq(0.99), true);
    expect(star.y).toBeLessThan(300 * 0.65);
  });
});

describe('stepParticle', () => {
  it('moves falling particles and reports when they leave', () => {
    const rain = createParticle('rain', 400, 300, seq(0.5), true);
    const y = rain.y;
    expect(stepParticle(rain, 'rain', 0.01, 400, 300, 0)).toBe(true);
    expect(rain.y).toBeGreaterThan(y);
    rain.y = 1000;
    expect(stepParticle(rain, 'rain', 0.01, 400, 300, 0)).toBe(false);
  });

  it('drifts snow and petals with flutter', () => {
    for (const weather of ['snow', 'petals'] as const) {
      const p = createParticle(weather, 400, 300, seq(0.5), true);
      const before = { x: p.x, y: p.y };
      expect(stepParticle(p, weather, 0.1, 400, 300, 1)).toBe(true);
      expect(p.x !== before.x || p.y !== before.y).toBe(true);
    }
  });

  it('keeps fireflies wandering inside horizontally and flickering', () => {
    const f = createParticle('fireflies', 400, 300, seq(0.5), true);
    f.x = -5;
    stepParticle(f, 'fireflies', 0.01, 400, 300, 0);
    expect(f.x).toBeGreaterThan(0);
    f.x = 405;
    stepParticle(f, 'fireflies', 0.01, 400, 300, 0);
    expect(f.x).toBeLessThan(400);
    f.y = 10;
    f.vy = -5;
    stepParticle(f, 'fireflies', 0.01, 400, 300, 0);
    expect(f.vy).toBeGreaterThan(0);
    expect(f.alpha).toBeGreaterThanOrEqual(0.35);
    f.y = 400;
    expect(stepParticle(f, 'fireflies', 0.01, 400, 300, 0)).toBe(false);
  });

  it('twinkles stars in place', () => {
    const s = createParticle('stars', 400, 300, seq(0.3), true);
    const pos = { x: s.x, y: s.y };
    expect(stepParticle(s, 'stars', 0.1, 400, 300, 2)).toBe(true);
    expect({ x: s.x, y: s.y }).toEqual(pos);
    expect(s.alpha).toBeGreaterThanOrEqual(0.45);
  });

  it('lets fog drift off to the right', () => {
    const fog = createParticle('fog', 400, 300, seq(0.5), true);
    fog.x = 10_000;
    expect(stepParticle(fog, 'fog', 0.1, 400, 300, 0)).toBe(false);
  });
});

describe('drawParticle', () => {
  it('draws each weather and resets alpha', () => {
    for (const weather of WEATHERS) {
      for (const dark of [true, false]) {
        const ctx = fakeCtx();
        const p = createParticle(weather, 400, 300, seq(0.5), true);
        drawParticle(ctx, p, weather, 1, dark);
        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.globalAlpha).toBe(1);
      }
    }
  });

  it('uses lines for rain and gradients for fireflies and fog', () => {
    const ctx = fakeCtx();
    drawParticle(ctx, createParticle('rain', 10, 10, seq(0.5)), 'rain', 0, true);
    expect(ctx.stroke).toHaveBeenCalled();
    drawParticle(ctx, createParticle('fireflies', 10, 10, seq(0.5)), 'fireflies', 0, true);
    drawParticle(ctx, createParticle('fog', 10, 10, seq(0.5)), 'fog', 0, true);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(2);
  });
});
