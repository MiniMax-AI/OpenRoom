/**
 * Image Generation Tool — LLM tool independent of the App system.
 * Generates images and saves them as real image files to disk storage.
 */

import * as idb from './diskStorage';
import { getSessionPath } from './sessionPath';
import { generateImage, hasUsableImageGenConfig, type ImageGenConfig } from './imageGenClient';

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
              description: 'Detailed description of the image to generate',
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
  if (!hasUsableImageGenConfig(config)) {
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
