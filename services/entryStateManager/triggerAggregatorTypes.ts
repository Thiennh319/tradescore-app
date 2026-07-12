/**
 * Trigger Aggregator — type models (Task 02.5.1).
 *
 * **Purpose:** Collect and validate detector results — no priority, conflict, or transition.
 *
 * **MUST NOT:** Sort, filter by detected, merge, resolve priority, decide state, or transition.
 *
 * @module entryStateManager/triggerAggregatorTypes
 */

import type { ConfirmationDetectionResult } from './confirmationDetectionTypes';
import type { HardBlockDetectionResult } from './hardBlockDetectionTypes';
import type { NoiseDetectionResult } from './noiseDetectionTypes';
import type { RecoveryDetectionResult } from './recoveryDetectionTypes';
import type { UnlockDetectionResult } from './unlockDetectionTypes';

/**
 * Input bundle — optional detector results from frozen Detection Layer.
 *
 * Each slot is populated by upstream detection; aggregator only reads.
 */
export interface TriggerAggregatorContext {
  hardBlockResult?: HardBlockDetectionResult;
  recoveryResult?: RecoveryDetectionResult;
  unlockResult?: UnlockDetectionResult;
  confirmationResult?: ConfirmationDetectionResult;
  noiseResult?: NoiseDetectionResult;
  scanId?: string;
}

/**
 * Aggregated output — passthrough of valid detector results.
 *
 * `triggerCount` = number of **valid** detector result slots present — not `detected=true` count.
 */
export interface TriggerAggregateResult {
  hardBlockResult?: HardBlockDetectionResult;
  recoveryResult?: RecoveryDetectionResult;
  unlockResult?: UnlockDetectionResult;
  confirmationResult?: ConfirmationDetectionResult;
  noiseResult?: NoiseDetectionResult;
  /** Count of valid detector results supplied — independent of `detected` flag. */
  triggerCount: number;
  halted: boolean;
  message: string;
  context: TriggerAggregatorContext;
}

/** Context validation result — structure and metadata only. */
export interface TriggerAggregatorContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}
