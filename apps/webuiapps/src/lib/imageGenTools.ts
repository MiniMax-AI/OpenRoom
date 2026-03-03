/**
 * Image Generation Tool — LLM tool independent of the App system
 * Same level as fileTools, intercepted and handled directly in ChatPanel
 */

import * as idb from './indexedDbStorage';
import { generateImage, type ImageGenConfig } from './imageGenClient';

const TOOL_NAME = 'generate_image';

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
        description: 'Generate an image from a text prompt',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Detailed description of the image to generate',
            },
            savePath: {
              type: 'string',
              description:
                'Absolute IDB path to save the generated image, e.g. "apps/{appName}/data/images/img-001.json". The image is saved as { id, src, createdAt }. Use the corresponding relative path (e.g. "/images/img-001.json") in the app\'s data to reference it.',
            },
          },
          required: ['prompt', 'savePath'],
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
  if (!config?.apiKey) {
    return { result: 'error: image generation not configured, please set up in Settings' };
  }

  const imageResult = await generateImage(params.prompt || '', config);
  const dataUrl = `data:${imageResult.mimeType};base64,${imageResult.base64}`;
  const imageId = `img-${Date.now()}`;
  const savePath = params.savePath;

  if (savePath) {
    const lastSlash = savePath.lastIndexOf('/');
    const dir = savePath.slice(0, lastSlash);
    const name = savePath.slice(lastSlash + 1).endsWith('.json')
      ? savePath.slice(lastSlash + 1)
      : savePath.slice(lastSlash + 1) + '.json';
    await idb.putTextFilesByJSON({
      files: [
        {
          path: dir,
          name,
          content: JSON.stringify({
            id: imageId,
            src: dataUrl,
            createdAt: Date.now(),
          }),
        },
      ],
    });
  }

  const resultMsg = savePath
    ? `success: image generated, id=${imageId}, saved to ${savePath}`
    : `success: image generated, id=${imageId}`;

  return { result: resultMsg, dataUrl };
}
