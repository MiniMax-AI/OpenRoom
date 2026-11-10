/**
 * Image Generation Tool — LLM tool independent of the App system.
 * Generates images and saves them as real image files to disk storage.
 */

import * as idb from './diskStorage';
import { getSessionPath } from './sessionPath';
import { generateImage, isImageGenConfigured, type ImageGenConfig } from './imageGenClient';

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
  const ext = mimeToExt(imageResult.mimeType);
  const imageId = `img-${Date.now()}`;
  const fileName = `${imageId}.${ext}`;
  const filePath = `${IMAGES_DIR}/${fileName}`;
  const dataUrl = `data:${imageResult.mimeType};base64,${imageResult.base64}`;

  try {
    await idb.putBinaryFile(filePath, imageResult.base64, imageResult.mimeType);
    const url = buildFileUrl(filePath);
    return { result: `success: image generated, url=${url}`, dataUrl };
  } catch {
    // Fallback: return dataUrl if save failed
    return { result: `success: image generated, url=${dataUrl}`, dataUrl };
  }
}
