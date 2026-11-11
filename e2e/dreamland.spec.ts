import { test, expect, type Page, type Route } from '@playwright/test';
import { buildTestVrm } from './fixtures/testVrm';

// Headless Chromium has no GPU: use the software WebGL renderer for the 3D companion
test.use({
  launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
});

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

  test('paints pictures automatically and on request', async ({ page }) => {
    await setup(page, { imageGen: true });
    const prompts: string[] = [];
    await page.route('https://image.pollinations.ai/**', (route) => {
      prompts.push(decodeURIComponent(new URL(route.request().url()).pathname));
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    const win = await openDreamland(page);
    const scene = win.locator('[data-testid="dl-scene"]');

    // The starter dream has no picture: it is painted once, by itself, quietly
    await expect(scene).toHaveAttribute('data-has-image', 'true', { timeout: 10000 });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('no people');
    await expect(win.locator('[data-testid="dl-bg-image"]')).toHaveClass(/kenBurns/);
    await expect(win.locator('[data-testid="dl-toast"]')).toHaveCount(0);

    await win.locator('[data-testid="dl-edit-btn"]').click();
    await win
      .locator('[data-testid="dl-scene-input"]')
      .fill('A crystal cave lit by glowing mushrooms');
    const button = win.locator('[data-testid="dl-regenerate-btn"]');
    await expect(button).toBeEnabled();
    await button.click();

    await expect(win.locator('[data-testid="dl-toast"]')).toHaveText('New background painted', {
      timeout: 10000,
    });
    await expect(win.locator('[data-testid="dl-bg-image"]')).toHaveAttribute(
      'src',
      /^(data:image|\/api)/,
    );
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('A crystal cave lit by glowing mushrooms, at dusk');

    // Back to the painted sky: it stays that way, also after a reload
    await win.locator('[data-testid="dl-clear-image-btn"]').click();
    await expect(scene).toHaveAttribute('data-has-image', 'false');
    await page.waitForTimeout(800);
    await page.reload();
    const win2 = await openDreamland(page);
    await expect(win2.locator('[data-testid="dl-title"]')).toHaveText('Floating Isles');
    await page.waitForTimeout(500);
    await expect(win2.locator('[data-testid="dl-scene"]')).toHaveAttribute(
      'data-has-image',
      'false',
    );
    expect(prompts).toHaveLength(2);
  });

  test.describe('3D companion', () => {
    test('a 3D companion can be uploaded, shown, kept and removed', async ({ page }) => {
      await setup(page);
      const win = await openDreamland(page);
      const avatar = win.locator('[data-testid="dl-avatar"]');
      await expect(avatar).toHaveAttribute('data-renderer', 'sprite');

      await win.locator('[data-testid="dl-edit-btn"]').click();
      const status = win.locator('[data-testid="dl-companion-status"]');
      await expect(status).toContainText('dream sprite');

      // Not a model: refused with a message
      await win.locator('[data-testid="dl-model-input"]').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });
      await expect(win.locator('[data-testid="dl-toast"]')).toHaveText('Choose a .vrm file');
      await win.locator('[data-testid="dl-model-input"]').setInputFiles({
        name: 'fake.vrm',
        mimeType: 'application/octet-stream',
        buffer: Buffer.alloc(64, 1),
      });
      await expect(win.locator('[data-testid="dl-toast"]')).toHaveText(
        'This file is not a VRM model',
      );

      const vrm = buildTestVrm();
      await win.locator('[data-testid="dl-model-input"]').setInputFiles({
        name: 'Companion.vrm',
        mimeType: 'application/octet-stream',
        buffer: vrm,
      });
      await expect(win.locator('[data-testid="dl-toast"]')).toHaveText('Your 3D companion is here');
      await expect(status).toContainText('Companion.vrm');
      await expect(win.locator('[data-testid="dl-vrm"]')).toHaveAttribute(
        'data-vrm-state',
        'ready',
        {
          timeout: 15000,
        },
      );
      await expect(avatar).toHaveAttribute('data-renderer', 'vrm');
      await win.locator('[data-testid="dl-inspector"] button[aria-label="Close"]').first().click();

      // Expressions still change and the model keeps the name label
      await expect(avatar).toHaveAttribute('aria-label', /Aoi/);

      // Kept across reloads
      await page.waitForTimeout(800);
      await page.reload();
      const win2 = await openDreamland(page);
      await expect(win2.locator('[data-testid="dl-vrm"]')).toHaveAttribute(
        'data-vrm-state',
        'ready',
        { timeout: 15000 },
      );
      await expect(win2.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
        'data-renderer',
        'vrm',
      );

      await win2.locator('[data-testid="dl-edit-btn"]').click();
      await win2.locator('[data-testid="dl-model-remove-btn"]').click();
      await expect(win2.locator('[data-testid="dl-toast"]')).toHaveText('3D model removed');
      await expect(win2.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
        'data-renderer',
        'sprite',
      );
      await expect(win2.locator('[data-testid="dl-vrm"]')).toHaveCount(0);
    });

    test('a broken 3D model falls back to the dream sprite', async ({ page }) => {
      await setup(page);
      const win = await openDreamland(page);
      await win.locator('[data-testid="dl-edit-btn"]').click();
      // Valid header, broken content
      const broken = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(200, 7)]);
      await win.locator('[data-testid="dl-model-input"]').setInputFiles({
        name: 'broken.vrm',
        mimeType: 'application/octet-stream',
        buffer: broken,
      });
      await expect(win.locator('[data-testid="dl-companion-failed"]')).toBeVisible({
        timeout: 15000,
      });
      await expect(win.locator('[data-testid="dl-toast"]')).toContainText(
        'Could not show your 3D companion',
      );
      await expect(win.locator('[data-testid="dl-avatar"]')).toHaveAttribute(
        'data-renderer',
        'sprite',
      );
    });
  });

  test('the scene has depth that follows the mouse', async ({ page }) => {
    await setup(page);
    const win = await openDreamland(page);
    const root = win.locator('[data-testid="dreamland"]');
    await expect(win.locator('[data-testid="dl-bloom"]')).toBeVisible();
    await expect(win.locator('[data-testid="dl-mood-light"]')).toBeAttached();
    await expect(win.locator('[data-testid="dl-shimmer"]')).toBeAttached();

    const box = await root.boundingBox();
    if (!box) throw new Error('no app box');
    const px = () => root.evaluate((el) => Number(el.style.getPropertyValue('--dl-px') || 0));
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.5);
    await expect.poll(px).toBeGreaterThan(0.5);
    await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.5);
    await expect.poll(px).toBeLessThan(-0.5);
    // Back layers move against the pointer
    const transform = await win
      .locator('[data-testid="dl-depth-back"]')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe('none');
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

  test('on a phone the scene can follow device tilt', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await setup(page);
    const win = await openDreamland(page, { mobile: true });
    await win.locator('[data-testid="dl-edit-btn"]').click();
    const toggle = win.locator('[data-testid="dl-tilt-toggle"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const root = win.locator('[data-testid="dreamland"]');
    const tilt = (beta: number, gamma: number) =>
      page.evaluate(
        ([b, g]) =>
          window.dispatchEvent(
            Object.assign(new Event('deviceorientation'), { beta: b, gamma: g, alpha: 0 }),
          ),
        [beta, gamma],
      );
    await tilt(40, 0); // resting position
    await tilt(40, 15); // tilt to the right
    await expect
      .poll(() => root.evaluate((el) => Number(el.style.getPropertyValue('--dl-px') || 0)))
      .toBeGreaterThan(0.3);
    await context.close();
  });
});
