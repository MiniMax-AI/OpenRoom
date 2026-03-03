/**
 * Seed each APP's meta.yaml and guide.md into IndexedDB on initialization
 * So Agent can read them via file_read("apps/{appName}/meta.yaml")
 */

import * as idb from './indexedDbStorage';
import { getSourceDirToAppName } from './appRegistry';

// Eager import — inlined as strings at build time
const metaFiles: Record<string, string> = import.meta.glob(
  [
    '../pages/*/meta/meta_en/meta.yaml',
    '../pages/*/meta/meta_en/guide.md',
    '../pages/*/*_en/meta.yaml',
    '../pages/*/*_en/guide.md',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const DIR_TO_APP_NAME = getSourceDirToAppName();

let seeded = false;

export async function seedMetaFiles(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const files: Array<{ path: string; name: string; content: string }> = [];

  for (const [filePath, content] of Object.entries(metaFiles)) {
    const dirMatch = filePath.match(/\.\.\/pages\/([^/]+)\//);
    if (!dirMatch) continue;
    const appName = DIR_TO_APP_NAME[dirMatch[1]] || dirMatch[1].toLowerCase();
    const fileName = filePath.split('/').pop() || '';
    if (!fileName) continue;
    files.push({ path: `apps/${appName}`, name: fileName, content });
  }

  if (files.length > 0) {
    await idb.putTextFilesByJSON({ files });
    console.info(`[seedMeta] Seeded ${files.length} meta files into IndexedDB`);
  }
}
