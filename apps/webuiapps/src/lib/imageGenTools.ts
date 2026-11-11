/**
 * Image Generation Tool — LLM tool independent of the App system.
 * Generates images and saves them as real image files to disk storage.
 */

import * as idb from './diskStorage';
import { getSessionPath } from './sessionPath';
import {
  generateImage,
  isImageGenConfigured,
  loadImageGenConfig,
  type ImageGenConfig,
  type ImageGenResult,
} from './imageGenClient';

const TOOL_NAME = 'generate_image';
const IMAGES_DIR = 'generated-images';

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] || 'png';
}

/** Build an accessible URL for a file stored via session-data API */
function buildFileUrl(filePath: string): string {
  const session = getSessionPath();
  const cleaned = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fullPath = session ? `${session}/apps/${cleaned}` : `apps/${cleaned}`;
  return `/api/session-data?path=${encodeURIComponent(fullPath)}`;
}

/**
 * System prompt section on writing image prompts. The image model sees only the
 * prompt, never the conversation, so a short prompt like "my ship" can come back
 * as any kind of ship. The character must spell out setting and looks every time.
 */
export function buildImageGenPrompt(): string {
  return (
    '\n\n## Images\n' +
    'You can use generate_image to create images from text prompts. The generated image will be displayed in chat.\n' +
    'The image generator sees ONLY your prompt — not this conversation, your character description or the story. ' +
    'Write every prompt so it stands on its own:\n' +
    '- Always state the setting and genre of the story (e.g. "sci-fi spaceship interior in deep space"), ' +
    'taken from your character description and the current scenario. Never write just "my ship" or "the room".\n' +
    '- When you (the character) appear in the image, describe your appearance from your character description ' +
    '(hair, eyes, build, clothing) the same way every time, so you look consistent across images.\n' +
    '- Add concrete visual details: subject, surroundings, lighting, mood and camera angle.\n' +
    '- Keep one consistent art style for the whole story (e.g. "cinematic digital painting") and mention it in every prompt.\n' +
    '- Write the prompt in English, as one descriptive paragraph (about 40-80 words).\n'
  );
}

export function getImageGenToolDefinitions(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return [
    {
      type: 'function',
      function: {
        name: TOOL_NAME,
        description:
          'Generate an image from a text prompt. The image is displayed in chat and saved to disk. Returns a url.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                'Self-contained image description (the generator sees nothing else): setting and genre ' +
                'of the story, subject, your appearance if you are in it, details, lighting, mood, art style. ' +
                'English, about 40-80 words.',
            },
          },
          required: ['prompt'],
        },
      },
    },
  ];
}

export function isImageGenTool(toolName: string): boolean {
  return toolName === TOOL_NAME;
}

export async function executeImageGenTool(
  params: Record<string, string>,
  config: ImageGenConfig | null,
): Promise<{ result: string; dataUrl?: string }> {
  if (!config || !isImageGenConfigured(config)) {
    return { result: 'error: image generation not configured, please set up in Settings' };
  }

  const imageResult = await generateImage(params.prompt || '', config);
  const stored = await storeImage(imageResult, `${IMAGES_DIR}/img-${Date.now()}`);
  return { result: `success: image generated, url=${stored.url}`, dataUrl: stored.dataUrl };
}

export interface StoredImage {
  /** URL to show the image: a session-data URL, or the data URL if saving failed */
  url: string;
  dataUrl: string;
  mimeType: string;
  /** Path relative to the session's apps/ directory, including the extension */
  filePath: string;
}

/** Save generated image bytes at `{basePath}.{ext}` (relative to the session's apps/ directory). */
async function storeImage(image: ImageGenResult, basePath: string): Promise<StoredImage> {
  const filePath = `${basePath}.${mimeToExt(image.mimeType)}`;
  const dataUrl = `data:${image.mimeType};base64,${image.base64}`;
  try {
    await idb.putBinaryFile(filePath, image.base64, image.mimeType);
    return { url: buildFileUrl(filePath), dataUrl, mimeType: image.mimeType, filePath };
  } catch {
    return { url: dataUrl, dataUrl, mimeType: image.mimeType, filePath };
  }
}

/** True when the user has configured a usable image generation provider. */
export async function isImageGenAvailable(): Promise<boolean> {
  return isImageGenConfigured(await loadImageGenConfig());
}

/**
 * Generate an image with the configured provider and save it for an app.
 * `basePath` is relative to the session's apps/ directory without extension,
 * e.g. "dreamland/data/images/abc-123". Throws if image generation is not
 * configured or the provider fails.
 */
export async function generateImageFile(prompt: string, basePath: string): Promise<StoredImage> {
  const config = await loadImageGenConfig();
  if (!config || !isImageGenConfigured(config)) {
    throw new Error('Image generation is not configured');
  }
  return storeImage(await generateImage(prompt, config), basePath);
}
