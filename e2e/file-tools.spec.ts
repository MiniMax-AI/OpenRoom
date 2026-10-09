import { expect, test } from '@playwright/test';

for (const tool of ['file_write', 'file_delete']) {
  for (const outcome of ['http-error', 'network-error', 'success']) {
    test(`${tool} forwards ${outcome} to the next model request`, async ({ page, baseURL }) => {
      const filePath = 'apps/diary/data/entries/storage-result.json';
      const content = '{"text":"Synthetic entry"}';
      const toolResults: string[] = [];
      let mutationRequests = 0;
      let modelRequests = 0;

      await page.addInitScript(() => {
        localStorage.setItem(
          'webuiapps-llm-config',
          JSON.stringify({
            provider: 'openai',
            baseUrl: 'https://example.invalid',
            model: 'test-model',
            apiKey: '',
          }),
        );
      });

      // Keep every API operation synthetic, including startup and chat persistence.
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== new URL(baseURL!).origin) {
          await route.abort();
          return;
        }
        if (!url.pathname.startsWith('/api/')) {
          await route.continue();
          return;
        }

        if (url.pathname === '/api/llm-proxy') {
          modelRequests++;
          const body = request.postDataJSON();
          if (modelRequests === 1) {
            await route.fulfill({
              json: {
                choices: [
                  {
                    message: {
                      content: '',
                      tool_calls: [
                        {
                          id: 'storage-call',
                          type: 'function',
                          function: {
                            name: tool,
                            arguments: JSON.stringify({ file_path: filePath, content }),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            });
          } else {
            const result = body.messages.find(
              (message: { role: string; tool_call_id?: string }) =>
                message.role === 'tool' && message.tool_call_id === 'storage-call',
            );
            toolResults.push(result?.content ?? 'missing tool result');
            await route.fulfill({
              json: { choices: [{ message: { content: 'Storage result received.' } }] },
            });
          }
          return;
        }

        if (
          url.pathname === '/api/session-data' &&
          url.searchParams.get('path')?.endsWith(filePath)
        ) {
          mutationRequests++;
          expect(request.method()).toBe(tool === 'file_write' ? 'POST' : 'DELETE');
          if (tool === 'file_write') expect(request.postData()).toBe(content);
          if (outcome === 'network-error') {
            await route.abort('failed');
          } else {
            await route.fulfill({ status: outcome === 'http-error' ? 500 : 200, json: {} });
          }
          return;
        }

        await route.fulfill({
          json: url.searchParams.get('action') === 'list' ? { files: [], not_exists: true } : {},
        });
      });

      await page.goto('/');
      const input = page.getByTestId('chat-input');
      await expect(input).toBeEnabled();
      await input.fill('Update the synthetic diary entry.');
      await page.getByTestId('send-btn').click();
      await expect(page.getByTestId('chat-messages')).toContainText('Storage result received.');

      expect(modelRequests).toBe(2);
      expect(mutationRequests).toBe(1);
      expect(toolResults).toHaveLength(1);
      if (outcome === 'success') {
        expect(toolResults[0]).toBe('success');
      } else {
        expect(toolResults[0]).toMatch(/^error: /);
        if (outcome === 'http-error') expect(toolResults[0]).toContain('500');
      }
      await expect(input).toHaveValue('');
      await expect(input).toBeEnabled();
    });
  }
}
