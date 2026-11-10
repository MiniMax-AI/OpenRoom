import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Dreamland e2e. Storage: the session-data API is stubbed as unavailable, so
 * OpenRoom falls back to the (per-test, fresh) browser localStorage and tests
 * never touch ~/.openroom/sessions.
 */

const APP_ID = 15;
const llm = {
  provider: 'openai',
  apiKey: 'test-key',
  baseUrl: 'http://llm.test/v1',
  model: 'test-model',
};
const pollinations = {
  provider: 'pollinations',
  apiKey: '',
  baseUrl: 'https://image.pollinations.ai',
  model: 'flux',
};
// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

type LlmReply = (body: { messages: Array<{ role: string; tool_call_id?: string }> }) => unknown;

const plain = (content: string) => ({
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
});

async function setup(page: Page, opts: { imageGen?: boolean; llmReply?: LlmReply } = {}) {
  await page.route('**/api/session-data**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
  await page.route('**/api/llm-config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.imageGen ? { llm, imageGen: pollinations } : { llm }),
    }),
  );
  const fulfillLLM = (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const body = route.request().postDataJSON();
    const reply = opts.llmReply ? opts.llmReply(body) : plain('Mock reply');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reply),
    });
  };
  await page.route('**/api/llm-proxy', fulfillLLM);
  await page.route('http://llm.test/**', fulfillLLM);
}

async function openDreamland(page: Page, { mobile = false } = {}) {
  await page.goto('/');
  const icon = page.locator(`[data-testid="app-icon-${APP_ID}"]`);
  if (mobile) {
    // On phones the chat covers the desktop; close it, then tap the icon once
    if (!(await icon.isVisible())) await page.locator('[data-testid="chat-toggle"]').click();
    await icon.click();
  } else {
    await icon.dblclick();
  }
  const win = page.locator(`[data-testid="app-window-${APP_ID}"]`);
  await expect(win).toBeVisible({ timeout: 10000 });
  await expect(win.locator('[data-testid="dl-avatar"]')).toBeVisible({ timeout: 10000 });
  return win;
}

test.describe('Dreamland', () => {
  test('opens with starter dreams, a scene and the companion avatar', async ({ page }) => {
    await setup(page);
    const win = await openDreamland(page);

    await expect(win.locator('[data-testid="dl-title"]')).toHaveText('Floating Isles');
    const scene = win.locator('[data-testid="dl-scene"]');
    await expect(scene).toHaveAttribute('data-time', 'dusk');
    await expect(scene).toHaveAttribute('data-weather', 'petals');
    await expect(scene).toHaveAttribute('data-has-image', 'false');
    await expect(win.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
      'data-expression',
      'happy',
    );
    // the avatar is labelled with the active chat character
    await expect(win.locator('[data-testid="dl-avatar"]')).toHaveAttribute('aria-label', /Aoi/);

    await win.locator('[data-testid="dl-library-btn"]').click();
    const cards = win.locator('[data-testid="dl-dream-card"]');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toHaveAttribute('data-active', 'true');
  });

  test('edits apply live and are saved across reloads', async ({ page }) => {
    await setup(page);
    let win = await openDreamland(page);

    await win.locator('[data-testid="dl-edit-btn"]').click();
    const inspector = win.locator('[data-testid="dl-inspector"]');
    await expect(inspector).toBeVisible();

    await inspector.locator('[data-testid="dl-chips-weather"] [data-value="rain"]').click();
    await inspector.locator('[data-testid="dl-chips-timeOfDay"] [data-value="night"]').click();
    await inspector.locator('[data-testid="dl-chips-expression"] [data-value="shy"]').click();
    await inspector.locator('[data-testid="dl-name-input"]').fill('Rainy Isles');

    const scene = win.locator('[data-testid="dl-scene"]');
    await expect(scene).toHaveAttribute('data-weather', 'rain');
    await expect(scene).toHaveAttribute('data-time', 'night');
    await expect(win.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
      'data-expression',
      'shy',
    );
    await expect(win.locator('[data-testid="dl-title"]')).toHaveText('Rainy Isles');
    await expect(
      inspector.locator('[data-testid="dl-chips-weather"] [data-value="rain"]'),
    ).toHaveAttribute('aria-checked', 'true');

    // without image generation configured, painting is disabled with a hint
    await expect(inspector.locator('[data-testid="dl-regenerate-btn"]')).toBeDisabled();

    await page.waitForTimeout(800); // autosave debounce
    await page.reload();
    win = await openDreamland(page);
    await expect(win.locator('[data-testid="dl-title"]')).toHaveText('Rainy Isles');
    await expect(win.locator('[data-testid="dl-scene"]')).toHaveAttribute('data-weather', 'rain');
    await expect(win.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
      'data-expression',
      'shy',
    );
  });

  test('creates, switches and deletes dreams', async ({ page }) => {
    await setup(page);
    const win = await openDreamland(page);
    const title = win.locator('[data-testid="dl-title"]');

    await win.locator('[data-testid="dl-library-btn"]').click();
    await win.locator('[data-testid="dl-create-btn"]').click();
    await expect(title).toHaveText('New dream');
    await expect(win.locator('[data-testid="dl-toast"]')).toHaveText('New dream created');

    await win.locator('[data-testid="dl-library-btn"]').click();
    const cards = win.locator('[data-testid="dl-dream-card"]');
    await expect(cards).toHaveCount(4);
    await cards.filter({ hasText: 'Starlit Lake' }).locator('button').first().click();
    await expect(title).toHaveText('Starlit Lake');
    await expect(win.locator('[data-testid="dl-scene"]')).toHaveAttribute(
      'data-weather',
      'fireflies',
    );

    await win.locator('[data-testid="dl-library-btn"]').click();
    await cards.filter({ hasText: 'New dream' }).locator('[data-testid="dl-delete-btn"]').click();
    await expect(win.locator('[data-testid="dl-confirm"]')).toContainText('New dream');
    await win.locator('[data-testid="dl-confirm-ok"]').click();
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: 'New dream' })).toHaveCount(0);
    await expect(title).toHaveText('Starlit Lake');
  });

  test('paints a background with the configured image generation', async ({ page }) => {
    await setup(page, { imageGen: true });
    const prompts: string[] = [];
    await page.route('https://image.pollinations.ai/**', (route) => {
      prompts.push(decodeURIComponent(new URL(route.request().url()).pathname));
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    const win = await openDreamland(page);

    await win.locator('[data-testid="dl-edit-btn"]').click();
    await win
      .locator('[data-testid="dl-scene-input"]')
      .fill('A crystal cave lit by glowing mushrooms');
    const button = win.locator('[data-testid="dl-regenerate-btn"]');
    await expect(button).toBeEnabled();
    await button.click();

    const scene = win.locator('[data-testid="dl-scene"]');
    await expect(scene).toHaveAttribute('data-has-image', 'true', { timeout: 10000 });
    await expect(win.locator('[data-testid="dl-bg-image"]')).toHaveAttribute(
      'src',
      /^(data:image|\/api)/,
    );
    await expect(win.locator('[data-testid="dl-toast"]')).toHaveText('New background painted');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('A crystal cave lit by glowing mushrooms, at dusk');
    expect(prompts[0]).toContain('no people');

    // back to the painted sky
    await win.locator('[data-testid="dl-clear-image-btn"]').click();
    await expect(scene).toHaveAttribute('data-has-image', 'false');
  });

  test('the companion changes the dream through app actions', async ({ page }) => {
    const toolResults: string[] = [];
    const toolCall = (calls: Array<{ id: string; name: string; args: unknown }>) => ({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          },
        },
      ],
    });
    const action = (id: string, action_type: string, params: Record<string, string>) => ({
      id,
      name: 'app_action',
      args: { app_name: 'dreamland', action_type, params: JSON.stringify(params) },
    });
    await setup(page, {
      llmReply: (body) => {
        const last = body.messages.at(-1);
        // Only react to our chat message (opening the app also triggers a model turn)
        const askedForSnow = body.messages.some(
          (m) =>
            m.role === 'user' &&
            String((m as { content?: unknown }).content).includes('Make it snow'),
        );
        if (!askedForSnow) return plain('');
        if (last?.role !== 'tool') {
          return toolCall([
            action('c1', 'SET_WEATHER', { weather: 'snow' }),
            action('c2', 'SET_EXPRESSION', { expression: 'angry' }),
            action('c3', 'SET_CAPTION', { text: 'Catch a snowflake with me' }),
            action('c4', 'SET_MOOD', { mood: 'lava' }),
          ]);
        }
        if (last.tool_call_id === 'c4') {
          body.messages
            .filter((m) => m.role === 'tool')
            .forEach((m) => toolResults.push((m as unknown as { content: string }).content));
          return toolCall([
            {
              id: 'r1',
              name: 'respond_to_user',
              args: {
                character_expression: { content: 'Look, it is snowing!', emotion: 'happy' },
                user_interaction: { suggested_replies: ['Beautiful'] },
              },
            },
          ]);
        }
        return plain('');
      },
    });
    const win = await openDreamland(page);

    await page.locator('[data-testid="chat-input"]').fill('Make it snow in our dream');
    await page.locator('[data-testid="send-btn"]').click();

    await expect(win.locator('[data-testid="dl-scene"]')).toHaveAttribute('data-weather', 'snow');
    await expect(win.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
      'data-expression',
      'angry',
    );
    await expect(win.locator('[data-testid="dl-caption"]')).toHaveText('Catch a snowflake with me');
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText(
      'Look, it is snowing!',
    );
    expect(toolResults.slice(0, 3)).toEqual(['success', 'success', 'success']);
    expect(toolResults[3]).toMatch(/^error: invalid mood "lava"/);
  });

  test('sound toggle starts ambient audio only after the tap', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__audioContexts = 0;
      class Param {
        value = 0;
        setValueAtTime() {}
        linearRampToValueAtTime() {}
        setTargetAtTime() {}
        cancelScheduledValues() {}
      }
      class Node {
        gain = new Param();
        frequency = new Param();
        Q = new Param();
        type = '';
        buffer: unknown = null;
        loop = false;
        connect(n: unknown) {
          return n;
        }
        disconnect() {}
        start() {}
        stop() {}
      }
      class FakeCtx {
        state = 'running';
        currentTime = 0;
        sampleRate = 8000;
        destination = new Node();
        constructor() {
          w.__audioContexts = (w.__audioContexts as number) + 1;
        }
        resume() {
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
        createGain() {
          return new Node();
        }
        createBufferSource() {
          return new Node();
        }
        createOscillator() {
          return new Node();
        }
        createBiquadFilter() {
          return new Node();
        }
        createBuffer(_c: number, length: number) {
          const data = new Float32Array(length);
          return { getChannelData: () => data };
        }
      }
      w.AudioContext = FakeCtx;
    });
    await setup(page);
    const win = await openDreamland(page);
    const count = () =>
      page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);

    expect(await count()).toBe(0);
    const sound = win.locator('[data-testid="dl-sound-btn"]');
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    expect(await count()).toBe(1);

    // preference is remembered; audio waits for the first tap after a reload
    await page.waitForTimeout(800);
    await page.reload();
    const win2 = await openDreamland(page);
    await expect(win2.locator('[data-testid="dl-sound-btn"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await count()).toBe(0);
    await win2.locator('[data-testid="dl-title"]').click();
    expect(await count()).toBe(1);
  });

  test('editor becomes a bottom sheet on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    const win = await openDreamland(page, { mobile: true });
    await win.locator('[data-testid="dl-edit-btn"]').click();
    const sheet = win.locator('[data-testid="dl-inspector"]');
    await expect(sheet).toBeVisible();
    const app = await win.locator('[data-testid="dreamland"]').boundingBox();
    expect(app).toBeTruthy();
    // Wait for the slide-in animation to finish, then the sheet spans the width and sits at the bottom
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && app
          ? Math.round(
              Math.abs(box.width - app.width) + Math.abs(box.y + box.height - (app.y + app.height)),
            )
          : -1;
      })
      .toBeLessThanOrEqual(1);
  });
});
