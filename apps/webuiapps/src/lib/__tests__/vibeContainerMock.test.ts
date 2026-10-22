import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub modules before importing the module under test
vi.mock('../diskStorage', () => ({
  listFiles: vi.fn().mockResolvedValue([]),
  getFile: vi.fn().mockResolvedValue(null),
  putTextFilesByJSON: vi.fn().mockResolvedValue(undefined),
  deleteFilesByPaths: vi.fn().mockResolvedValue(undefined),
  searchFiles: vi.fn().mockResolvedValue([]),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('i18next', () => ({ default: { language: 'en' } }));

const DIARY_APP_ID = 4;

/**
 * Helper: register a listener that handles the given appId and sends back action_result.
 * Returns a list of received action_types for assertions.
 */
function registerListener(
  manager: ReturnType<typeof import('../vibeContainerMock').initVibeApp>,
  appId: number,
) {
  const received: string[] = [];
  manager.onAgentMessage((payload: { content: string }) => {
    const action = JSON.parse(payload.content);
    if (action.app_id === appId) {
      received.push(action.action_type);
      manager.sendAgentMessage({
        id: 0,
        event_type: 1,
        app_action: action,
        action_result: 'success',
      } as never);
    }
  });
  return received;
}

describe('dispatchAgentAction – event-driven listener wait', () => {
  let dispatchAgentAction: typeof import('../vibeContainerMock').dispatchAgentAction;
  let initVibeApp: typeof import('../vibeContainerMock').initVibeApp;
  let getWindows: typeof import('../windowManager').getWindows;
  let closeWindow: typeof import('../windowManager').closeWindow;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mod = await import('../vibeContainerMock');
    dispatchAgentAction = mod.dispatchAgentAction;
    initVibeApp = mod.initVibeApp;

    const wm = await import('../windowManager');
    getWindows = wm.getWindows;
    closeWindow = wm.closeWindow;

    for (const w of getWindows()) closeWindow(w.appId);
  });

  afterEach(() => {
    for (const w of getWindows()) closeWindow(w.appId);
    vi.useRealTimers();
  });

  it('OPEN_APP then action: waits for listener registration, no fixed delay', async () => {
    await dispatchAgentAction({
      app_id: 1,
      action_type: 'OPEN_APP',
      params: { app_id: String(DIARY_APP_ID) },
    });

    const actionPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'SELECT_DATE',
      params: { date: '2026-03-21' },
    });

    // App mounts after 3 seconds (would fail with old 1500ms fixed delay)
    const manager = initVibeApp();
    setTimeout(() => registerListener(manager, DIARY_APP_ID), 3000);

    await vi.advanceTimersByTimeAsync(4000);

    const result = await actionPromise;
    expect(result).toBe('success');
  });

  it('dispatches immediately when listener is already registered (optimistic path)', async () => {
    // Listener registered BEFORE OPEN_APP
    const manager = initVibeApp();
    const received = registerListener(manager, DIARY_APP_ID);

    await dispatchAgentAction({
      app_id: 1,
      action_type: 'OPEN_APP',
      params: { app_id: String(DIARY_APP_ID) },
    });

    const actionPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'CREATE_ENTRY',
      params: { filePath: '/entries/test.json' },
    });

    // Optimistic dispatch should succeed on the very first tick
    await vi.advanceTimersByTimeAsync(50);

    const result = await actionPromise;
    expect(received).toContain('CREATE_ENTRY');
    expect(result).toContain('success');
  });

  it('handles very slow app mount (5 seconds) without timeout', async () => {
    await dispatchAgentAction({
      app_id: 1,
      action_type: 'OPEN_APP',
      params: { app_id: String(DIARY_APP_ID) },
    });

    const actionPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'SELECT_DATE',
      params: { date: '2026-03-21' },
    });

    const manager = initVibeApp();
    setTimeout(() => registerListener(manager, DIARY_APP_ID), 5000);

    await vi.advanceTimersByTimeAsync(6000);

    const result = await actionPromise;
    expect(result).toBe('success');
  });

  it('times out if no listener ever registers', async () => {
    const { openWindow: directOpen } = await import('../windowManager');
    directOpen(DIARY_APP_ID);

    const actionPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'SELECT_DATE',
      params: { date: '2026-03-21' },
    });

    await vi.advanceTimersByTimeAsync(25000);

    const result = await actionPromise;
    expect(result).toBe('timeout: no response from app');
  });

  it('second action on same app dispatches immediately after first succeeds', async () => {
    await dispatchAgentAction({
      app_id: 1,
      action_type: 'OPEN_APP',
      params: { app_id: String(DIARY_APP_ID) },
    });

    // First action: needs to wait for listener
    const firstPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'SELECT_DATE',
      params: { date: '2026-03-21' },
    });

    const manager = initVibeApp();
    const received = registerListener(manager, DIARY_APP_ID);

    // Wait for listener registration → re-dispatch → first action succeeds
    // setTimeout(dispatch, 0) in the re-dispatch path needs a tick
    await vi.advanceTimersByTimeAsync(50);
    const firstResult = await firstPromise;
    expect(firstResult).toBe('success');

    // Second action: snapshot was deleted, should dispatch immediately
    const secondPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'CREATE_ENTRY',
      params: { filePath: '/entries/test.json' },
    });

    await vi.advanceTimersByTimeAsync(50);
    const secondResult = await secondPromise;
    expect(secondResult).toContain('success');
    expect(received).toEqual(['SELECT_DATE', 'CREATE_ENTRY']);
  });

  it('auto-opens window for non-OS action when window is not open', async () => {
    // Skip OPEN_APP — dispatch directly to an app whose window is not open
    const manager = initVibeApp();

    const actionPromise = dispatchAgentAction({
      app_id: DIARY_APP_ID,
      action_type: 'SELECT_DATE',
      params: { date: '2026-03-21' },
    });

    // Flush microtasks so the async function reaches openWindow()
    await vi.advanceTimersByTimeAsync(0);

    // Window should have been auto-opened
    expect(getWindows().some((w) => w.appId === DIARY_APP_ID)).toBe(true);

    // Listener registers after mount
    setTimeout(() => registerListener(manager, DIARY_APP_ID), 1000);

    await vi.advanceTimersByTimeAsync(2000);

    const result = await actionPromise;
    expect(result).toBe('success');
  });

  it('Mystery (app 17) uses extended agent-dispatch timeout', async () => {
    const MYSTERY_APP_ID = 17;
    const { openWindow: directOpen } = await import('../windowManager');
    directOpen(MYSTERY_APP_ID);

    const actionPromise = dispatchAgentAction({
      app_id: MYSTERY_APP_ID,
      action_type: 'INTERROGATE',
      params: { suspect_id: 'priya' },
    });

    await vi.advanceTimersByTimeAsync(30_000);
    const early = await Promise.race([
      actionPromise.then(() => 'settled'),
      Promise.resolve('pending'),
    ]);
    expect(early).toBe('pending');

    await vi.advanceTimersByTimeAsync(45_000);
    const result = await actionPromise;
    expect(result).toBe('timeout: no response from app');
  });
});
