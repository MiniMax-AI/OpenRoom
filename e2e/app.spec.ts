import { test, expect, type Page } from '@playwright/test';

/**
 * Give the app a usable LLM config and a canned LLM reply, so sending a message
 * works the same on every machine (no ~/.openroom/config.json or network needed).
 */
async function mockLLM(page: Page) {
  const llm = {
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'http://llm.test/v1',
    model: 'test-model',
  };
  // Start from an empty session and keep test chats out of ~/.openroom/sessions
  await page.route('**/api/session-data**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
  await page.route('**/api/llm-config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ llm }) }),
  );
  const reply = {
    choices: [{ message: { role: 'assistant', content: 'Mock reply' }, finish_reason: 'stop' }],
  };
  const fulfillLLM = (route: import('@playwright/test').Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(reply),
        });
  await page.route('**/api/llm-proxy', fulfillLLM);
  await page.route('http://llm.test/**', fulfillLLM);
}

test.describe('Shell – main UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the shell with desktop app icons', async ({ page }) => {
    await expect(page).toHaveTitle('OpenRoom');
    const shell = page.locator('[data-testid="shell"]');
    await expect(shell).toBeVisible();

    const desktop = page.locator('[data-testid="desktop"]');
    await expect(desktop).toBeVisible();

    // Should have multiple app icons on the desktop
    const icons = page.locator('[data-testid^="app-icon-"]');
    await expect(icons).not.toHaveCount(0);
    const count = await icons.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('displays control buttons (chat, lang, wallpaper, report)', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="lang-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="wallpaper-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="report-toggle"]')).toBeVisible();
  });
});

test.describe('Chat panel – visibility toggle', () => {
  test('chat panel is visible by default and can be hidden and re-shown', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-testid="chat-panel"]');
    const toggle = page.locator('[data-testid="chat-toggle"]');

    // Panel visible by default
    await expect(panel).toBeVisible();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();

    // Hide it
    await toggle.click();
    await expect(panel).not.toBeVisible();

    // Show it again
    await toggle.click();
    await expect(panel).toBeVisible();
  });

  test('chat panel shows either setup hint or chat messages', async ({ page }) => {
    await page.goto('/');
    const messages = page.locator('[data-testid="chat-messages"]');
    await expect(messages).toBeVisible();

    const emptyStateHint = messages.getByText(/configure your LLM API key|is ready to chat/i);
    const chatMessages = page.locator('[data-testid="chat-message"]');

    await expect
      .poll(async () => {
        return (await emptyStateHint.count()) + (await chatMessages.count());
      })
      .toBeGreaterThan(0);
  });
});

test.describe('Chat panel – settings modal', () => {
  test('opens and closes the settings modal', async ({ page }) => {
    await page.goto('/');
    const settingsBtn = page.locator('[data-testid="settings-btn"]');
    await expect(settingsBtn).toBeVisible();

    // Open settings
    await settingsBtn.click();
    const modal = page.locator('[data-testid="settings-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('LLM Settings');

    // Close via Cancel button
    await modal.locator('button', { hasText: 'Cancel' }).click();
    await expect(modal).not.toBeVisible();
  });
});

test.describe('Chat panel – input interaction', () => {
  test('send button is disabled when input is empty and enabled when text is entered', async ({
    page,
  }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');

    // Initially disabled
    await expect(sendBtn).toBeDisabled();

    // Type something
    await input.fill('Hello');
    await expect(sendBtn).toBeEnabled();

    // Clear it
    await input.fill('');
    await expect(sendBtn).toBeDisabled();
  });

  test('typing a message and clicking send adds it to the messages area', async ({ page }) => {
    await mockLLM(page);
    await page.goto('/');
    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');
    const messages = page.locator('[data-testid="chat-messages"]');

    await input.fill('Test message from E2E');
    await sendBtn.click();

    // The user message should appear in the messages area
    await expect(messages).toContainText('Test message from E2E');
    // Input should be cleared after sending
    await expect(input).toHaveValue('');
  });

  test('pressing Enter on desktop sends and keeps the input focused', async ({ page }) => {
    await mockLLM(page);
    await page.goto('/');
    const input = page.locator('[data-testid="chat-input"]');

    await input.fill('Desktop enter message');
    await input.press('Enter');

    await expect(page.locator('[data-testid="chat-messages"]')).toContainText(
      'Desktop enter message',
    );
    await expect(input).toBeFocused();
  });
});

test.describe('Chat panel – mobile keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('pressing Enter sends the message and dismisses the keyboard', async ({ page }) => {
    await mockLLM(page);
    await page.goto('/');
    const input = page.locator('[data-testid="chat-input"]');
    await expect(input).toHaveAttribute('enterkeyhint', 'send');

    await input.tap();
    await input.fill('Mobile enter message');
    await expect(input).toBeFocused();
    await input.press('Enter');

    await expect(page.locator('[data-testid="chat-messages"]')).toContainText(
      'Mobile enter message',
    );
    await expect(input).toHaveValue('');
    // Blurring the textarea is what closes the on-screen keyboard
    await expect(input).not.toBeFocused();
  });

  test('chat panel fits the visible viewport height', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('[data-testid="chat-panel"]').boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(box).not.toBeNull();
    expect(Math.round(box!.height)).toBeLessThanOrEqual(viewportHeight);
    await expect(page.locator('[data-testid="chat-input"]')).toBeInViewport();
  });

  test('chat input and send button are not covered by the floating controls', async ({ page }) => {
    await page.goto('/');
    for (const testId of ['chat-input', 'send-btn']) {
      const target = page.locator(`[data-testid="${testId}"]`);
      await expect(target).toBeVisible();
      const hitsSelf = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const points = [
          [r.left + 4, r.top + r.height / 2],
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.right - 4, r.top + r.height / 2],
        ];
        return points.every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return !!hit && (hit === el || el.contains(hit));
        });
      });
      expect(hitsSelf, `${testId} is covered by another element`).toBe(true);
    }
  });
});

test.describe('App window – open and close', () => {
  test('double-clicking an app icon opens a window, closing it removes the window', async ({
    page,
  }) => {
    await page.goto('/');

    // Double-click the Twitter icon (appId=2)
    const twitterIcon = page.locator('[data-testid="app-icon-2"]');
    await expect(twitterIcon).toBeVisible();
    await twitterIcon.dblclick();

    // An app window should appear
    const appWindow = page.locator('[data-testid="app-window-2"]');
    await expect(appWindow).toBeVisible({ timeout: 10000 });

    // Close it
    const closeBtn = page.locator('[data-testid="window-close-2"]');
    await closeBtn.click();
    await expect(appWindow).not.toBeVisible();
  });
});

test.describe('Language toggle', () => {
  test('clicking the language toggle changes its label', async ({ page }) => {
    await page.goto('/');
    const langBtn = page.locator('[data-testid="lang-toggle"]');

    // Default is EN
    await expect(langBtn).toContainText('EN');

    // Toggle to ZH
    await langBtn.click();
    await expect(langBtn).toContainText('ZH');

    // Toggle back
    await langBtn.click();
    await expect(langBtn).toContainText('EN');
  });
});

/**
 * Mock an LLM that answers with a respond_to_user tool call (the real chat format),
 * and record speech instead of playing it.
 */
type ReplyMode =
  | 'tool' // respond_to_user tool call, then an empty final turn
  | 'plain' // plain text only, no tool call
  | 'tool-then-echo'; // tool call, then the same text again as plain text

async function mockCharacterReply(
  page: Page,
  content: string,
  replies: string[],
  mode: ReplyMode = 'tool',
) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: string[] = [];
    w.__spoken = spoken;
    class FakeUtterance {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      constructor(text: string) {
        this.text = text;
      }
    }
    const synth = {
      getVoices: () => [
        { name: 'Fred', lang: 'en-US', localService: true },
        { name: 'Samantha', lang: 'en-US', localService: true },
      ],
      speak: (u: FakeUtterance) => {
        if (u.volume > 0) spoken.push(`${(u.voice as { name: string } | null)?.name}: ${u.text}`);
      },
      cancel: () => {},
      resume: () => {},
      speaking: false,
      pending: false,
      paused: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
    });
  });
  await mockLLM(page);
  const toolReply = {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'respond_to_user',
                arguments: JSON.stringify({
                  character_expression: { content, emotion: 'happy' },
                  user_interaction: { suggested_replies: replies },
                }),
              },
            },
          ],
        },
      },
    ],
  };
  const plain = (text: string) => ({
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  });
  // After the tool result comes back, end the turn (or echo the reply, as some models do).
  const done = plain(mode === 'tool-then-echo' ? content : '');
  const fulfill = (route: import('@playwright/test').Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      messages?: Array<{ role: string }>;
    };
    const afterTool = body.messages?.at(-1)?.role === 'tool';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mode === 'plain' ? plain(content) : afterTool ? done : toolReply),
    });
  };
  await page.unroute('**/api/llm-proxy');
  await page.unroute('http://llm.test/**');
  await page.route('**/api/llm-proxy', fulfill);
  await page.route('http://llm.test/**', fulfill);
}

test.describe('Chat panel – user name placeholders', () => {
  test('replaces [name] in replies and hides placeholder suggestions', async ({ page }) => {
    await mockCharacterReply(page, "(grins) I don't take 'just [name]' for an answer.", [
      "It's [name]. And yours?",
      'Why does it matter?',
    ]);
    await page.goto('/');
    await page.locator('[data-testid="chat-input"]').fill('Hello');
    await page.locator('[data-testid="send-btn"]').click();

    const messages = page.locator('[data-testid="chat-messages"]');
    await expect(messages).toContainText("I don't take 'just you' for an answer.");
    await expect(messages).not.toContainText('[name]');
    const suggestions = page.locator('[data-testid="suggested-reply"]');
    await expect(suggestions).toHaveCount(1);
    await expect(suggestions.first()).toHaveText('Why does it matter?');
  });
});

test.describe('Chat panel – voice', () => {
  test('voice toggle reads replies aloud with a female voice, and mutes', async ({ page }) => {
    await mockCharacterReply(page, '(smiles) Welcome aboard, traveler!', ['Thanks!']);
    await page.goto('/');
    const toggle = page.locator('[data-testid="tts-toggle"]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.locator('[data-testid="chat-input"]').fill('Hi');
    await page.locator('[data-testid="send-btn"]').click();
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Welcome aboard');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken))
      .toEqual(['Samantha: Voice on.', 'Samantha: Welcome aboard, traveler!']);

    // Preference survives a reload
    await page.reload();
    await expect(page.locator('[data-testid="tts-toggle"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Muting stops further speech
    await page.locator('[data-testid="tts-toggle"]').click();
    await expect(page.locator('[data-testid="tts-toggle"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.locator('[data-testid="chat-input"]').fill('Again');
    await page.locator('[data-testid="send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message"]').last()).toContainText('Welcome');
    expect(
      await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken),
    ).toEqual([]);
  });
});

test.describe('Chat panel – replies without the respond_to_user tool', () => {
  const spoken = (page: Page) =>
    page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

  test('a plain-text reply is shown, cleaned and spoken', async ({ page }) => {
    await mockCharacterReply(page, "(leans in) The name's Aoi. And you, [name]?", [], 'plain');
    await page.goto('/');
    await page.locator('[data-testid="tts-toggle"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Who are you');
    await page.locator('[data-testid="send-btn"]').click();

    const last = page.locator('[data-testid="chat-message"]').last();
    await expect(last).toContainText("The name's Aoi. And you, you?");
    await expect
      .poll(() => spoken(page))
      .toEqual(['Samantha: Voice on.', "Samantha: The name's Aoi. And you, you?"]);
  });

  test('a plain-text echo after respond_to_user is not shown or spoken twice', async ({ page }) => {
    await mockCharacterReply(page, 'René... Nice ring to it.', ['Thanks'], 'tool-then-echo');
    await page.goto('/');
    await page.locator('[data-testid="tts-toggle"]').click();
    await page.locator('[data-testid="chat-input"]').fill('René');
    await page.locator('[data-testid="send-btn"]').click();

    await expect(page.locator('[data-testid="suggested-reply"]')).toHaveText(['Thanks']);
    await expect(
      page.locator('[data-testid="chat-message"]').filter({ hasText: 'Nice ring to it' }),
    ).toHaveCount(1);
    expect(await spoken(page)).toEqual([
      'Samantha: Voice on.',
      'Samantha: René... Nice ring to it.',
    ]);
  });
});
