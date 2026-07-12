/**
 * Action Policy — sole authority for transition→action mapping (Fix 02.6.3).
 *
 * **Purpose:** Stable action IDs and metadata for {@link EntryAction} scaffold.
 * **MUST NOT:** Execute actions or wire production.
 *
 * @module entryStateManager/actionPolicy
 */

import { EntryActionType, type ActionPolicyMetadata } from './actionTypes';
import { EntryState } from './stateMachineTypes';

/** Supported transition with stable action metadata. */
interface ActionPolicyRow extends ActionPolicyMetadata {
  readonly fromState: EntryState;
  readonly toState: EntryState;
}

const ACTION_POLICY_TABLE: readonly ActionPolicyRow[] = [
  {
    actionId: 'ENTRY-ACTION-001',
    actionType: EntryActionType.NO_ACTION,
    fromState: EntryState.IDLE,
    toState: EntryState.WATCH,
  },
  {
    actionId: 'ENTRY-ACTION-002',
    actionType: EntryActionType.PREPARE_ENTRY,
    fromState: EntryState.WATCH,
    toState: EntryState.READY,
  },
  {
    actionId: 'ENTRY-ACTION-003',
    actionType: EntryActionType.CONFIRM_ENTRY,
    fromState: EntryState.READY,
    toState: EntryState.ENTRY,
  },
  {
    actionId: 'ENTRY-ACTION-004',
    actionType: EntryActionType.OPEN_POSITION,
    fromState: EntryState.ENTRY,
    toState: EntryState.ACTIVE,
  },
  {
    actionId: 'ENTRY-ACTION-005',
    actionType: EntryActionType.PREPARE_EXIT,
    fromState: EntryState.ACTIVE,
    toState: EntryState.EXIT,
  },
  {
    actionId: 'ENTRY-ACTION-006',
    actionType: EntryActionType.RESET_STATE,
    fromState: EntryState.EXIT,
    toState: EntryState.IDLE,
  },
];

function transitionPairKey(fromState: EntryState, toState: EntryState): string {
  return `${fromState}->${toState}`;
}

const ACTION_POLICY_LOOKUP: Readonly<Record<string, ActionPolicyRow>> = Object.fromEntries(
  ACTION_POLICY_TABLE.map((row) => [transitionPairKey(row.fromState, row.toState), row]),
);

/** Transition→action policy — SSOT for action scaffold metadata. */
export interface ActionPolicy {
  getActionForTransition(fromState: EntryState, toState: EntryState): EntryActionType | null;
  listSupportedTransitions(): readonly ActionPolicyMetadata[];
  isSupportedTransition(fromState: EntryState, toState: EntryState): boolean;
  buildActionId(fromState: EntryState, toState: EntryState): string | null;
  getActionMetadata(fromState: EntryState, toState: EntryState): ActionPolicyMetadata | null;
}

/**
 * Sole policy object for action mapping — **no logic elsewhere**.
 */
export const ACTION_POLICY: ActionPolicy = {
  getActionForTransition(fromState: EntryState, toState: EntryState): EntryActionType | null {
    return ACTION_POLICY_LOOKUP[transitionPairKey(fromState, toState)]?.actionType ?? null;
  },

  listSupportedTransitions(): readonly ActionPolicyMetadata[] {
    return ACTION_POLICY_TABLE.map((row) => ({
      actionId: row.actionId,
      actionType: row.actionType,
      fromState: row.fromState,
      toState: row.toState,
    }));
  },

  isSupportedTransition(fromState: EntryState, toState: EntryState): boolean {
    return ACTION_POLICY_LOOKUP[transitionPairKey(fromState, toState)] !== undefined;
  },

  buildActionId(fromState: EntryState, toState: EntryState): string | null {
    return ACTION_POLICY_LOOKUP[transitionPairKey(fromState, toState)]?.actionId ?? null;
  },

  getActionMetadata(fromState: EntryState, toState: EntryState): ActionPolicyMetadata | null {
    const row = ACTION_POLICY_LOOKUP[transitionPairKey(fromState, toState)];
    if (!row) {
      return null;
    }
    return {
      actionId: row.actionId,
      actionType: row.actionType,
      fromState: row.fromState,
      toState: row.toState,
    };
  },
};
