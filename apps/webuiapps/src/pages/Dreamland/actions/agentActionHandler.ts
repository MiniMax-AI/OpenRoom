/**
 * Handles actions dispatched by the Agent (the AI companion).
 *
 * - Operation: executed directly on the active (or given) dream; if the dream
 *   is unknown, refresh from storage and retry once.
 * - Mutation: the Agent already wrote/deleted the file; re-read it.
 * - Refresh: reload all dreams.
 * - System: SYNC_STATE re-reads state.json.
 *
 * Never calls reportAction: useAgentActionListener already returns the result.
 */

import type { CharacterAppAction } from '@/lib';
import type { DreamlandController } from '../store/controller';
import type { DreamspacePatch } from '../types';
import {
  CAPTION_MAX,
  PROMPT_MAX,
  isAmbientSound,
  isExpression,
  isMood,
  isTimeOfDay,
  isWeather,
  idFromPath,
  parseEnum,
} from '../utils/normalize';
import { AMBIENT_SOUNDS, EXPRESSIONS, MOODS, TIMES_OF_DAY, WEATHERS } from '../types';
import { ActionTypes } from './constants';

export type AgentActionHandler = (action: CharacterAppAction) => Promise<string>;

export function createAgentActionHandler(controller: DreamlandController): AgentActionHandler {
  /** Resolve the target dream id (given or active), refreshing once if unknown. */
  const resolveTarget = async (dreamspaceId?: string): Promise<string | null> => {
    const wanted = dreamspaceId?.trim() || controller.getSnapshot().active?.id;
    if (!wanted) return null;
    if (controller.hasDream(wanted)) return wanted;
    await controller.refreshAll();
    if (controller.hasDream(wanted)) return wanted;
    return null;
  };

  const notFound = (id?: string) =>
    id ? `error: dreamspace "${id}" not found` : 'error: there is no dream yet';

  /** Apply a patch to the target dream and persist it before returning. */
  const applyPatch = async (patch: DreamspacePatch, dreamspaceId?: string): Promise<string> => {
    const id = await resolveTarget(dreamspaceId);
    if (!id) return notFound(dreamspaceId);
    controller.updateDream(id, patch, { fromAgent: true });
    await controller.saveNow(id);
    return 'success';
  };

  const enumOperation = async <T extends string>(
    raw: string | undefined,
    guard: (v: unknown) => v is T,
    allowed: readonly string[],
    field: keyof DreamspacePatch,
    paramName: string,
    dreamspaceId?: string,
  ): Promise<string> => {
    const value = parseEnum(raw, guard);
    if (!value)
      return `error: invalid ${paramName} "${raw ?? ''}", use one of: ${allowed.join(', ')}`;
    return applyPatch({ [field]: value } as DreamspacePatch, dreamspaceId);
  };

  return async (action) => {
    const p = action.params ?? {};
    try {
      switch (action.action_type) {
        // ---------------- Operation
        case ActionTypes.SET_SCENE: {
          const prompt = p.prompt?.trim();
          if (!prompt) return 'error: missing prompt';
          const id = await resolveTarget(p.dreamspaceId);
          if (!id) return notFound(p.dreamspaceId);
          controller.updateDream(
            id,
            { scenePrompt: prompt.slice(0, PROMPT_MAX) },
            { fromAgent: true },
          );
          await controller.saveNow(id);
          if (p.regenerate?.trim().toLowerCase() === 'false') return 'success';
          return controller.regenerate(id, 'agent');
        }
        case ActionTypes.REGENERATE_BACKGROUND: {
          const id = await resolveTarget(p.dreamspaceId);
          if (!id) return notFound(p.dreamspaceId);
          return controller.regenerate(id, 'agent');
        }
        case ActionTypes.SET_WEATHER:
          return enumOperation(
            p.weather,
            isWeather,
            WEATHERS,
            'weather',
            'weather',
            p.dreamspaceId,
          );
        case ActionTypes.SET_TIME_OF_DAY:
          return enumOperation(
            p.timeOfDay,
            isTimeOfDay,
            TIMES_OF_DAY,
            'timeOfDay',
            'timeOfDay',
            p.dreamspaceId,
          );
        case ActionTypes.SET_MOOD:
          return enumOperation(p.mood, isMood, MOODS, 'mood', 'mood', p.dreamspaceId);
        case ActionTypes.SET_AMBIENT_SOUND:
          return enumOperation(
            p.sound,
            isAmbientSound,
            AMBIENT_SOUNDS,
            'ambientSound',
            'sound',
            p.dreamspaceId,
          );
        case ActionTypes.SET_EXPRESSION:
          return enumOperation(
            p.expression,
            isExpression,
            EXPRESSIONS,
            'expression',
            'expression',
            p.dreamspaceId,
          );
        case ActionTypes.SET_CAPTION:
          return applyPatch(
            { caption: (p.text ?? '').trim().slice(0, CAPTION_MAX) },
            p.dreamspaceId,
          );
        case ActionTypes.SWITCH_DREAMSPACE: {
          if (!p.dreamspaceId) return 'error: missing dreamspaceId';
          const id = await resolveTarget(p.dreamspaceId);
          if (!id) return notFound(p.dreamspaceId);
          controller.switchDream(id, true);
          return 'success';
        }

        // ---------------- Mutation (Agent already changed the files)
        case ActionTypes.CREATE_DREAMSPACE:
        case ActionTypes.UPDATE_DREAMSPACE: {
          const id = p.dreamspaceId?.trim() || idFromPath(p.filePath ?? '');
          if (!id) return 'error: missing filePath (e.g. /dreamspaces/{id}.json)';
          const dream = await controller.syncDream(id);
          if (!dream) return `error: could not read /dreamspaces/${id}.json`;
          if (action.action_type === ActionTypes.CREATE_DREAMSPACE)
            controller.switchDream(id, true);
          return 'success';
        }
        case ActionTypes.DELETE_DREAMSPACE: {
          const id = p.dreamspaceId?.trim() || idFromPath(p.filePath ?? '');
          if (!id) return 'error: missing dreamspaceId';
          controller.removeLocal(id);
          return 'success';
        }

        // ---------------- Refresh
        case ActionTypes.REFRESH_DREAMSPACES:
          await controller.refreshAll(p.focusId?.trim() || undefined);
          return 'success';

        // ---------------- System
        case ActionTypes.SYNC_STATE:
          await controller.syncState();
          return 'success';

        default:
          return `error: unknown action_type ${action.action_type ?? ''}`;
      }
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
}
