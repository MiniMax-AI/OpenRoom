/**
 * MysteryApp — cooperative murder-mystery Vibe app.
 *
 * Steven (human) + Kayley (AI) play detectives together. Neither knows the
 * killer. A GM subprocess (see GM_WS_URL) holds the LOCKED truth.
 *
 * Duo rules: choose who leads first; strict alternating turns; explicit
 * "Finish turn" hands off; mutual "ready to accuse" before the formal
 * accusation modal; GET_MYSTERY_STATE / FINISH / SET_ACCUSATION_READY for Kayley.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search, ScrollText, MapPin, Users, Gavel, X } from 'lucide-react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  reportAction,
  reportLifecycle,
  useAgentActionListener,
  generateId,
  ActionTriggerBy,
  type CharacterAppAction,
} from '@/lib';
import { sendKayleyWsPayload } from '@/lib/kayleyWsBridge';
import { mysteryLog } from '@/lib/mysteryLogger';
import styles from './index.module.scss';
import {
  ACTION_CHAT_MESSAGE,
  ACTION_COLLECT_EVIDENCE,
  ACTION_EXAMINE_LOCATION,
  ACTION_FINISH_INVESTIGATION_TURN,
  ACTION_GET_MYSTERY_STATE,
  ACTION_INTERROGATE,
  ACTION_MAKE_ACCUSATION,
  ACTION_READ_DOSSIER,
  ACTION_SET_ACCUSATION_READY,
  ACTION_RESET_GAMEOVER,
  ACTION_SET_OPENING_PICK,
  MYSTERY_GM_ACTIONS,
} from './actions/constants';
import { useGMSocket } from './hooks/useGMSocket';
import { LOCATIONS, SCENARIO_TAGLINE, SCENARIO_TITLE, SUSPECTS, VICTIM_NAME, VICTIM_ROLE } from './scenario';
import type {
  AccusationPayload,
  ChatEntry,
  EvidenceItem,
  LocationId,
  MysteryActionResponse,
  SuspectDemeanor,
  SuspectId,
} from './types';

const APP_ID = 17;
const APP_NAME = 'MysteryApp';

type TurnOwner = 'human' | 'agent';

function appendChat(prev: ChatEntry[], entry: Omit<ChatEntry, 'id' | 'ts'>): ChatEntry[] {
  return [...prev, { ...entry, id: generateId(), ts: Date.now() }];
}

function mergeEvidence(prev: EvidenceItem[], incoming: EvidenceItem[] | undefined): EvidenceItem[] {
  if (!incoming || incoming.length === 0) return prev;
  const seen = new Set(prev.map((e) => e.id));
  const additions = incoming.filter((e) => e && e.id && !seen.has(e.id));
  return additions.length === 0 ? prev : [...prev, ...additions];
}

function mergeDemeanor(
  prev: Partial<Record<SuspectId, SuspectDemeanor>>,
  incoming: Partial<Record<SuspectId, SuspectDemeanor>> | undefined,
): Partial<Record<SuspectId, SuspectDemeanor>> {
  // Defensive guard: gm-server normalizes string demeanor → object before
  // sending, but a string can still slip through on edge actions where the
  // normalizer can't infer the subject. Spreading a raw string into an object
  // expands it character-by-character (e.g. "evasive" → {0:"e",1:"v",...}),
  // which corrupts the demeanor state. Origin: 2026-05-12 playtest bug.
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return prev;
  return { ...prev, ...incoming };
}

function serializeDispatchResult(r: {
  status: string;
  narrative?: string;
  evidence_unlocked?: EvidenceItem[];
}): string {
  if (r.status.startsWith('error:')) return r.status;
  const evidence_available =
    r.evidence_unlocked?.map((e) => ({ id: e.id, label: e.label })) ?? [];
  return JSON.stringify({
    status: r.status,
    narrative: r.narrative ?? '',
    ...(evidence_available.length > 0 && { evidence_available }),
  });
}

const MysteryApp: React.FC = () => {
  const [chat, setChat] = useState<ChatEntry[]>([
    {
      id: 'intro',
      kind: 'system',
      text: 'The party is still loud downstairs. Marcus is still dead upstairs. Decide who takes the first investigation turn, then dig in.',
      ts: Date.now(),
    },
  ]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [demeanor, setDemeanor] = useState<Partial<Record<SuspectId, SuspectDemeanor>>>({});
  const [gameOver, setGameOver] = useState<MysteryActionResponse['game_over'] | null>(null);
  const [accuseOpen, setAccuseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState<Map<string, string>>(new Map());
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  const [dossiersOpened, setDossiersOpened] = useState<Set<SuspectId>>(new Set());
  const [suspectsInterrogated, setSuspectsInterrogated] = useState<Set<SuspectId>>(new Set());
  const [locationsVisited, setLocationsVisited] = useState<Set<string>>(new Set());
  const [interrogating, setInterrogating] = useState<SuspectId | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [chatDraft, setChatDraft] = useState('');

  /** null = still choosing who leads */
  const [turnOwner, setTurnOwner] = useState<TurnOwner | null>(null);
  const [locationVisitActive, setLocationVisitActive] = useState(false);
  const [humanReadyToAccuse, setHumanReadyToAccuse] = useState(false);
  const [agentReadyToAccuse, setAgentReadyToAccuse] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const { status, lastError, sendAction } = useGMSocket();

  const snapshotRef = useRef({
    chat: [] as ChatEntry[],
    evidence: [] as EvidenceItem[],
    demeanor: {} as Partial<Record<SuspectId, SuspectDemeanor>>,
    turnOwner: null as TurnOwner | null,
    status: 'connecting' as string,
    gameOver: null as MysteryActionResponse['game_over'] | null,
    humanReadyToAccuse: false,
    agentReadyToAccuse: false,
    locationVisitActive: false,
    busy: false,
  });

  useEffect(() => {
    snapshotRef.current = {
      chat,
      evidence,
      demeanor,
      turnOwner,
      status,
      gameOver,
      humanReadyToAccuse,
      agentReadyToAccuse,
      locationVisitActive,
      busy,
    };
  }, [
    chat,
    evidence,
    demeanor,
    turnOwner,
    status,
    gameOver,
    humanReadyToAccuse,
    agentReadyToAccuse,
    locationVisitActive,
    busy,
  ]);

  useEffect(() => {
    if (accuseOpen && !(humanReadyToAccuse && agentReadyToAccuse)) {
      setAccuseOpen(false);
    }
  }, [humanReadyToAccuse, agentReadyToAccuse, accuseOpen]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const humanMayInvestigate = turnOwner === 'human' && status === 'open' && !gameOver;
  const agentMayInvestigate = turnOwner === 'agent' && status === 'open' && !gameOver;

  const canOpenAccusationModal =
    humanMayInvestigate &&
    humanReadyToAccuse &&
    agentReadyToAccuse &&
    !busy;

  const dispatchMysteryAction = useCallback(
    async (
      action_type: string,
      params: Record<string, string>,
      label: string,
    ): Promise<{ status: string; narrative?: string; evidence_unlocked?: EvidenceItem[] }> => {
      setChat((prev) => appendChat(prev, { kind: 'action', text: label }));
      setBusy(true);
      try {
        const response = await sendAction({ action_type, params });
        if (response.error) {
          setChat((prev) => appendChat(prev, { kind: 'error', text: 'GM: ' + response.error }));
          return { status: 'error: ' + response.error };
        }
        if (response.narrative) {
          setChat((prev) => appendChat(prev, { kind: 'narrative', text: response.narrative }));
        }
        if (response.evidence_unlocked?.length) {
          setEvidence((prev) => mergeEvidence(prev, response.evidence_unlocked));
        }
        if (response.suspect_demeanor) {
          setDemeanor((prev) => mergeDemeanor(prev, response.suspect_demeanor));
        }
        if (response.game_over) {
          setGameOver(response.game_over);
        }

        // Real-time push to Kayley brain so we can chat about the human's
        // moves DURING their turn (not just at finish-turn boundary). Gated
        // on snapshotRef so the agent path doesn't echo its own actions back
        // to itself. Origin: 2026-05-12 playtest — Steven wanted live
        // commentary on his Dossier/Interrogate/Examine reveals.
        if (snapshotRef.current.turnOwner === 'human') {
          const narrativeSnippet = response.narrative
            ? `\n\n${response.narrative}`
            : '';
          sendKayleyWsPayload({
            type: 'openroom_user_action',
            line: `${label}${narrativeSnippet}`,
          });
        }

        return {
          status: 'success',
          narrative: response.narrative,
          evidence_unlocked: response.evidence_unlocked,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[MysteryApp] action failed:', action_type, msg);
        setChat((prev) => appendChat(prev, { kind: 'error', text: 'Action failed: ' + msg }));
        return { status: 'error: ' + msg };
      } finally {
        setBusy(false);
      }
    },
    [sendAction],
  );

  // `snapshotRef` lags one tick behind React state because it's updated inside
  // a `useEffect`. Callers that have JUST set state and want the snapshot to
  // reflect the post-update value must pass an `overrides` object — otherwise
  // the snapshot reports the stale pre-set value (e.g. `turnOwner: null` even
  // though we just set it to `'agent'`). Origin: 2026-05-12 playtest, the
  // opening-pick + finishHumanTurn callsites were broadcasting stale snapshots
  // on the openroom_mystery_turn channel.
  const buildSnapshotSummary = useCallback(
    (overrides?: { turnOwner?: TurnOwner | null }): string => {
      const s = snapshotRef.current;
      const effectiveTurnOwner =
        overrides && 'turnOwner' in overrides ? overrides.turnOwner ?? null : s.turnOwner;
      const tail = s.chat
        .slice(-12)
        .map((e) => `[${e.kind}] ${e.text}`)
        .join('\n');
      return JSON.stringify(
        {
          turnOwner: effectiveTurnOwner,
          gmConnected: s.status === 'open',
          humanReadyToAccuse: s.humanReadyToAccuse,
          agentReadyToAccuse: s.agentReadyToAccuse,
          locationVisitActive: s.locationVisitActive,
          busy: s.busy,
          evidenceCount: s.evidence.length,
          evidenceIds: s.evidence.map((e) => e.id),
          demeanor: s.demeanor,
          logTail: tail,
          gameOver: s.gameOver ? { correct: s.gameOver.correct } : null,
        },
        null,
        2,
      );
    },
    [],
  );

  const finishHumanTurn = useCallback(() => {
    if (turnOwner !== 'human' || busy) return;
    setLocationVisitActive(false);
    setInterrogating(null);
    setTurnOwner('agent');
    setChat((prev) => appendChat(prev, { kind: 'system', text: 'You finished your turn — Kayley’s move.' }));
    sendKayleyWsPayload({
      type: 'openroom_mystery_turn',
      summary: buildSnapshotSummary({ turnOwner: 'agent' }),
    });
  }, [turnOwner, busy, buildSnapshotSummary]);

  const finishAgentTurn = useCallback(() => {
    if (turnOwner !== 'agent' || busy) return;
    setLocationVisitActive(false);
    setInterrogating(null);
    setTurnOwner('human');
    setChat((prev) => appendChat(prev, { kind: 'system', text: 'Kayley finished her turn — your move, Steven.' }));
  }, [turnOwner, busy]);

  const handleInterrogate = useCallback(
    (suspect: SuspectId) => {
      if (!humanMayInvestigate || busy) return;
      const name = SUSPECTS.find((s) => s.id === suspect)?.name ?? suspect;
      void dispatchMysteryAction(ACTION_INTERROGATE, { suspect_id: suspect }, 'You press ' + name + ' for answers.').then(
        (r) => {
          if (r.status === 'success') {
            setInterrogating(suspect);
            setSuspectsInterrogated((prev) => new Set([...prev, suspect]));
            setQuestionText('');
            setTimeout(() => questionInputRef.current?.focus(), 50);
          }
        },
      );
      reportAction(APP_ID, ACTION_INTERROGATE, { suspect_id: suspect });
    },
    [dispatchMysteryAction, humanMayInvestigate, busy],
  );

  const handleSubmitQuestion = useCallback(() => {
    if (!humanMayInvestigate || !interrogating || !questionText.trim() || busy) return;
    const name = SUSPECTS.find((s) => s.id === interrogating)?.name ?? interrogating;
    void dispatchMysteryAction(
      ACTION_INTERROGATE,
      { suspect_id: interrogating, question: questionText.trim() },
      'You ask ' + name + ': "' + questionText.trim() + '"',
    );
    reportAction(APP_ID, ACTION_INTERROGATE, { suspect_id: interrogating, question: questionText.trim() });
    setQuestionText('');
  }, [interrogating, questionText, dispatchMysteryAction, humanMayInvestigate, busy]);

  const handleExamine = useCallback(
    (loc: LocationId) => {
      if (!humanMayInvestigate || busy) return;
      const name = LOCATIONS.find((l) => l.id === loc)?.name ?? loc;
      void dispatchMysteryAction(
        ACTION_EXAMINE_LOCATION,
        { location_id: loc },
        'You examine ' + name + '.',
      ).then((r) => {
        if (r.status === 'success') {
          setLocationVisitActive(true);
          setLocationsVisited((prev) => new Set([...prev, loc]));
        }
      });
      reportAction(APP_ID, ACTION_EXAMINE_LOCATION, { location_id: loc });
    },
    [dispatchMysteryAction, humanMayInvestigate, busy],
  );

  const handleDossier = useCallback(
    (suspect: SuspectId) => {
      if (!humanMayInvestigate || busy) return;
      const name = SUSPECTS.find((s) => s.id === suspect)?.name ?? suspect;
      void dispatchMysteryAction(
        ACTION_READ_DOSSIER,
        { suspect_id: suspect },
        'You open the dossier on ' + name + '.',
      ).then((r) => {
        if (r.status === 'success') {
          setDossiersOpened((prev) => new Set([...prev, suspect]));
        }
      });
      reportAction(APP_ID, ACTION_READ_DOSSIER, { suspect_id: suspect });
    },
    [dispatchMysteryAction, humanMayInvestigate, busy],
  );

  const handleCollect = useCallback(
    (evidence_id: string) => {
      if (!humanMayInvestigate || busy || !locationVisitActive) return;
      void dispatchMysteryAction(
        ACTION_COLLECT_EVIDENCE,
        { evidence_id },
        'You bag the evidence: ' + evidence_id,
      ).then((result) => {
        if (result.status === 'success') {
          setCollected((prev) => new Map([...prev, [evidence_id, result.narrative ?? '']]));
        }
      });
      reportAction(APP_ID, ACTION_COLLECT_EVIDENCE, { evidence_id });
    },
    [dispatchMysteryAction, humanMayInvestigate, busy, locationVisitActive],
  );

  const submitHumanChat = useCallback(() => {
    const text = chatDraft.trim();
    if (!text || gameOver) return;
    setChat((prev) => appendChat(prev, { kind: 'chat', text, author: 'steven' }));
    sendKayleyWsPayload({
      type: 'openroom_user_action',
      line: `chat: ${text}`,
    });
    reportAction(APP_ID, 'CHAT_MESSAGE', { text }, ActionTriggerBy.Human);
    setChatDraft('');
  }, [chatDraft, gameOver]);

  const handleAccuse = useCallback(
    (payload: AccusationPayload) => {
      if (!humanMayInvestigate || busy || !canOpenAccusationModal) return;
      const name = SUSPECTS.find((s) => s.id === payload.killer_id)?.name ?? payload.killer_id;
      void dispatchMysteryAction(
        ACTION_MAKE_ACCUSATION,
        {
          killer_id: payload.killer_id,
          motive: payload.motive,
          weapon: payload.weapon,
          method: payload.method,
        },
        'You accuse ' + name + '.',
      );
      reportAction(APP_ID, ACTION_MAKE_ACCUSATION, {
        killer_id: payload.killer_id,
        motive: payload.motive,
        weapon: payload.weapon,
        method: payload.method,
      });
      setAccuseOpen(false);
      setHumanReadyToAccuse(false);
      setAgentReadyToAccuse(false);
    },
    [dispatchMysteryAction, humanMayInvestigate, busy, canOpenAccusationModal],
  );

  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      const t = action.action_type ?? '';
      const params = (action.params || {}) as Record<string, string>;
      mysteryLog('info', 'MysteryApp', 'handleAgentAction.enter', `Action received: ${t}`, {
        action_type: t,
        params,
        turnOwner,
        agentMayInvestigate,
        busy,
        gameOver: !!gameOver,
        statusOpen: status === 'open',
      });

      if (t === ACTION_GET_MYSTERY_STATE) {
        mysteryLog('info', 'MysteryApp', 'handleAgentAction.branch', 'GET_MYSTERY_STATE → local snapshot', {});
        return buildSnapshotSummary();
      }

      if (t === ACTION_RESET_GAMEOVER) {
        mysteryLog('info', 'MysteryApp', 'handleAgentAction.branch', 'RESET_GAMEOVER → clearing gameOver state', {});
        setGameOver(null);
        reportAction(APP_ID, ACTION_RESET_GAMEOVER, {}, ActionTriggerBy.Agent);
        return 'success: gameOver cleared, investigation can resume.';
      }

      if (t === ACTION_SET_OPENING_PICK) {
        if (turnOwner !== null) {
          return 'error: SET_OPENING_PICK only valid before a game has started (turnOwner is already ' + turnOwner + ').';
        }
        const leader = (params.leader ?? '').toLowerCase();
        if (leader !== 'human' && leader !== 'agent') {
          return 'error: SET_OPENING_PICK requires leader=human|agent.';
        }
        mysteryLog('info', 'MysteryApp', 'handleAgentAction.branch', 'SET_OPENING_PICK → turnOwner', { leader });
        setTurnOwner(leader as TurnOwner);
        if (leader === 'agent') {
          setChat((prev) => appendChat(prev, { kind: 'system', text: 'Kayley leads the first investigation turn.' }));
        } else {
          setChat((prev) => appendChat(prev, { kind: 'system', text: 'Steven leads the first investigation turn.' }));
        }
        sendKayleyWsPayload({
          type: 'openroom_mystery_turn',
          summary: buildSnapshotSummary({ turnOwner: leader as TurnOwner }),
        });
        reportAction(APP_ID, ACTION_SET_OPENING_PICK, { leader }, ActionTriggerBy.Agent);
        return 'success: opening pick set to ' + leader + '.';
      }

      if (t === ACTION_CHAT_MESSAGE) {
        const text = (params.text ?? '').trim();
        if (!text) {
          return 'error: CHAT_MESSAGE requires a non-empty text param.';
        }
        mysteryLog('info', 'MysteryApp', 'handleAgentAction.branch', 'CHAT_MESSAGE → chat panel', {
          length: text.length,
        });
        setChat((prev) => appendChat(prev, { kind: 'chat', text, author: 'kayley' }));
        reportAction(APP_ID, ACTION_CHAT_MESSAGE, { text }, ActionTriggerBy.Agent);
        return 'success: chat appended.';
      }

      if (t === ACTION_SET_ACCUSATION_READY) {
        const raw = (params.ready ?? '').toLowerCase();
        const v = raw === 'true' || raw === '1' || raw === 'yes';
        setAgentReadyToAccuse(v);
        reportAction(APP_ID, ACTION_SET_ACCUSATION_READY, { ready: v ? 'true' : 'false' }, ActionTriggerBy.Agent);
        return v ? 'success: Kayley marked ready to discuss formal accusation.' : 'success: Kayley revoked accusation readiness.';
      }

      if (t === ACTION_FINISH_INVESTIGATION_TURN) {
        if (turnOwner !== 'agent' || busy) {
          return 'error: FINISH_INVESTIGATION_TURN only when it is Kayley’s turn and the GM is idle.';
        }
        finishAgentTurn();
        reportAction(APP_ID, ACTION_FINISH_INVESTIGATION_TURN, {}, ActionTriggerBy.Agent);
        return 'success: Turn handed to Steven.';
      }

      if (!MYSTERY_GM_ACTIONS.includes(t as (typeof MYSTERY_GM_ACTIONS)[number])) {
        mysteryLog('warning', 'MysteryApp', 'handleAgentAction.unknown', `Unknown action_type: ${t}`, {
          action_type: t,
        });
        return 'error: unknown action_type ' + t;
      }

      if (!agentMayInvestigate || busy) {
        mysteryLog('warning', 'MysteryApp', 'handleAgentAction.gate', 'Gate blocked: not agent turn / GM busy', {
          action_type: t,
          turnOwner,
          agentMayInvestigate,
          busy,
          status,
          gameOver: !!gameOver,
        });
        return 'error: not Kayley’s investigation turn or GM busy';
      }

      if (t === ACTION_COLLECT_EVIDENCE && !locationVisitActive) {
        mysteryLog('warning', 'MysteryApp', 'handleAgentAction.gate', 'COLLECT_EVIDENCE without active location visit', {
          locationVisitActive,
        });
        return 'error: COLLECT_EVIDENCE only after EXAMINE_LOCATION on your turn (start a location visit first).';
      }

      const label =
        'Kayley → ' + t + (Object.keys(params).length ? ' ' + JSON.stringify(params) : '');
      mysteryLog('info', 'MysteryApp', 'handleAgentAction.dispatch', `→ dispatchMysteryAction(${t})`, {
        action_type: t,
        params,
      });
      const result = await dispatchMysteryAction(t, params, label);
      mysteryLog(
        result.status.startsWith('error:') ? 'error' : 'info',
        'MysteryApp',
        'handleAgentAction.dispatch.result',
        `← dispatchMysteryAction(${t}) → ${result.status.slice(0, 60)}`,
        {
          action_type: t,
          status: result.status,
          narrative_length: result.narrative?.length ?? 0,
        },
      );
      if (result.status === 'success') {
        if (t === ACTION_EXAMINE_LOCATION) {
          setLocationVisitActive(true);
          if (params.location_id) {
            const visitedLoc = params.location_id;
            setLocationsVisited((prev) => new Set([...prev, visitedLoc]));
          }
        }
        if (t === ACTION_READ_DOSSIER && params.suspect_id) {
          const dossierTarget = params.suspect_id as SuspectId;
          setDossiersOpened((prev) => new Set([...prev, dossierTarget]));
        }
        if (t === ACTION_INTERROGATE && params.suspect_id) {
          const interrogateTarget = params.suspect_id as SuspectId;
          setSuspectsInterrogated((prev) => new Set([...prev, interrogateTarget]));
        }
        if (t === ACTION_COLLECT_EVIDENCE && params.evidence_id) {
          const collectedId = params.evidence_id;
          setCollected((prev) => new Map([...prev, [collectedId, result.narrative ?? '']]));
        }
        if (t === ACTION_MAKE_ACCUSATION) {
          setHumanReadyToAccuse(false);
          setAgentReadyToAccuse(false);
        }
      }
      reportAction(APP_ID, t, params, ActionTriggerBy.Agent);
      return serializeDispatchResult(result);
    },
    [
      buildSnapshotSummary,
      agentMayInvestigate,
      busy,
      dispatchMysteryAction,
      finishAgentTurn,
      locationVisitActive,
      turnOwner,
    ],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const mgr = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'game',
          name: APP_NAME,
          windowStyle: { width: 960, height: 680 },
        });
        mgr.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'game',
          name: APP_NAME,
          windowStyle: { width: 960, height: 680 },
        });
        reportLifecycle(AppLifecycle.DOM_READY);
        if (cancelled) return;
        reportLifecycle(AppLifecycle.LOADED);
        mgr.ready();
      } catch (err) {
        if (!cancelled) {
          console.error('[MysteryApp] init failed:', err);
          reportLifecycle(AppLifecycle.ERROR, String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  const statusDot = useMemo(() => {
    if (status === 'open') return { color: '#22c55e', label: 'GM connected' };
    if (status === 'connecting') return { color: '#FAEA5F', label: 'Connecting to GM…' };
    if (status === 'error') return { color: '#ef4444', label: 'GM unreachable' };
    return { color: '#888', label: 'GM disconnected' };
  }, [status]);

  const turnLabel =
    turnOwner === null
      ? 'Pick who leads'
      : turnOwner === 'human'
        ? 'Your turn (Steven)'
        : 'Kayley’s turn';

  return (
    <div className={styles.mystery}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.caseLabel}>CASE FILE</div>
          <h1 className={styles.title}>{SCENARIO_TITLE}</h1>
          <p className={styles.tagline}>{SCENARIO_TAGLINE}</p>
          <div className={styles.victim}>
            Victim: <strong>{VICTIM_NAME}</strong> — {VICTIM_ROLE}
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusRow}>
            <span className={styles.statusDot} style={{ background: statusDot.color }} />
            <span>{statusDot.label}</span>
          </div>
          <div className={styles.turnBanner} data-testid="mystery-turn-label">
            {turnLabel}
          </div>
          {lastError && <div className={styles.errorText}>{lastError}</div>}

          {turnOwner === null && !gameOver && (
            <div className={styles.openingPick} data-testid="mystery-opening-pick">
              <span>Who takes the first investigation turn?</span>
              <button type="button" className={styles.openingBtn} onClick={() => setTurnOwner('human')}>
                I go first
              </button>
              <button
                type="button"
                className={styles.openingBtn}
                onClick={() => {
                  setTurnOwner('agent');
                  setChat((prev) => appendChat(prev, { kind: 'system', text: 'Kayley leads the first investigation turn.' }));
                  sendKayleyWsPayload({ type: 'openroom_mystery_turn', summary: buildSnapshotSummary({ turnOwner: 'agent' }) });
                }}
              >
                Kayley goes first
              </button>
            </div>
          )}

          {turnOwner !== null && !gameOver && (
            <div className={styles.readyRow}>
              <label className={styles.readyLabel}>
                <input
                  type="checkbox"
                  checked={humanReadyToAccuse}
                  onChange={(e) => setHumanReadyToAccuse(e.target.checked)}
                  disabled={!!gameOver || busy}
                />
                Steven ready to accuse
              </label>
              <span className={styles.readyHint}>Kayley toggles readiness via vibe_action SET_ACCUSATION_READY.</span>
              <span className={styles.readyBadge} data-testid="agent-ready-badge">
                Kayley ready: {agentReadyToAccuse ? 'yes' : 'no'}
              </span>
            </div>
          )}

          {turnOwner === 'human' && !gameOver && (
            <button
              type="button"
              className={styles.finishTurnBtn}
              data-testid="mystery-finish-turn"
              disabled={busy || !humanMayInvestigate}
              onClick={finishHumanTurn}
            >
              Finish turn
            </button>
          )}

          <button
            type="button"
            className={styles.accuseButton}
            data-testid="mystery-make-accusation"
            disabled={!canOpenAccusationModal}
            onClick={() => setAccuseOpen(true)}
          >
            <Gavel size={16} /> Make Accusation
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.leftCol}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <Users size={16} />
              <span>Suspects</span>
            </div>
            <div className={styles.suspectGrid}>
              {SUSPECTS.map((s) => {
                const mood = demeanor[s.id];
                return (
                  <div key={s.id} className={styles.suspectCard}>
                    <div className={styles.headshot} aria-label={s.name + ' portrait placeholder'}>
                      {s.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className={styles.suspectName}>{s.name}</div>
                    <div className={styles.suspectRole}>{s.role}</div>
                    <div className={styles.suspectBlurb}>{s.blurb}</div>
                    {mood && <div className={styles.demeanorChip}>{mood}</div>}
                    <div className={styles.suspectActions}>
                      <button
                        type="button"
                        className={dossiersOpened.has(s.id) ? styles.suspectActionDone : undefined}
                        disabled={busy || !!gameOver || status !== 'open' || !humanMayInvestigate}
                        onClick={() => handleDossier(s.id)}
                      >
                        <ScrollText size={12} /> Dossier
                      </button>
                      <button
                        type="button"
                        className={suspectsInterrogated.has(s.id) ? styles.suspectActionDone : undefined}
                        disabled={busy || !!gameOver || status !== 'open' || !humanMayInvestigate}
                        onClick={() => handleInterrogate(s.id)}
                      >
                        <Search size={12} /> Interrogate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <MapPin size={16} />
              <span>Locations</span>
            </div>
            <ul className={styles.locationList}>
              {LOCATIONS.map((loc) => {
                const visited = locationsVisited.has(loc.id);
                return (
                  <li key={loc.id}>
                    <button
                      type="button"
                      className={`${styles.locationBtn} ${visited ? styles.locationVisited : ''}`}
                      disabled={busy || !!gameOver || status !== 'open' || !humanMayInvestigate}
                      onClick={() => handleExamine(loc.id)}
                    >
                      <div className={styles.locationName}>
                        {loc.name}
                        {visited && <span className={styles.locationVisitedBadge}>visited</span>}
                      </div>
                      <div className={styles.locationHint}>{loc.hint}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        <section className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <Search size={16} />
            <span>Investigation Log</span>
          </div>
          <div className={styles.chatScroll} ref={chatScrollRef}>
            {chat.map((entry) => {
              const cls = styles['chat_' + entry.kind] ?? styles.chat_system;
              const authorPrefix =
                entry.kind === 'chat' && entry.author
                  ? entry.author === 'kayley'
                    ? 'Kayley: '
                    : 'Steven: '
                  : '';
              return (
                <div key={entry.id} className={cls} data-author={entry.author ?? ''}>
                  {authorPrefix}
                  {entry.text}
                </div>
              );
            })}
            {busy && <div className={styles.chat_system}>GM is thinking…</div>}
          </div>
          <div className={styles.chatComposer} data-testid="mystery-chat-composer">
            <input
              type="text"
              className={styles.chatComposerInput}
              placeholder="Say something to Kayley (co-detective banter)…"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitHumanChat();
                }
              }}
              disabled={!!gameOver}
              data-testid="mystery-chat-input"
            />
            <button
              type="button"
              className={styles.chatComposerSend}
              disabled={!chatDraft.trim() || !!gameOver}
              onClick={submitHumanChat}
              data-testid="mystery-chat-send"
            >
              Send
            </button>
          </div>
          {interrogating && (
            <div className={styles.questionBar}>
              <span className={styles.questionLabel}>
                Ask {SUSPECTS.find((s) => s.id === interrogating)?.name ?? interrogating}:
              </span>
              <input
                ref={questionInputRef}
                type="text"
                className={styles.questionInput}
                placeholder="Type your question…"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitQuestion();
                  }
                  if (e.key === 'Escape') {
                    setInterrogating(null);
                  }
                }}
                disabled={busy || !!gameOver || status !== 'open' || !humanMayInvestigate}
              />
              <button
                type="button"
                className={styles.questionSend}
                disabled={busy || !!gameOver || status !== 'open' || !humanMayInvestigate || !questionText.trim()}
                onClick={handleSubmitQuestion}
              >
                Ask
              </button>
              <button
                type="button"
                className={styles.questionClose}
                onClick={() => setInterrogating(null)}
                aria-label="Cancel interrogation"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </section>

        <aside className={styles.evidenceCol}>
          <div className={styles.panelHeader}>
            <ScrollText size={16} />
            <span>Evidence Board</span>
          </div>
          {evidence.length === 0 ? (
            <div className={styles.emptyEvidence}>
              No evidence collected yet. Examine locations and interrogate suspects.
            </div>
          ) : (
            <ul className={styles.evidenceList}>
              {evidence.map((ev) => (
                <li key={ev.id} className={styles.evidenceItem}>
                  <div className={styles.evidenceId}>{ev.id}</div>
                  <div className={styles.evidenceDesc}>{ev.description}</div>
                  {ev.source && <div className={styles.evidenceSource}>Source: {ev.source}</div>}
                  {collected.has(ev.id) ? (
                    <button
                      type="button"
                      className={styles.evidenceCollected}
                      onClick={() =>
                        setExpandedEvidence((prev) => {
                          const next = new Set(prev);
                          next.has(ev.id) ? next.delete(ev.id) : next.add(ev.id);
                          return next;
                        })
                      }
                    >
                      {expandedEvidence.has(ev.id) ? 'Hide Notes' : 'Read Notes'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.evidenceCollect}
                      disabled={
                        busy || !!gameOver || status !== 'open' || !humanMayInvestigate || !locationVisitActive
                      }
                      onClick={() => handleCollect(ev.id)}
                    >
                      Collect
                    </button>
                  )}
                  {expandedEvidence.has(ev.id) && collected.has(ev.id) && (
                    <div className={styles.evidenceNotes}>{collected.get(ev.id)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {accuseOpen && (
        <AccusationModal
          onClose={() => setAccuseOpen(false)}
          onSubmit={handleAccuse}
          disabled={busy}
        />
      )}

      {gameOver && <GameOverModal gameOver={gameOver} onClose={() => setGameOver(null)} />}
    </div>
  );
};

const AccusationModal: React.FC<{
  onClose: () => void;
  onSubmit: (payload: AccusationPayload) => void;
  disabled: boolean;
}> = ({ onClose, onSubmit, disabled }) => {
  const [killerId, setKillerId] = useState<SuspectId>(SUSPECTS[0].id);
  const [motive, setMotive] = useState('');
  const [weapon, setWeapon] = useState('');
  const [method, setMethod] = useState('');

  const canSubmit = motive.trim() && weapon.trim() && method.trim() && !disabled;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Formal Accusation</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={styles.modalSubtitle}>
          One shot. Be specific about motive, weapon, and method.
        </p>
        <label className={styles.field}>
          <span>Killer</span>
          <select value={killerId} onChange={(e) => setKillerId(e.target.value as SuspectId)}>
            {SUSPECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.role}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Motive</span>
          <input
            type="text"
            value={motive}
            onChange={(e) => setMotive(e.target.value)}
            placeholder="e.g. financial ruin from the Series C dilution"
          />
        </label>
        <label className={styles.field}>
          <span>Weapon</span>
          <input
            type="text"
            value={weapon}
            onChange={(e) => setWeapon(e.target.value)}
            placeholder="e.g. fentanyl-laced whiskey"
          />
        </label>
        <label className={styles.field}>
          <span>Method</span>
          <textarea
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            rows={3}
            placeholder="Exactly how and when was it done?"
          />
        </label>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.modalPrimary}
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({ killer_id: killerId, motive: motive.trim(), weapon: weapon.trim(), method: method.trim() })
            }
          >
            Accuse
          </button>
        </div>
      </div>
    </div>
  );
};

const GameOverModal: React.FC<{
  gameOver: NonNullable<MysteryActionResponse['game_over']>;
  onClose: () => void;
}> = ({ gameOver, onClose }) => {
  const verdictClass = gameOver.correct ? styles.verdictWin : styles.verdictLose;
  const solution = gameOver.solution;
  const killerName = solution?.killer_id
    ? (SUSPECTS.find((s) => s.id === solution.killer_id)?.name ?? solution.killer_id)
    : '(GM did not return a solution)';
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={verdictClass}>{gameOver.correct ? 'CASE CLOSED' : 'WRONG CALL'}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={styles.reveal}>{gameOver.reveal}</p>
        <div className={styles.solutionBlock}>
          <div>
            <strong>Killer:</strong> {killerName}
          </div>
          <div>
            <strong>Motive:</strong> {solution?.motive ?? '—'}
          </div>
          <div>
            <strong>Weapon:</strong> {solution?.weapon ?? '—'}
          </div>
          <div>
            <strong>Method:</strong> {solution?.method ?? '—'}
          </div>
        </div>
        {!gameOver.correct && (
          <div className={styles.hint}>
            <AlertTriangle size={14} /> Reopen the case file and keep digging.
          </div>
        )}
      </div>
    </div>
  );
};

export default MysteryApp;
