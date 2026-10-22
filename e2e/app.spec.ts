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

  test('displays control buttons (chat, wallpaper, upload, report)', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="wallpaper-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="report-toggle"]')).toBeVisible();
  });
});

test.describe('Chat panel – visibility toggle', () => {
  test('chat panel can be opened and closed from the bar button', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-testid="chat-panel"]');
    const toggle = page.locator('[data-testid="chat-toggle"]');

    // Panel starts closed in hosted-layout UX
    await expect(panel).not.toBeVisible();

    // Open it
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();

    // Close it
    await toggle.click();
    await expect(panel).not.toBeVisible();
  });

  test('chat panel shows either setup hint or chat messages', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="chat-toggle"]').click();
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
  test('settings button is hidden in windowed chat layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="chat-toggle"]').click();
    // ChatWindow renders ChatPanel in `windowed` mode, which intentionally
    // hides ChatPanel's internal header actions (including settings).
    await expect(page.locator('[data-testid="settings-btn"]')).toHaveCount(0);
  });
});

test.describe('Chat panel – input interaction', () => {
  test('send button is disabled when input is empty and enabled when text is entered', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-testid="chat-toggle"]').click();
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
