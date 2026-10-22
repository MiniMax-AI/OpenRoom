import { afterEach, describe, expect, it, vi } from 'vitest';

import { getYouTubeApiKey, searchYouTubeDataApi } from '../youtubeApi';

describe('YouTubeApp youtubeApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VITE_YOUTUBE_API_KEY;
  });

  it('returns undefined when VITE_YOUTUBE_API_KEY is missing', () => {
    process.env.VITE_YOUTUBE_API_KEY = '';
    expect(getYouTubeApiKey()).toBeUndefined();
  });

  it('maps YouTube search.list items to YouTubeSearchResult', async () => {
    process.env.VITE_YOUTUBE_API_KEY = 'test-key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch' as unknown as 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: { videoId: 'abc123' },
            snippet: {
              title: 'Hello',
              channelTitle: 'Chan',
              thumbnails: { high: { url: 'https://img.test/high.jpg' } },
            },
          },
        ],
      }),
    } as unknown as Response);

    const { results, backend } = await searchYouTubeDataApi('hello', 10);
    expect(backend).toBe('youtube-data-api');
    expect(results).toEqual([
      {
        video_id: 'abc123',
        title: 'Hello',
        channel: 'Chan',
        thumbnail_url: 'https://img.test/high.jpg',
      },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

