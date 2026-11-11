import { describe, it, expect } from 'vitest';
import {
  approach,
  CENTER,
  clamp,
  driftBaseline,
  offsetChanged,
  pointerOffset,
  smoothOffset,
  tiltOffset,
  TILT_RANGE_DEG,
} from '../utils/parallax';
import { IDLE_LIPS, lipBoundary, lipEnd, lipStart, mouthOpen } from '../utils/lipSync';
import {
  ARM_DROP,
  EMOTION_PRESETS,
  blinkWeight,
  createBlinker,
  expressionPose,
  expressionWeights,
  frameCamera,
  gazeOffset,
  idleFrame,
  nextBlinkDelay,
} from '../utils/vrmRig';
import { EXPRESSIONS } from '../types';

describe('parallax', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('maps the pointer to -1..1 around the center', () => {
    expect(pointerOffset(200, 100, rect)).toEqual({ x: 0, y: 0 });
    expect(pointerOffset(100, 50, rect)).toEqual({ x: -1, y: -1 });
    expect(pointerOffset(300, 150, rect)).toEqual({ x: 1, y: 1 });
    expect(pointerOffset(999, -999, rect)).toEqual({ x: 1, y: -1 });
    expect(pointerOffset(1, 1, { ...rect, width: 0 })).toBe(CENTER);
  });

  it('maps tilt relative to the resting position, per screen rotation', () => {
    const rest = { beta: 40, gamma: 0 };
    const tilted = { beta: 40 + TILT_RANGE_DEG / 2, gamma: TILT_RANGE_DEG };
    expect(tiltOffset(tilted, rest)).toEqual({ x: 1, y: 0.5 });
    expect(tiltOffset(tilted, rest, 90)).toEqual({ x: 0.5, y: -1 });
    expect(tiltOffset(tilted, rest, 180)).toEqual({ x: -1, y: -0.5 });
    expect(tiltOffset(tilted, rest, 270)).toEqual({ x: -0.5, y: 1 });
    expect(tiltOffset(tilted, rest, -90)).toEqual({ x: -0.5, y: 1 });
    expect(tiltOffset({ beta: 200, gamma: -200 }, rest).x).toBe(-1);
  });

  it('lets the resting position follow slowly and eases offsets', () => {
    const base = driftBaseline({ beta: 0, gamma: 0 }, { beta: 10, gamma: -10 }, 1);
    expect(base.beta).toBeGreaterThan(0);
    expect(base.beta).toBeLessThan(10);
    expect(base.gamma).toBeLessThan(0);
    expect(driftBaseline({ beta: 0, gamma: 0 }, { beta: 10, gamma: 0 }, -1).beta).toBe(0);

    expect(approach(0, 1, 0, 5)).toBe(0);
    expect(approach(0, 1, 10, 5)).toBeCloseTo(1, 5);
    const eased = smoothOffset(CENTER, { x: 1, y: -1 }, 0.1);
    expect(eased.x).toBeGreaterThan(0);
    expect(eased.y).toBeLessThan(0);
    expect(offsetChanged(CENTER, { x: 0.0001, y: 0 })).toBe(false);
    expect(offsetChanged(CENTER, { x: 0, y: 0.01 })).toBe(true);
    expect(clamp(5)).toBe(1);
    expect(clamp(-5)).toBe(-1);
  });
});

describe('lip sync', () => {
  it('is closed when idle and opens while speaking', () => {
    expect(mouthOpen(IDLE_LIPS, 10)).toBe(0);
    const speaking = lipStart(IDLE_LIPS, 1);
    expect(lipStart(speaking, 5)).toBe(speaking);
    expect(mouthOpen(speaking, 1)).toBe(0); // ramps in
    const samples = Array.from({ length: 40 }, (_, i) => mouthOpen(speaking, 1.2 + i * 0.03));
    expect(Math.max(...samples)).toBeGreaterThan(0.5);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
  });

  it('opens wider on a word and closes smoothly at the end', () => {
    const speaking = lipStart(IDLE_LIPS, 0);
    const word = lipBoundary(speaking, 2);
    expect(mouthOpen(word, 2)).toBeGreaterThan(mouthOpen(speaking, 2) - 0.0001);
    const ended = lipEnd(word, 3);
    expect(lipEnd(ended, 4)).toBe(ended);
    expect(mouthOpen(ended, 3)).toBeCloseTo(0.35);
    expect(mouthOpen(ended, 3.09)).toBeGreaterThan(0);
    expect(mouthOpen(ended, 3.5)).toBe(0);
    // a boundary without a start still counts as speaking
    expect(lipBoundary(IDLE_LIPS, 1).speaking).toBe(true);
  });
});

describe('vrm rig', () => {
  it('maps every expression to emotion weights and a pose', () => {
    for (const expression of EXPRESSIONS) {
      const weights = expressionWeights(expression);
      expect(Object.keys(weights).sort()).toEqual([...EMOTION_PRESETS].sort());
      expect(Math.max(...Object.values(weights))).toBeGreaterThan(0);
      expect(expressionPose(expression).breathPeriod).toBeGreaterThan(0);
    }
    expect(expressionWeights('angry')).toMatchObject({ angry: 0.8, happy: 0 });
    expect(expressionPose('depressing').headPitch).toBeGreaterThan(0);
  });

  it('breathes and turns toward the viewer, or holds the pose when still', () => {
    const pose = expressionPose('happy');
    const a = idleFrame(0.5, pose, { x: 1, y: 0 });
    const b = idleFrame(1.5, pose, { x: 1, y: 0 });
    expect(a.headY).toBeGreaterThan(0);
    expect(a.chestX).not.toBeCloseTo(b.chestX, 5);
    expect(a.upperArmZ).toBeCloseTo(ARM_DROP, 1);
    const still1 = idleFrame(0.5, pose, CENTER, true);
    const still2 = idleFrame(9, pose, CENTER, true);
    for (const key of Object.keys(still1) as Array<keyof typeof still1>) {
      expect(still2[key]).toBeCloseTo(still1[key], 10);
    }
    expect(still1.headZ).toBe(pose.headRoll);
  });

  it('blinks every few seconds', () => {
    expect(blinkWeight(0, 0)).toBe(0);
    expect(blinkWeight(0.08, 0)).toBeCloseTo(1);
    expect(blinkWeight(0.12, 0)).toBeCloseTo(0.5);
    expect(blinkWeight(0.2, 0)).toBe(0);
    expect(nextBlinkDelay(() => 0.1)).toBe(0.35);
    expect(nextBlinkDelay(() => 0.5)).toBe(4);

    const blinker = createBlinker(() => 0.5, 0);
    expect(blinker.value(1)).toBe(0);
    expect(blinker.value(4)).toBe(0); // blink starts at 4
    expect(blinker.value(4.08)).toBeCloseTo(1);
    expect(blinker.value(4.5)).toBe(0);
    expect(createBlinker(undefined, 0).value(0)).toBe(0);
  });

  it('looks away when shy and toward the viewer otherwise', () => {
    const shy = gazeOffset(0, expressionPose('shy'), CENTER, true);
    expect(shy.x).toBeLessThan(0);
    expect(shy.y).toBeGreaterThan(0);
    const happy = gazeOffset(0, expressionPose('happy'), { x: 1, y: 0 }, true);
    expect(happy.x).toBeCloseTo(0.6);
    expect(gazeOffset(3, expressionPose('happy'), CENTER).x).not.toBe(0);
  });

  it('frames head to thighs, backing off for narrow boxes', () => {
    const wide = frameCamera(1.45, 0.9, 1.5, 26);
    expect(wide.targetY).toBeCloseTo((1.65 + 0.6) / 2);
    expect(wide.y).toBeGreaterThan(wide.targetY);
    const narrow = frameCamera(1.45, 0.9, 0.3, 26);
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    // tiny models still get a sensible frame
    expect(frameCamera(0.1, 0.1, 1, 26).distance).toBeGreaterThan(0);
  });
});
