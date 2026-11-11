import { useEffect, useRef, type RefObject } from 'react';
import { listenTilt, screenAngle } from '../services/motionInput';
import {
  CENTER,
  driftBaseline,
  offsetChanged,
  pointerOffset,
  smoothOffset,
  tiltOffset,
  type Offset,
  type Tilt,
} from '../utils/parallax';

interface ParallaxOptions {
  /** Off under reduced motion */
  enabled: boolean;
  /** Follow device tilt (phones, after permission) */
  tilt: boolean;
}

/**
 * Drives the scene's depth: the mouse (desktop) or device tilt (phones) sets
 * an offset that is eased and written to the CSS variables --dl-px / --dl-py
 * on the root element. Layers translate by those times their depth.
 * Returns a ref with the current eased offset (the 3D companion looks there).
 */
export function useParallax(
  rootRef: RefObject<HTMLElement>,
  { enabled, tilt }: ParallaxOptions,
): RefObject<Offset> {
  const offsetRef = useRef<Offset>(CENTER);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const write = (o: Offset) => {
      root.style.setProperty('--dl-px', o.x.toFixed(4));
      root.style.setProperty('--dl-py', o.y.toFixed(4));
    };
    if (!enabled) {
      offsetRef.current = CENTER;
      write(CENTER);
      return;
    }

    let target: Offset = CENTER;
    let current: Offset = offsetRef.current;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const next = smoothOffset(current, target, dt);
      const moved = offsetChanged(next, current, 0.0005);
      current = next;
      offsetRef.current = current;
      write(current);
      frame = moved || offsetChanged(current, target) ? requestAnimationFrame(tick) : 0;
      if (!frame) last = 0;
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      target = pointerOffset(event.clientX, event.clientY, root.getBoundingClientRect());
      kick();
    };
    const onPointerLeave = () => {
      target = CENTER;
      kick();
    };
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerleave', onPointerLeave);

    let stopTilt = () => undefined as void;
    if (tilt) {
      let baseline: Tilt | null = null;
      let lastTilt = 0;
      stopTilt = listenTilt((reading) => {
        const now = performance.now();
        const dt = lastTilt ? (now - lastTilt) / 1000 : 0;
        lastTilt = now;
        baseline = baseline ? driftBaseline(baseline, reading, dt) : reading;
        target = tiltOffset(reading, baseline, screenAngle());
        kick();
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      stopTilt();
    };
  }, [rootRef, enabled, tilt]);

  return offsetRef;
}
