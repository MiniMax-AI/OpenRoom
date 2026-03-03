/**
 * Action and Lifecycle Reporting Module
 *
 * Provides shared infrastructure for Agent <-> Frontend bidirectional communication:
 * - Action type definitions
 * - Action reporting functions
 * - Lifecycle reporting functions
 * - Agent Action listener Hook
 */

import { useEffect, useRef } from 'react';
import { getClientComManager, AppLifecycle } from '@gui/vibe-container';

// ============ Type Definitions ============

/**
 * Trigger source enum
 */
export enum ActionTriggerBy {
  User = 1,
  Agent = 2,
  System = 3,
}

/**
 * Action communication structure
 * Used by both Agent <-> Frontend directions
 */
export interface CharacterAppAction {
  /** Application ID (integer) */
  app_id: number;
  /** Unique instance identifier (number), not required for user actions, included when dispatched by Agent */
  action_id?: number;
  /** Action type, e.g. CREATE_POST, DELETE_POST */
  action_type?: string;
  /** Parameter key-value pairs (all values are strings) */
  params?: Record<string, string>;
  /** Timestamp (milliseconds) */
  timestamp_ms?: number;
  /** Trigger source */
  trigger_by?: ActionTriggerBy;
}

/**
 * OS event type enum
 */
export enum OsEventType {
  AppAction = 1,
}

/**
 * OS event structure (direction: Frontend -> Agent)
 * Top-level communication structure used by sendAgentMessage
 */
export interface CharacterOsEvent {
  /** Event unique ID (always pass 0) */
  id: number;
  /** Event type */
  event_type: OsEventType;
  /** Associated App Action (when event_type is AppAction) */
  app_action?: CharacterAppAction;
  /** Extra information */
  extra?: string;
  /** Action execution result (used when sending back) */
  action_result?: string;
}

// ============ Action Reporting Toggle ============

let _reportUserActionsEnabled = true;

/**
 * Set whether to report user action events
 * @param enabled true to enable reporting (default), false to silently discard
 */
export const setReportUserActions = (enabled: boolean): void => {
  _reportUserActionsEnabled = enabled;
};

export const isReportUserActionsEnabled = (): boolean => _reportUserActionsEnabled;

// ============ Action Reporting ============

/**
 * Report an Action to the Agent
 *
 * @param appId Application ID
 * @param actionType Action type
 * @param params Parameter key-value pairs
 * @param triggerBy Trigger source, defaults to User
 *
 * @example
 * reportAction(1, 'CREATE_POST', { content: '...' });
 */
export const reportAction = (
  appId: number,
  actionType: string,
  params?: Record<string, string>,
  triggerBy: ActionTriggerBy = ActionTriggerBy.User,
): void => {
  if (!_reportUserActionsEnabled && triggerBy === ActionTriggerBy.User) return;
  const manager = getClientComManager();
  const action: CharacterAppAction = {
    app_id: appId,
    action_id: 0,
    action_type: actionType,
    params,
    timestamp_ms: Date.now(),
    trigger_by: triggerBy,
  };
  const event: CharacterOsEvent = {
    id: 0,
    event_type: OsEventType.AppAction,
    app_action: action,
  };
  console.info('[Action] reportAction: event', event);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manager.sendAgentMessage(event as any);
};

// ============ Lifecycle Reporting ============

/**
 * Report lifecycle status to the parent page
 *
 * @param lifecycle Lifecycle enum value
 * @param error Error message (only used for ERROR status)
 */
export const reportLifecycle = (lifecycle: AppLifecycle, error?: string): void => {
  if (window.parent !== window) {
    window.parent.postMessage(
      {
        type: 'lifecycle_change',
        payload: JSON.stringify({ lifecycle, error, timestamp: Date.now() }),
      },
      '*',
    );
  }
};

// ============ Agent Action Listener Hook ============

/**
 * Listen for Actions sent by the Agent
 *
 * Receives CharacterAppAction dispatched by the Agent, automatically filters out
 * Actions not belonging to the current App.
 * Handler uses ref pattern, no need to memoize.
 *
 * Handler can return a string as action_result, which will be automatically
 * sent back to the Agent as a CharacterOsEvent (id is always 0).
 *
 * @param appId Current application ID
 * @param handler Processing function that receives parsed CharacterAppAction, can return a result string
 *
 * @example
 * useAgentActionListener(APP_ID, (action) => {
 *   switch (action.action_type) {
 *     case 'CREATE_POST': {
 *       // ... processing logic
 *       return 'success';
 *     }
 *   }
 * });
 */
export const useAgentActionListener = (
  appId: number,
  handler: (action: CharacterAppAction) => string | void | Promise<string | void>,
): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const manager = getClientComManager();
    const unsubscribe = manager.onAgentMessage((payload: { content: string }) => {
      console.info('[Action] onAgentMessage: payload', payload);
      try {
        const action = JSON.parse(payload.content) as CharacterAppAction;
        console.info('[Action] onAgentMessage: action', action);
        if (action.app_id !== null && action.app_id !== undefined && action.app_id !== appId) {
          console.info('[Action] onAgentMessage: action.app_id is not equal to appId');
          return;
        }

        console.info('[Action] onAgentMessage: matched action', action);

        // Execute handler and send back the result
        const sendResult = (result: string | void) => {
          const responseEvent: CharacterOsEvent = {
            id: 0,
            event_type: OsEventType.AppAction,
            app_action: action,
            action_result: result ?? 'done',
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          console.info('[Action] onAgentMessage: sendResult: responseEvent', responseEvent);
          manager.sendAgentMessage(responseEvent as any);
        };

        const result = handlerRef.current(action);
        if (result instanceof Promise) {
          result.then(sendResult).catch((err) => {
            console.error('[AgentAction] Handler error:', err);
            const responseEvent: CharacterOsEvent = {
              id: 0,
              event_type: OsEventType.AppAction,
              app_action: action,
              action_result: `error: ${String(err)}`,
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            manager.sendAgentMessage(responseEvent as any);
          });
        } else {
          sendResult(result);
        }
      } catch (error) {
        console.error('[AgentAction] Failed to parse agent message:', error);
      }
    });
    return () => unsubscribe();
  }, [appId]);
};
