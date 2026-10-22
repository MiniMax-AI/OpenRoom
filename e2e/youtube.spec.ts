import { expect, test } from '@playwright/test';

test.describe('YouTubeApp – search', () => {
  test('can open YouTubeApp and perform a search', async ({ page }) => {
    await page.goto('/');

    const youtubeIcon = page.locator('[data-testid="app-icon-3"]');
    await expect(youtubeIcon).toBeVisible();
    await youtubeIcon.dblclick();

    const appWindow = page.locator('[data-testid="app-window-3"]');
    await expect(appWindow).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="youtube-search-input"]');
    const submit = page.locator('[data-testid="youtube-search-submit"]');

    await expect(input).toBeVisible();
    await input.fill('dogs');
    await expect(submit).toBeEnabled();
    await submit.click();

    const results = page.locator('[data-testid="youtube-results"]');
    await expect(results).toBeVisible({ timeout: 10000 });

    const cards = page.locator('[data-testid^="youtube-result-"]');
    await expect(cards).not.toHaveCount(0);

    // In stub mode titles are prefixed with [query]; with real API results, 'dogs'
    // typically appears in titles/snippets. Keep assertion flexible.
    await expect(page.locator('body')).toContainText(/dogs/i);
  });
});

