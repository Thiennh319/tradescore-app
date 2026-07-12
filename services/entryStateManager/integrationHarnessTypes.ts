/**
 * Integration Harness — type models (Task 02.7.3).
 *
 * **Purpose:** Sole integration boundary between production scan input and ESM pipeline.
 * **Does NOT** decide, evaluate rules, transition, or execute actions.
 *
 * @module entryStateManager/integrationHarnessTypes
 */

import type { EntryStateMarketSnapshot } from './evaluationTypes';
import type { PipelineOrchestratorResult } from './pipelineOrchestratorTypes';
import type { SignalBoardAdapterResult, SignalBoardScanSnapshot, SignalBoardTriggerSnapshot } from './signalBoardAdapterTypes';
import type { EntryState } from './stateMachineTypes';

/** Production-facing input bundle — read-only scan + state injection. */
export interface IntegrationHarnessContext {
  signalBoardScan: SignalBoardScanSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  triggerSnapshot: SignalBoardTriggerSnapshot;
  /** State machine current state — injected before pipeline tail re-run. */
  currentState: EntryState;
  scanId: string;
  /** ISO8601 scan timestamp. */
  timestamp: string;
}

/**
 * Integration harness output — adapter + orchestrated pipeline + metadata.
 *
 * `pipelineResult.stateMachineResult.currentState` reflects injected {@link currentState}.
 */
export interface IntegrationHarnessResult {
  adapterResult: SignalBoardAdapterResult;
  pipelineResult: PipelineOrchestratorResult;
  halted: boolean;
  message: string;
  context: IntegrationHarnessContext;
}

/** Context validation result. */
export interface IntegrationHarnessContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — adapter, pipeline, halted, and state passthrough. */
export interface IntegrationHarnessResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}
