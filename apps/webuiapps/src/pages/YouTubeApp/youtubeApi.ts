import type { YouTubeSearchResult } from './types';

export type YouTubeSearchBackend = 'youtube-data-api';

interface YouTubeSearchListResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
  }>;
}

function pickBestThumbnailUrl(thumbnails: Record<string, { url?: string }> | undefined): string {
  return (
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    ''
  );
}

export function getYouTubeApiKey(): string | undefined {
  // In Node/Vitest, prefer process.env so tests can control the value even if
  // Vite also provides import.meta.env from .env.local.
  const processKey =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>).VITE_YOUTUBE_API_KEY
      : undefined;

  const viteKey = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_YOUTUBE_API_KEY;

  const key = processKey !== undefined ? processKey : viteKey;
  return key?.trim() || undefined;
}

export async function searchYouTubeDataApi(
  query: string,
  maxResults: number,
): Promise<{ results: YouTubeSearchResult[]; backend: YouTubeSearchBackend }> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    throw new Error('Missing VITE_YOUTUBE_API_KEY');
  }

  const cap = Math.min(Math.max(1, maxResults), 50);
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(cap));
  url.searchParams.set('safeSearch', 'moderate');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API error (${res.status}): ${body || res.statusText}`);
  }

  const json = (await res.json()) as YouTubeSearchListResponse;
  const results: YouTubeSearchResult[] = (json.items ?? [])
    .map((it) => {
      const videoId = it.id?.videoId;
      if (!videoId) return null;
      const snippet = it.snippet;
      const thumbnail_url = pickBestThumbnailUrl(snippet?.thumbnails);
      return {
        video_id: videoId,
        title: snippet?.title ?? '(untitled)',
        channel: snippet?.channelTitle ?? '',
        thumbnail_url: thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      } satisfies YouTubeSearchResult;
    })
    .filter((v): v is YouTubeSearchResult => Boolean(v));

  return { results, backend: 'youtube-data-api' };
}

