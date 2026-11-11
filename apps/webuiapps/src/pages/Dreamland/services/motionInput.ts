/**
 * Device tilt input. iOS Safari only delivers orientation events after
 * DeviceOrientationEvent.requestPermission() was called inside a user gesture
 * (tap/click); other browsers deliver them without asking.
 */

import type { Tilt } from '../utils/parallax';

type PermissionFn = () => Promise<'granted' | 'denied' | 'default' | string>;

interface OrientationCtor {
  requestPermission?: PermissionFn;
}

function orientationCtor(): OrientationCtor | null {
  const ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor })
    .DeviceOrientationEvent;
  return ctor ?? null;
}

/** The browser knows device orientation events at all. */
export function isTiltSupported(): boolean {
  return orientationCtor() !== null;
}

/** Touch-first device (phone/tablet), where tilt makes sense. */
export function isTouchDevice(): boolean {
  return !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** iOS Safari: tilt needs a permission prompt from a user gesture. */
export function needsMotionPermission(): boolean {
  return typeof orientationCtor()?.requestPermission === 'function';
}

/**
 * Ask for tilt access. Call it synchronously from a click/tap handler.
 * Resolves true when tilt events will arrive.
 */
export async function requestMotionPermission(): Promise<boolean> {
  const ctor = orientationCtor();
  if (!ctor) return false;
  if (typeof ctor.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    // Called outside a gesture, or the user dismissed the prompt
    return false;
  }
}

/** Current screen rotation in degrees. */
export function screenAngle(): number {
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === 'number') return angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/** Listen to tilt; readings without values (desktop browsers) are ignored. */
export function listenTilt(onTilt: (tilt: Tilt) => void): () => void {
  const handler = (event: DeviceOrientationEvent) => {
    if (typeof event.beta !== 'number' || typeof event.gamma !== 'number') return;
    onTilt({ beta: event.beta, gamma: event.gamma });
  };
  window.addEventListener('deviceorientation', handler);
  return () => window.removeEventListener('deviceorientation', handler);
}
