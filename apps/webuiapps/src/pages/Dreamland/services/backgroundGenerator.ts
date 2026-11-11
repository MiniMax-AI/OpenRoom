/**
 * Paints dream backgrounds with OpenRoom's configured image generation
 * (via @/lib), saves them under the app's data/images directory, and preloads
 * the result so the scene can cross-fade without a blank frame.
 */

import { generateImageFile, isImageGenAvailable } from '@/lib';
import { APP_NAME, IMAGES_DIR } from '../actions/constants';
import type { Dreamspace } from '../types';
import { buildImagePrompt } from '../utils/prompt';

const PRELOAD_TIMEOUT_MS = 30_000;

export interface BackgroundGenerator {
  isAvailable(): Promise<boolean>;
  /** Generate and store a background; resolves with the URL to show. */
  generate(dream: Dreamspace): Promise<string>;
}

/** Wait until the browser has the image, so swapping it in is instant. */
export function preloadImage(url: string, timeoutMs = PRELOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('image load timed out')), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('image failed to load'));
    };
    img.src = url;
  });
}

export const backgroundGenerator: BackgroundGenerator = {
  isAvailable: () => isImageGenAvailable(),

  async generate(dream) {
    const basePath = `${APP_NAME}/data${IMAGES_DIR}/${dream.id}-${Date.now()}`;
    const stored = await generateImageFile(buildImagePrompt(dream), basePath);
    try {
      await preloadImage(stored.url);
      return stored.url;
    } catch {
      // The saved file could not be served (e.g. no dev server); fall back to the inline image
      return stored.dataUrl;
    }
  },
};
