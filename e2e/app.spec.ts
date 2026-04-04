import { test, expect } from '@playwright/test';

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

  test('typing a message without LLM config opens settings instead of sending', async ({
    page,
  }) => {
    // Stub the config API so the app sees no LLM config (unconfigured state)
    await page.route('**/api/llm-config', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: '{}',
      }); // Empty JSON object → no config
    });
    await page.goto('/');
    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');
    const messages = page.locator('[data-testid="chat-messages"]');
    const settingsModal = page.locator('[data-testid="settings-modal"]');

    await input.fill('Test message from E2E');
    await sendBtn.click();

    await expect(settingsModal).toBeVisible();
    await expect(messages).not.toContainText('Test message from E2E');
    await expect(input).toHaveValue('Test message from E2E');
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
