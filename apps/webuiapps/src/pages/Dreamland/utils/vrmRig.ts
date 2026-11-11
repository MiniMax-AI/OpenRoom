/**
 * Animation math for the 3D (VRM) companion, kept free of three.js so it can
 * be unit-tested. Angles are radians; time is seconds.
 */

import type { Expression } from '../types';
import type { Offset } from './parallax';

/** VRM expression presets we drive (VRM 0.x names are mapped by three-vrm). */
export const EMOTION_PRESETS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'] as const;
export type EmotionPreset = (typeof EMOTION_PRESETS)[number];
export type EmotionWeights = Record<EmotionPreset, number>;

const NONE: EmotionWeights = { happy: 0, angry: 0, sad: 0, relaxed: 0, surprised: 0 };

const WEIGHTS: Record<Expression, Partial<EmotionWeights>> = {
  happy: { happy: 0.75 },
  shy: { happy: 0.3, relaxed: 0.35 },
  peaceful: { relaxed: 0.65 },
  depressing: { sad: 0.75 },
  angry: { angry: 0.8 },
};

export function expressionWeights(expression: Expression): EmotionWeights {
  return { ...NONE, ...WEIGHTS[expression] };
}

/** Body language per expression. */
export interface Pose {
  /** + looks down */
  headPitch: number;
  /** + tilts the head to the side */
  headRoll: number;
  /** + leans forward */
  spinePitch: number;
  /** Seconds per breath */
  breathPeriod: number;
  /** Idle sway amplitude multiplier */
  energy: number;
  /** Where the eyes drift to (-1..1); shy companions look away */
  gaze: Offset;
}

const POSES: Record<Expression, Pose> = {
  happy: {
    headPitch: -0.03,
    headRoll: -0.07,
    spinePitch: -0.02,
    breathPeriod: 3.4,
    energy: 1.3,
    gaze: { x: 0, y: 0 },
  },
  shy: {
    headPitch: 0.14,
    headRoll: 0.12,
    spinePitch: 0.04,
    breathPeriod: 3.8,
    energy: 0.7,
    gaze: { x: -0.7, y: 0.45 },
  },
  peaceful: {
    headPitch: 0.04,
    headRoll: 0.04,
    spinePitch: 0,
    breathPeriod: 5,
    energy: 0.6,
    gaze: { x: 0, y: 0.1 },
  },
  depressing: {
    headPitch: 0.24,
    headRoll: 0.03,
    spinePitch: 0.09,
    breathPeriod: 5.8,
    energy: 0.4,
    gaze: { x: 0.2, y: 0.7 },
  },
  angry: {
    headPitch: -0.06,
    headRoll: 0,
    spinePitch: -0.04,
    breathPeriod: 2.8,
    energy: 0.9,
    gaze: { x: 0, y: -0.05 },
  },
};

export function expressionPose(expression: Expression): Pose {
  return POSES[expression];
}

/** Rotations for the normalized humanoid bones this frame. */
export interface IdleFrame {
  hipsY: number;
  spineX: number;
  chestX: number;
  neckX: number;
  headX: number;
  headY: number;
  headZ: number;
  upperArmZ: number;
  lowerArmZ: number;
}

/** Upper arms rotate down from the T-pose by this much. */
export const ARM_DROP = 1.3;

/**
 * Idle motion: breathing, gentle sway, and head turned a little toward the
 * viewer. `look` is the viewer offset (-1..1). With `still`, only the pose.
 */
export function idleFrame(t: number, pose: Pose, look: Offset, still = false): IdleFrame {
  const motion = still ? 0 : 1;
  const breath = Math.sin((2 * Math.PI * t) / pose.breathPeriod) * motion;
  const sway = Math.sin(2 * Math.PI * 0.11 * t) * motion * pose.energy;
  const drift = Math.sin(2 * Math.PI * 0.07 * t + 0.8) * motion * pose.energy;
  return {
    hipsY: sway * 0.02,
    spineX: pose.spinePitch * 0.5 + breath * 0.012,
    chestX: pose.spinePitch * 0.5 + breath * 0.02,
    neckX: pose.headPitch * 0.4,
    headX: pose.headPitch * 0.6 + look.y * 0.12 + drift * 0.02,
    headY: look.x * 0.22 + sway * 0.05,
    headZ: pose.headRoll + drift * 0.03,
    upperArmZ: ARM_DROP + breath * 0.015,
    lowerArmZ: 0.2,
  };
}

// ---------------------------------------------------------------- blinking

const BLINK_S = 0.16;

/** Seconds until the next blink: 2–6 s, sometimes a quick double blink. */
export function nextBlinkDelay(rand: () => number): number {
  return rand() < 0.15 ? 0.35 : 2 + rand() * 4;
}

/** Eyelid closure 0..1 for a blink that started at `blinkStart`. */
export function blinkWeight(t: number, blinkStart: number, duration = BLINK_S): number {
  const p = (t - blinkStart) / duration;
  if (p <= 0 || p >= 1) return 0;
  return p < 0.5 ? p * 2 : (1 - p) * 2;
}

/** Stateful blinker: call value(t) every frame. */
export function createBlinker(rand: () => number = Math.random, start = 0) {
  let blinkStart = -Infinity;
  let nextAt = start + nextBlinkDelay(rand);
  return {
    value(t: number): number {
      if (t >= nextAt) {
        blinkStart = t;
        nextAt = t + BLINK_S + nextBlinkDelay(rand);
      }
      return blinkWeight(t, blinkStart);
    },
  };
}

// ---------------------------------------------------------------- eyes and camera

/** Where the eyes look, relative to the camera: wander + viewer + expression gaze. */
export function gazeOffset(t: number, pose: Pose, look: Offset, still = false): Offset {
  const motion = still ? 0 : 1;
  const wanderX = Math.sin(2 * Math.PI * 0.05 * t) * 0.25 * motion;
  const wanderY = Math.sin(2 * Math.PI * 0.031 * t + 2) * 0.12 * motion;
  return {
    x: pose.gaze.x * 0.8 + look.x * 0.6 + wanderX,
    y: pose.gaze.y * 0.5 + look.y * 0.3 + wanderY,
  };
}

export interface CameraFrame {
  /** Camera height */
  y: number;
  /** Height the camera looks at */
  targetY: number;
  /** Distance in front of the model */
  distance: number;
}

/**
 * Frame from just above the head down to the thighs, so the companion reads
 * like a character standing in front of the scene. Heights in meters.
 */
export function frameCamera(
  headY: number,
  hipsY: number,
  aspect: number,
  fovDeg: number,
): CameraFrame {
  const top = headY + 0.2;
  const bottom = hipsY - 0.3;
  const height = Math.max(0.4, top - bottom);
  const halfFov = (fovDeg * Math.PI) / 360;
  const byHeight = height / 2 / Math.tan(halfFov);
  // Keep the shoulders (~0.6 m wide) inside narrow boxes
  const byWidth = 0.6 / 2 / (Math.tan(halfFov) * Math.max(0.1, aspect));
  const targetY = (top + bottom) / 2;
  return { y: targetY + 0.04, targetY, distance: Math.max(byHeight, byWidth) };
}
