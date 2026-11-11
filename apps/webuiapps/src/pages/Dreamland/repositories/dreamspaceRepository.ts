/**
 * Dreamspace repository: one JSON file per dream in /dreamspaces/{id}.json.
 * Keeps an in-memory cache; refresh() reloads everything from storage.
 */

import { batchConcurrent, type FileOperations } from '@/lib';
import { DREAMSPACES_DIR } from '../actions/constants';
import type { Dreamspace } from '../types';
import { idFromPath, normalizeDreamspace, parseFileContent, sortDreams } from '../utils/normalize';

export interface DreamspaceRepository {
  /** Reload all dreams; onBatch receives the dreams loaded so far (progressive loading). */
  refresh(onBatch?: (loaded: Dreamspace[]) => void): Promise<Dreamspace[]>;
  getAll(): Dreamspace[];
  getById(id: string): Dreamspace | undefined;
  /** Re-read one dream from storage (after the Agent wrote it). */
  fetchOne(id: string): Promise<Dreamspace | null>;
  save(dream: Dreamspace): Promise<void>;
  saveMany(dreams: Dreamspace[]): Promise<void>;
  remove(id: string): Promise<void>;
  /** Drop a dream from the cache only (file already deleted elsewhere). */
  forget(id: string): void;
}

export const dreamPath = (id: string): string => `${DREAMSPACES_DIR}/${id}.json`;

export function createDreamspaceRepository(api: FileOperations): DreamspaceRepository {
  const cache = new Map<string, Dreamspace>();

  const parse = (content: unknown, fallbackId?: string): Dreamspace | null =>
    normalizeDreamspace(parseFileContent(content), fallbackId);

  return {
    async refresh(onBatch) {
      const files = (await api.listFiles(DREAMSPACES_DIR)).filter(
        (f) => f.type === 'file' && f.name.endsWith('.json'),
      );
      const loaded: Dreamspace[] = [];
      await batchConcurrent(files, (file) => api.readFile(file.path), {
        onBatch: (results, startIndex) => {
          results.forEach((result, i) => {
            if (result.status !== 'fulfilled') return;
            const dream = parse(result.value.content, idFromPath(files[startIndex + i].path));
            if (dream) loaded.push(dream);
          });
          onBatch?.(sortDreams(loaded));
        },
      });
      cache.clear();
      loaded.forEach((d) => cache.set(d.id, d));
      return sortDreams(loaded);
    },

    getAll() {
      return sortDreams([...cache.values()]);
    },

    getById(id) {
      return cache.get(id);
    },

    async fetchOne(id) {
      try {
        const result = await api.readFile(dreamPath(id));
        const dream = parse(result.content, id);
        if (dream) cache.set(dream.id, dream);
        return dream;
      } catch {
        return null;
      }
    },

    async save(dream) {
      cache.set(dream.id, dream);
      await api.writeFile(dreamPath(dream.id), dream);
    },

    async saveMany(dreams) {
      dreams.forEach((d) => cache.set(d.id, d));
      await batchConcurrent(dreams, (d) => api.writeFile(dreamPath(d.id), d));
    },

    async remove(id) {
      cache.delete(id);
      await api.deleteFile(dreamPath(id));
    },

    forget(id) {
      cache.delete(id);
    },
  };
}
