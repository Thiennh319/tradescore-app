/**
 * Signal Board Scan adapter — type models (Task 02.7.1).
 *
 * **Purpose:** Map SignalBoardScan snapshot into ESM pipeline context shapes.
 * **Does NOT** evaluate, decide, transition, or wire production scan path.
 *
 * @module entryStateManager/signalBoardAdapterTypes
 */

import type { ConfirmationDetectionResult } from './confirmationDetectionTypes';
import type { ConflictResolverContext, ConflictResolverResult } from './conflictResolverTypes';
import type { DecisionEngineContext } from './decisionEngineTypes';
import type { EntryStateMarketSnapshot } from './evaluationTypes';
import type { HardBlockDetectionResult } from './hardBlockDetectionTypes';
import type { NoiseDetectionResult } from './noiseDetectionTypes';
import type {
  PriorityResolverContext,
  PriorityResolverResult,
} from './priorityResolverTypes';
import type { RecoveryDetectionResult } from './recoveryDetectionTypes';
import type { TriggerAggregateResult, TriggerAggregatorContext } from './triggerAggregatorTypes';
import type { UnlockDetectionResult } from './unlockDetectionTypes';

/**
 * Minimal read-only SignalBoardScan row snapshot — adapter-owned contract.
 *
 * Mirrors fields needed for integration without importing production scan modules.
 */
export interface SignalBoardScanSnapshot {
  symbol: string;
  price: number | null;
  direction: string;
  canEnter: boolean;
  hardBlocked: boolean;
  decisionLabel?: string;
  decisionDisplay?: string;
}

/**
 * Detector + optional staged pipeline outputs from scan sidecar.
 *
 * Adapter performs field copy only — no detection or pipeline evaluation.
 */
export interface SignalBoardTriggerSnapshot {
  hardBlockResult?: HardBlockDetectionResult;
  recoveryResult?: RecoveryDetectionResult;
  unlockResult?: UnlockDetectionResult;
  confirmationResult?: ConfirmationDetectionResult;
  noiseResult?: NoiseDetectionResult;
  /** Optional pre-staged aggregate — passthrough when scan already bundled it. */
  aggregateResult?: TriggerAggregateResult;
  /** Optional pre-staged priority — passthrough when scan already bundled it. */
  priorityResult?: PriorityResolverResult;
  /** Optional pre-staged conflict — passthrough when scan already bundled it. */
  conflictResult?: ConflictResolverResult;
}

/** Adapter input — read-only scan bundle from integration layer. */
export interface SignalBoardAdapterContext {
  signalBoardScan: SignalBoardScanSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  triggerSnapshot: SignalBoardTriggerSnapshot;
  scanId: string;
  /** ISO8601 scan timestamp. */
  timestamp: string;
}

/**
 * Adapter output — mapped pipeline contexts for orchestration (Task 02.7.2+).
 *
 * Downstream integration calls `aggregateTriggers(aggregateContext)` then continues
 * the pipeline with fresh results; staged fields are passthrough when supplied.
 */
export interface SignalBoardAdapterResult {
  aggregateContext: TriggerAggregatorContext;
  priorityContext: PriorityResolverContext;
  conflictContext: ConflictResolverContext;
  decisionContext: DecisionEngineContext;
  scanId: string;
  timestamp: string;
}

/** Context validation result — structure and required snapshot checks only. */
export interface SignalBoardAdapterContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — mapped output integrity only. */
export interface SignalBoardAdapterResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}
