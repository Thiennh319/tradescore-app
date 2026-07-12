/**
 * State Evaluation Pipeline — type models (Task 02.3.2).
 *
 * **Purpose:** Data contracts for the 7-step evaluation flow **before** state machine
 * decides transitions. Pipeline **evaluates only** — does not mutate state.
 *
 * **Do not use in:** Production scan, store writes, or transition execution.
 *
 * @module entryStateManager/evaluationTypes
 */

import type { EntryState } from './enums';
import type { EsmDirection } from './enums';
import type { TransitionCategory, TransitionSourceModule } from './transitionMetadata';
import type { EntryStateManagerInput, EntryStateSnapshot } from './types';
import type { EntryTransitionDefinition, EntryTransitionId } from './transitionTypes';
import type { EntryStateValidationResult } from './validationResult';

/**
 * Pipeline step identifiers — fixed order for future state machine (Task 02.4+).
 *
 * Steps 1–7 describe evaluation flow only; step 6 does **not** decide transitions.
 */
export enum EntryStateEvaluationStep {
  ReadSnapshot = 1,
  ValidateSnapshot = 2,
  CollectCandidates = 3,
  CollectTriggers = 4,
  SortTriggers = 5,
  SelectCandidate = 6,
  EmitResult = 7,
}

/**
 * Trigger kinds declared for evaluation — maps to {@link TransitionCategory} priority.
 *
 * **Declaration only** — no trigger detection logic in Task 02.3.2.
 */
export enum EntryTriggerKind {
  HardBlock = 'HardBlock',
  Unlock = 'Unlock',
  Recovery = 'Recovery',
  Confirmation = 'Confirmation',
  Noise = 'Noise',
}

/**
 * Minimal market snapshot read at pipeline step 1.
 *
 * **Read-only** — populated by integration layer later; not fetched from Binance here.
 */
export interface EntryStateMarketSnapshot {
  symbol: string;
  markPrice: number;
  /** ISO8601 */
  timestamp: string;
}

/**
 * Minimal signal/rule context at pipeline step 1.
 *
 * Wraps {@link EntryStateManagerInput} fields needed for future trigger binding.
 */
export interface EntryStateSignalSnapshot {
  direction: EsmDirection;
  canEnter: boolean;
  decision: string;
  hardBlocks: readonly string[];
  tradePlanValid: boolean;
  entryScore: number | null;
}

/**
 * Input bundle for the evaluation pipeline — step 1 output shape.
 *
 * State machine (future) passes this; pipeline **does not** transition.
 */
export interface EntryStateEvaluationContext {
  /** Current ESM state before any transition. */
  currentEntryState: EntryState;
  /** Rule/signal context from scan (read-only). */
  currentSignal: EntryStateSignalSnapshot;
  /** Market prices (read-only). */
  currentMarket: EntryStateMarketSnapshot;
  /** Optional persisted ESM snapshot — RuleBook §9.2. */
  esmSnapshot?: EntryStateSnapshot | null;
  /** Optional full rule-engine input — Task integration. */
  ruleEngineInput?: EntryStateManagerInput | null;
  /** Scan correlation id. */
  scanId?: string;
}

/**
 * One structurally allowed outgoing edge from current state — step 3 output item.
 *
 * Sourced **only** from {@link ENTRY_ALLOWED_TRANSITIONS}; never invented.
 */
export interface EntryTransitionCandidate {
  transitionId: EntryTransitionId;
  fromState: EntryState;
  toState: EntryState;
  transitionReason: string;
  transitionCategory: TransitionCategory;
  priority: number;
  sourceModule: TransitionSourceModule;
  auditLabel: string;
  ruleReference: string;
  /** Full matrix row — read-only reference. */
  definition: EntryTransitionDefinition;
}

/**
 * Declared trigger slot — step 4 output item.
 *
 * **No detection logic** — interface for state machine to fill later.
 */
export interface EntryTrigger {
  kind: EntryTriggerKind;
  category: TransitionCategory;
  /** From transition metadata priority — used for step 5 sort order description. */
  priority: number;
  sourceModule: TransitionSourceModule;
  /** Placeholder for future condition text — not evaluated here. */
  reasonPlaceholder: string;
  /** Optional link to a matrix transition — not resolved at scaffold. */
  relatedTransitionId?: EntryTransitionId;
}

/**
 * Step 6 placeholder — state machine selects later; always null in Task 02.3.2.
 */
export interface EntryStateNextStepPlaceholder {
  /** Fixed message — no decision made. */
  message: string;
  /** Candidate chosen by state machine — null until Task 02.4+. */
  selectedTransitionId: EntryTransitionId | null;
}

/**
 * Full pipeline evaluation output — step 7.
 *
 * **Does not change** `currentEntryState` or persist anything.
 */
export interface EntryStateEvaluationResult {
  currentState: EntryState;
  /** Result of step 2 — {@link validateEntryState} on current state. */
  snapshotValidation: EntryStateValidationResult;
  /** Step 3 — allowed outgoing transitions from matrix only. */
  candidateTransitions: readonly EntryTransitionCandidate[];
  /** Step 4 — declared trigger slots (may be empty at scaffold). */
  triggers: readonly EntryTrigger[];
  /** Step 5 — triggers ordered by priority desc (metadata order description). */
  sortedTriggers: readonly EntryTrigger[];
  /** Step 6 — placeholder only; never selects a transition in this task. */
  nextStep: EntryStateNextStepPlaceholder;
  /** Highest pipeline step described / reached in a future executor. */
  pipelineStepReached: EntryStateEvaluationStep;
  /** True when step 2 validation fails — no transition evaluation. */
  halted: boolean;
  context: EntryStateEvaluationContext;
}
