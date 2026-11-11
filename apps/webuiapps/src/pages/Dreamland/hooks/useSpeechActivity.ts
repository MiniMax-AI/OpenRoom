import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeSpeech } from '@/lib';
import { IDLE_LIPS, lipBoundary, lipEnd, lipStart, mouthOpen } from '../utils/lipSync';

const nowSeconds = () => performance.now() / 1000;

/**
 * Follows the character's browser voice. `speaking` re-renders on start/end;
 * `getMouthOpen()` is cheap to call every animation frame (0..1).
 */
export function useSpeechActivity(): { speaking: boolean; getMouthOpen: () => number } {
  const lips = useRef(IDLE_LIPS);
  const [speaking, setSpeaking] = useState(false);

  useEffect(
    () =>
      subscribeSpeech((event) => {
        const now = nowSeconds();
        if (event.type === 'start') lips.current = lipStart(lips.current, now);
        else if (event.type === 'boundary') lips.current = lipBoundary(lips.current, now);
        else lips.current = lipEnd(lips.current, now);
        setSpeaking(lips.current.speaking);
      }),
    [],
  );

  const getMouthOpen = useCallback(() => mouthOpen(lips.current, nowSeconds()), []);
  return { speaking, getMouthOpen };
}
