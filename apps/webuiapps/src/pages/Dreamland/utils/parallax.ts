/**
 * Parallax input math. An offset is where the viewer "looks from", -1..1 on
 * each axis (0 = centered). Layers move by offset × their depth in CSS.
 */

export interface Offset {
  x: number;
  y: number;
}

export interface Tilt {
  /** Front/back tilt in degrees (DeviceOrientationEvent.beta) */
  beta: number;
  /** Left/right tilt in degrees (DeviceOrientationEvent.gamma) */
  gamma: number;
}

export const CENTER: Offset = { x: 0, y: 0 };

/** Degrees of tilt that reach the edge of the parallax range. */
export const TILT_RANGE_DEG = 18;

export const clamp = (value: number, min = -1, max = 1): number =>
  Math.min(max, Math.max(min, value));

/** Pointer position inside a box → offset (center 0, edges ±1). */
export function pointerOffset(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Offset {
  if (rect.width <= 0 || rect.height <= 0) return CENTER;
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 2 - 1),
    y: clamp(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

/**
 * Tilt relative to the resting position → offset. `screenAngle` is the screen
 * rotation (0, 90, 180, 270 / -90) so landscape phones move the right way.
 */
export function tiltOffset(
  tilt: Tilt,
  baseline: Tilt,
  screenAngle = 0,
  range = TILT_RANGE_DEG,
): Offset {
  const db = tilt.beta - baseline.beta;
  const dg = tilt.gamma - baseline.gamma;
  const angle = (((Math.round(screenAngle / 90) * 90) % 360) + 360) % 360;
  let x: number;
  let y: number;
  switch (angle) {
    case 90:
      x = db;
      y = -dg;
      break;
    case 180:
      x = -dg;
      y = -db;
      break;
    case 270:
      x = -db;
      y = dg;
      break;
    default:
      x = dg;
      y = db;
  }
  return { x: clamp(x / range), y: clamp(y / range) };
}

/**
 * Let the resting position follow the phone slowly, so holding it at any
 * angle becomes the new center after a few seconds.
 */
export function driftBaseline(baseline: Tilt, tilt: Tilt, dt: number, rate = 0.35): Tilt {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return {
    beta: baseline.beta + (tilt.beta - baseline.beta) * k,
    gamma: baseline.gamma + (tilt.gamma - baseline.gamma) * k,
  };
}

/** Frame-rate independent easing toward a target. */
export function approach(current: number, target: number, dt: number, rate: number): number {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return current + (target - current) * k;
}

export function smoothOffset(current: Offset, target: Offset, dt: number, rate = 5): Offset {
  return {
    x: approach(current.x, target.x, dt, rate),
    y: approach(current.y, target.y, dt, rate),
  };
}

/** True when the offset changed enough to be worth a style update. */
export function offsetChanged(a: Offset, b: Offset, epsilon = 0.001): boolean {
  return Math.abs(a.x - b.x) > epsilon || Math.abs(a.y - b.y) > epsilon;
}
