/**
 * Position Adviser Integration Harness — type models (Task 02.8.2).
 *
 * **Purpose:** Orchestrate {@link PositionAdviserAdapterResult} → future Position Adviser.
 * **Does NOT** score, recommend, size positions, or wire production.
 *
 * @module entryStateManager/positionAdviserHarnessTypes
 */

import type { IntegrationHarnessResult } from './integrationHarnessTypes';
import type {
  PositionAdviserAdapterResult,
  PositionAdviserInput,
} from './positionAdviserAdapterTypes';

/**
 * Harness input — adapter output + scan correlation metadata.
 *
 * `adapterResult` is output of {@link buildPositionAdviserAdapterResult}.
 */
export interface PositionAdviserHarnessContext {
  adapterResult: PositionAdviserAdapterResult;
  scanId: string;
  timestamp: string;
}

/**
 * Harness output — adapter passthrough + {@link PositionAdviserInput} for future adviser.
 *
 * Does not invoke Position Adviser (Task 02.8.3+).
 */
export interface PositionAdviserHarnessResult {
  adapterResult: PositionAdviserAdapterResult;
  positionAdviserInput: PositionAdviserInput;
  scanId: string;
  timestamp: string;
  halted: boolean;
  message: string;
  context: PositionAdviserHarnessContext;
}

/** Context validation result. */
export interface PositionAdviserHarnessContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — passthrough and halted consistency. */
export interface PositionAdviserHarnessResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Convenience alias — integration harness result fed into adviser adapter chain. */
export type PositionAdviserHarnessIntegrationSource = IntegrationHarnessResult;
