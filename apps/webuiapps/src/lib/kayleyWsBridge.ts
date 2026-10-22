/**
 * Lets any part of the app (e.g. MysteryApp) send a JSON payload on the
 * Kayley dashboard WebSocket without prop-drilling through ChatPanel.
 * useKayleyChannel registers the sender when the socket is open.
 */

export type KayleyWsPayload = Record<string, unknown>;

let sender: ((payload: KayleyWsPayload) => void) | null = null;

export function registerKayleyWsSender(fn: (payload: KayleyWsPayload) => void): () => void {
  sender = fn;
  return () => {
    sender = null;
  };
}

export function sendKayleyWsPayload(payload: KayleyWsPayload): void {
  sender?.(payload);
}
