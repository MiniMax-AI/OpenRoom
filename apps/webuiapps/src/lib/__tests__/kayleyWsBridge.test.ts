import { describe, it, expect, vi } from 'vitest';
import { registerKayleyWsSender, sendKayleyWsPayload } from '../kayleyWsBridge';

describe('kayleyWsBridge', () => {
  it('sendKayleyWsPayload invokes the registered sender', () => {
    const fn = vi.fn();
    const off = registerKayleyWsSender(fn);
    sendKayleyWsPayload({ type: 'openroom_mystery_turn', summary: 'x' });
    expect(fn).toHaveBeenCalledWith({ type: 'openroom_mystery_turn', summary: 'x' });
    off();
  });

  it('after unregister, payloads are dropped', () => {
    const fn = vi.fn();
    const off = registerKayleyWsSender(fn);
    off();
    sendKayleyWsPayload({ type: 'x' });
    expect(fn).not.toHaveBeenCalled();
  });
});
