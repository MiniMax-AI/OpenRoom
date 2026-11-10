/**
 * DreamlandController: all app behavior in plain TypeScript (no React), so it
 * can be unit-tested. React subscribes via useSyncExternalStore.
 *
 * Every business method takes `fromAgent`: user-triggered calls report the
 * action to the Agent; Agent-triggered calls don't (useAgentActionListener
 * already returns the result).
 */

import type { DreamspaceRepository } from '../repositories/dreamspaceRepository';
import type { StateRepository } from '../repositories/stateRepository';
import type { BackgroundGenerator } from '../services/backgroundGenerator';
import { ActionTypes, type ActionType } from '../actions/constants';
import type { AmbientSound, Dreamspace, DreamspacePatch, DreamlandPersistedState } from '../types';
import { normalizeDreamspace, PROMPT_MAX, NAME_MAX } from '../utils/normalize';
import {
  dreamlandReducer,
  initialState,
  selectActiveDream,
  type DreamlandAction,
  type DreamlandState,
} from './reducer';

/** The part of the audio engine the controller needs. */
export interface AudioPort {
  readonly unlocked: boolean;
  unlock(): void;
  setEnabled(enabled: boolean): void;
  setSound(sound: AmbientSound): void;
  setVolume(volume: number): void;
}

export interface ControllerDeps {
  dreams: DreamspaceRepository;
  state: StateRepository;
  generator: BackgroundGenerator;
  audio: AudioPort;
  report: (type: ActionType, params: Record<string, string>) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  seeds: unknown[];
  now?: () => number;
  newId?: () => string;
  /** Debounce for autosaving edits (ms) */
  saveDelayMs?: number;
  toastMs?: number;
}

export interface Toast {
  id: number;
  message: string;
  error: boolean;
}

export interface DreamlandSnapshot extends DreamlandState {
  active: Dreamspace | null;
  toast: Toast | null;
  imageGenAvailable: boolean;
  loadError: boolean;
}

/** Map an edited field to the action reported to the Agent. */
const PATCH_REPORTS: Partial<Record<keyof DreamspacePatch, [ActionType, string]>> = {
  weather: [ActionTypes.SET_WEATHER, 'weather'],
  timeOfDay: [ActionTypes.SET_TIME_OF_DAY, 'timeOfDay'],
  mood: [ActionTypes.SET_MOOD, 'mood'],
  ambientSound: [ActionTypes.SET_AMBIENT_SOUND, 'sound'],
  expression: [ActionTypes.SET_EXPRESSION, 'expression'],
  caption: [ActionTypes.SET_CAPTION, 'text'],
};

export class DreamlandController {
  private state: DreamlandState = initialState;
  private snapshot: DreamlandSnapshot;
  private listeners = new Set<() => void>();
  private toast: Toast | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private imageGenAvailable = false;
  private loadError = false;
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private persisted: DreamlandPersistedState | null = null;
  private toastSeq = 0;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly saveDelayMs: number;
  private readonly toastMs: number;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? Date.now;
    this.newId =
      deps.newId ??
      (() => `dream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    this.saveDelayMs = deps.saveDelayMs ?? 400;
    this.toastMs = deps.toastMs ?? 2800;
    this.snapshot = this.buildSnapshot();
  }

  // ---------------------------------------------------------------- store

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): DreamlandSnapshot => this.snapshot;

  private buildSnapshot(): DreamlandSnapshot {
    return {
      ...this.state,
      active: selectActiveDream(this.state),
      toast: this.toast,
      imageGenAvailable: this.imageGenAvailable,
      loadError: this.loadError,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.syncAudio();
    this.schedulePersistState();
    this.listeners.forEach((l) => l());
  }

  private dispatch(action: DreamlandAction): void {
    this.state = dreamlandReducer(this.state, action);
    this.emit();
  }

  hasDream(id: string): boolean {
    return this.state.dreams.some((d) => d.id === id);
  }

  private find(id: string): Dreamspace | undefined {
    return this.state.dreams.find((d) => d.id === id);
  }

  // ---------------------------------------------------------------- lifecycle

  async init(): Promise<void> {
    try {
      const loaded = await this.deps.state.refresh();
      this.persisted = loaded.state;
      this.state = {
        ...this.state,
        activeId: loaded.state.activeDreamspaceId,
        soundEnabled: loaded.state.soundEnabled,
        volume: loaded.state.volume,
      };
      this.deps.audio.setVolume(loaded.state.volume);

      let dreams = await this.deps.dreams.refresh((partial) =>
        this.dispatch({ type: 'LOADED', dreams: partial, done: false }),
      );
      if (!loaded.existed && dreams.length === 0) {
        const seeds = this.deps.seeds
          .map((s) => normalizeDreamspace(s))
          .filter((d): d is Dreamspace => d !== null);
        await this.deps.dreams.saveMany(seeds);
        dreams = this.deps.dreams.getAll();
      }
      this.dispatch({ type: 'LOADED', dreams, done: true });
    } catch {
      this.loadError = true;
      this.dispatch({ type: 'LOADED', dreams: [], done: true });
      this.showToast(this.deps.t('toast.loadFailed'), true);
    }
    await this.checkImageGen();
  }

  async checkImageGen(): Promise<boolean> {
    try {
      this.imageGenAvailable = await this.deps.generator.isAvailable();
    } catch {
      this.imageGenAvailable = false;
    }
    this.emit();
    return this.imageGenAvailable;
  }

  /** Write any pending edits now. */
  async flush(): Promise<void> {
    const ids = [...this.saveTimers.keys()];
    await Promise.all(ids.map((id) => this.saveNow(id)));
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
      await this.persistState();
    }
  }

  dispose(): void {
    void this.flush();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- persistence

  async saveNow(id: string): Promise<void> {
    const timer = this.saveTimers.get(id);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(id);
    const dream = this.find(id);
    if (dream) await this.deps.dreams.save(dream);
  }

  private scheduleSave(id: string): void {
    const existing = this.saveTimers.get(id);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(
      id,
      setTimeout(() => {
        void this.saveNow(id).catch(() => this.showToast(this.deps.t('toast.loadFailed'), true));
      }, this.saveDelayMs),
    );
  }

  private currentPersisted(): DreamlandPersistedState {
    return {
      activeDreamspaceId: this.snapshot.active?.id ?? null,
      soundEnabled: this.state.soundEnabled,
      volume: this.state.volume,
    };
  }

  private schedulePersistState(): void {
    if (!this.persisted || this.state.loading) return;
    const next = this.currentPersisted();
    const prev = this.persisted;
    if (
      next.activeDreamspaceId === prev.activeDreamspaceId &&
      next.soundEnabled === prev.soundEnabled &&
      next.volume === prev.volume
    ) {
      return;
    }
    if (this.stateTimer) clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      void this.persistState();
    }, this.saveDelayMs);
  }

  private async persistState(): Promise<void> {
    const next = this.currentPersisted();
    this.persisted = next;
    try {
      await this.deps.state.save(next);
    } catch {
      // Non-critical: preferences are re-saved on the next change
    }
  }

  // ---------------------------------------------------------------- toast

  showToast(message: string, error = false): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { id: ++this.toastSeq, message, error };
    this.emit();
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.toastTimer = null;
      this.emit();
    }, this.toastMs);
  }

  // ---------------------------------------------------------------- audio

  private syncAudio(): void {
    const audio = this.deps.audio;
    audio.setSound(this.snapshot.active?.ambientSound ?? 'none');
    audio.setEnabled(this.state.soundEnabled);
  }

  /** Call from any user gesture: starts audio that was enabled in a previous visit. */
  unlockAudioIfNeeded(): void {
    if (this.state.soundEnabled && !this.deps.audio.unlocked) {
      this.deps.audio.unlock();
      this.syncAudio();
    }
  }

  /** Must be called from a click handler (Safari audio rule). */
  toggleSound(): void {
    const enabled = !this.state.soundEnabled;
    if (enabled) this.deps.audio.unlock();
    this.dispatch({ type: 'SET_SOUND', enabled });
    this.deps.report(ActionTypes.TOGGLE_SOUND, { enabled: String(enabled) });
  }

  setVolume(volume: number): void {
    this.deps.audio.setVolume(volume);
    this.dispatch({ type: 'SET_VOLUME', volume });
  }

  // ---------------------------------------------------------------- dream operations

  /** Apply edits to a dream (live), autosave, and report user edits. */
  updateDream(
    id: string,
    patch: DreamspacePatch,
    { fromAgent = false }: { fromAgent?: boolean } = {},
  ): Dreamspace | null {
    if (!this.find(id)) return null;
    this.dispatch({ type: 'PATCH', id, patch, now: this.now() });
    this.scheduleSave(id);
    if (!fromAgent) {
      for (const key of Object.keys(patch) as Array<keyof DreamspacePatch>) {
        const mapping = PATCH_REPORTS[key];
        if (mapping) {
          this.deps.report(mapping[0], {
            dreamspaceId: id,
            [mapping[1]]: String(patch[key] ?? ''),
          });
        }
      }
      if ('backgroundUrl' in patch && patch.backgroundUrl === null) {
        this.deps.report(ActionTypes.UPDATE_DREAMSPACE, { dreamspaceId: id, backgroundUrl: '' });
      }
    }
    return this.find(id) ?? null;
  }

  /** Report a finished text edit (on blur), so typing isn't reported per keystroke. */
  commitText(id: string, field: 'name' | 'scenePrompt'): void {
    const dream = this.find(id);
    if (!dream) return;
    if (field === 'name') {
      this.deps.report(ActionTypes.RENAME_DREAMSPACE, { dreamspaceId: id, name: dream.name });
    } else {
      this.deps.report(ActionTypes.SET_SCENE, {
        dreamspaceId: id,
        prompt: dream.scenePrompt,
        regenerate: 'false',
      });
    }
  }

  /** Text field edits: clamp length like files are normalized. */
  editText(id: string, field: 'name' | 'scenePrompt', value: string): void {
    const max = field === 'name' ? NAME_MAX : PROMPT_MAX;
    this.dispatch({ type: 'PATCH', id, patch: { [field]: value.slice(0, max) }, now: this.now() });
    this.scheduleSave(id);
  }

  switchDream(id: string, fromAgent = false): boolean {
    if (!this.find(id)) return false;
    this.dispatch({ type: 'SET_ACTIVE', id });
    if (!fromAgent) this.deps.report(ActionTypes.SWITCH_DREAMSPACE, { dreamspaceId: id });
    return true;
  }

  async createDream(): Promise<Dreamspace> {
    const now = this.now();
    const dream = normalizeDreamspace({
      id: this.newId(),
      name: this.deps.t('library.newDreamName'),
      scenePrompt: this.deps.t('library.newDreamPrompt'),
      timeOfDay: 'day',
      weather: 'clear',
      mood: 'serene',
      ambientSound: 'wind',
      expression: 'happy',
      caption: '',
      createdAt: now,
      updatedAt: now,
    }) as Dreamspace;
    await this.deps.dreams.save(dream);
    this.dispatch({ type: 'UPSERT', dream });
    this.dispatch({ type: 'SET_ACTIVE', id: dream.id });
    this.deps.report(ActionTypes.CREATE_DREAMSPACE, { dreamspaceId: dream.id, name: dream.name });
    this.showToast(this.deps.t('toast.created'));
    return dream;
  }

  async deleteDream(id: string): Promise<void> {
    const dream = this.find(id);
    if (!dream) return;
    const timer = this.saveTimers.get(id);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(id);
    await this.deps.dreams.remove(id);
    this.dispatch({ type: 'REMOVE', id });
    this.deps.report(ActionTypes.DELETE_DREAMSPACE, { dreamspaceId: id, name: dream.name });
    this.showToast(this.deps.t('toast.deleted'));
  }

  /** Paint a new background. Resolves with an action result string. */
  async regenerate(id: string, fromAgent = false): Promise<string> {
    if (this.state.generatingIds.includes(id))
      return 'error: background is already being generated';
    if (!this.find(id)) return 'error: dreamspace not found';
    if (!(await this.checkImageGen())) {
      this.showToast(this.deps.t('inspector.imageGenUnavailable'), true);
      return 'error: image generation is not configured in Settings';
    }
    this.dispatch({ type: 'SET_GENERATING', id, generating: true });
    if (!fromAgent) this.deps.report(ActionTypes.REGENERATE_BACKGROUND, { dreamspaceId: id });
    try {
      const latest = this.find(id) as Dreamspace;
      const url = await this.deps.generator.generate(latest);
      if (!this.find(id)) return 'error: dreamspace was deleted while generating';
      this.dispatch({ type: 'PATCH', id, patch: { backgroundUrl: url }, now: this.now() });
      await this.saveNow(id);
      this.showToast(this.deps.t('toast.generated'));
      return 'success';
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.showToast(this.deps.t('toast.generateFailed', { reason }), true);
      return `error: ${reason}`;
    } finally {
      this.dispatch({ type: 'SET_GENERATING', id, generating: false });
    }
  }

  pokeAvatar(): void {
    const active = this.snapshot.active;
    if (!active) return;
    this.deps.report(ActionTypes.POKE_AVATAR, {
      dreamspaceId: active.id,
      expression: active.expression,
    });
  }

  // ---------------------------------------------------------------- Agent sync (no reporting)

  /** Re-read one dream written by the Agent. */
  async syncDream(id: string): Promise<Dreamspace | null> {
    const dream = await this.deps.dreams.fetchOne(id);
    if (dream) this.dispatch({ type: 'UPSERT', dream });
    return dream;
  }

  /** The Agent deleted the file already; drop it locally. */
  removeLocal(id: string): boolean {
    if (!this.find(id)) return false;
    const timer = this.saveTimers.get(id);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(id);
    this.deps.dreams.forget(id);
    this.dispatch({ type: 'REMOVE', id });
    return true;
  }

  async refreshAll(focusId?: string): Promise<void> {
    const dreams = await this.deps.dreams.refresh();
    this.dispatch({ type: 'LOADED', dreams, done: true });
    if (focusId && this.find(focusId)) this.dispatch({ type: 'SET_ACTIVE', id: focusId });
  }

  async syncState(): Promise<void> {
    const loaded = await this.deps.state.refresh();
    this.persisted = { ...this.currentPersisted(), ...loaded.fields };
    if (loaded.fields.volume !== undefined) this.deps.audio.setVolume(loaded.fields.volume);
    this.dispatch({ type: 'APPLY_STATE', fields: loaded.fields });
  }
}
