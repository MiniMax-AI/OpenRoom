/** True on phones/tablets (coarse pointer), where Enter should dismiss the on-screen keyboard. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}
