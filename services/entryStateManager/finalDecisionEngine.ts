/**
 * Final Decision Runtime (Task 02.5.6).
 *
 * **Selects** at most one {@link FinalDecision} from {@link DecisionEngineResult}.
 * **Does NOT** choose EntryState, transition, mutate upstream modules, or wire production.
 *
 * @module entryStateManager/finalDecisionEngine
 */

import { validateDecisionEngineContext } from './decisionEngine';
import { DecisionCandidateStatus } from './decisionEngineTypes';
import type { DecisionCandidate, DecisionEngineResult } from './decisionEngineTypes';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import type {
  FinalDecision,
  FinalDecisionContext,
  FinalDecisionContextValidationResult,
  FinalDecisionResult,
  FinalDecisionResultValidationResult,
} from './finalDecisionTypes';
import { isRecord } from './pipelineValidationUtils';
import type { TriggerAggregateResult } from './triggerAggregatorTypes';

type AggregateSlotKey = keyof Pick<
  TriggerAggregateResult,
  'hardBlockResult' | 'recoveryResult' | 'unlockResult' | 'confirmationResult' | 'noiseResult'
>;

const VALID_SOURCE_SLOTS = new Set<AggregateSlotKey>([
  'hardBlockResult',
  'recoveryResult',
  'unlockResult',
  'confirmationResult',
  'noiseResult',
]);

function isValidSourceSlot(value: string | undefined): value is AggregateSlotKey {
  return value !== undefined && VALID_SOURCE_SLOTS.has(value as AggregateSlotKey);
}

/**
 * Collects ELIGIBLE decision candidates from decision engine output.
 */
export function collectEligibleCandidates(
  decisionResult: DecisionEngineResult,
): readonly DecisionCandidate[] {
  return decisionResult.decisionCandidates.filter(
    (candidate) => candidate.decisionStatus === DecisionCandidateStatus.ELIGIBLE,
  );
}

function toFinalDecision(candidate: DecisionCandidate): FinalDecision {
  const finalDecision: FinalDecision = {
    triggerKind: candidate.triggerKind,
    triggerId: candidate.triggerId,
    priority: candidate.priority,
  };

  if (candidate.sourceTriggerResult !== undefined) {
    finalDecision.sourceTriggerResult = candidate.sourceTriggerResult;
  }
  if (candidate.resolvedConflictId !== undefined) {
    finalDecision.resolvedConflictId = candidate.resolvedConflictId;
  }
  if (candidate.resolvedBy !== undefined) {
    finalDecision.resolvedBy = candidate.resolvedBy;
  }

  return finalDecision;
}

function hasUnresolvedCandidates(decisionResult: DecisionEngineResult): boolean {
  return decisionResult.decisionCandidates.some(
    (candidate) => candidate.decisionStatus === DecisionCandidateStatus.UNRESOLVED,
  );
}

function allCandidatesBlocked(decisionResult: DecisionEngineResult): boolean {
  const candidates = decisionResult.decisionCandidates;
  return (
    candidates.length > 0 &&
    candidates.every((candidate) => candidate.decisionStatus === DecisionCandidateStatus.BLOCKED)
  );
}

function validateFinalDecisionMetadata(
  finalDecision: FinalDecision,
  decisionCandidates: readonly DecisionCandidate[],
  errors: string[],
): void {
  const matchingCandidate = decisionCandidates.find(
    (candidate) => candidate.triggerId === finalDecision.triggerId,
  );
  if (!matchingCandidate) {
    errors.push('finalDecision must belong to decisionCandidates');
    return;
  }

  if (matchingCandidate.triggerKind !== finalDecision.triggerKind) {
    errors.push('finalDecision.triggerKind must match decisionCandidates');
  }

  const catalog = TRIGGER_TYPE_CATALOG[finalDecision.triggerKind];
  if (finalDecision.triggerId !== catalog.triggerId) {
    errors.push(`triggerId mismatch for ${finalDecision.triggerKind}`);
  }
  if (finalDecision.priority !== catalog.priority) {
    errors.push(`priority mismatch for ${finalDecision.triggerKind}`);
  }

  if (
    finalDecision.sourceTriggerResult !== undefined &&
    !isValidSourceSlot(finalDecision.sourceTriggerResult)
  ) {
    errors.push(`invalid sourceTriggerResult: ${finalDecision.sourceTriggerResult}`);
  }
}

function validateHaltedConsistency(
  halted: boolean,
  decisionCount: number,
  finalDecision: FinalDecision | null,
  errors: string[],
): void {
  if (decisionCount !== 0 && decisionCount !== 1) {
    errors.push('decisionCount must be 0 or 1');
  }

  if (decisionCount === 0 && finalDecision !== null) {
    errors.push('decisionCount 0 requires finalDecision null');
  }

  if (decisionCount === 1 && finalDecision === null) {
    errors.push('decisionCount 1 requires finalDecision');
  }

  if (halted && decisionCount === 1) {
    errors.push('halted result cannot have decisionCount 1');
  }

  if (halted && finalDecision !== null) {
    errors.push('halted result cannot have finalDecision');
  }
}

function createMissingDecisionFallback(): DecisionEngineResult {
  return {
    conflictResult: {
      priorityResult: {
        aggregateResult: {
          triggerCount: 0,
          halted: true,
          message: 'Missing decisionResult',
          context: {},
        },
        priorityGroups: [],
        highestPriority: null,
        halted: true,
        message: 'Missing decisionResult',
        context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
      },
      conflictGroups: [],
      conflictCount: 0,
      resolvedConflicts: [],
      resolvedCount: 0,
      unresolvedCount: 0,
      halted: true,
      message: 'Missing decisionResult',
      context: {
        priorityResult: {
          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
          priorityGroups: [],
          highestPriority: null,
          halted: true,
          message: '',
          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
        },
      },
    },
    decisionCandidates: [],
    candidateCount: 0,
    halted: true,
    message: 'Missing decisionResult',
    context: {
      conflictResult: {
        priorityResult: {
          aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
          priorityGroups: [],
          highestPriority: null,
          halted: true,
          message: '',
          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
        },
        conflictGroups: [],
        conflictCount: 0,
        resolvedConflicts: [],
        resolvedCount: 0,
        unresolvedCount: 0,
        halted: true,
        message: '',
        context: {
          priorityResult: {
            aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
            priorityGroups: [],
            highestPriority: null,
            halted: true,
            message: '',
            context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
          },
        },
      },
    },
  };
}

/**
 * Validates final decision context — decision result integrity and upstream rules.
 */
export function validateFinalDecisionContext(
  context: FinalDecisionContext,
): FinalDecisionContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.decisionResult === undefined) {
    errors.push('Missing decisionResult');
    return { valid: false, errors };
  }

  const decisionResult = context.decisionResult;

  if (!isRecord(decisionResult)) {
    errors.push('decisionResult must be an object');
    return { valid: false, errors };
  }

  if (typeof decisionResult.halted !== 'boolean') {
    errors.push('decisionResult.halted must be boolean');
  } else if (decisionResult.halted) {
    errors.push('decisionResult is halted');
  }

  if (!isRecord(decisionResult.context)) {
    errors.push('decisionResult.context must be an object');
  } else {
    const decisionValidation = validateDecisionEngineContext(decisionResult.context);
    if (!decisionValidation.valid) {
      for (const err of decisionValidation.errors) {
        errors.push(`decisionResult.context: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates final decision result — decisionCount, catalog metadata, halted consistency.
 */
export function validateFinalDecisionResult(
  result: FinalDecisionResult,
): FinalDecisionResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  validateHaltedConsistency(result.halted, result.decisionCount, result.finalDecision, errors);

  if (result.finalDecision !== null) {
    validateFinalDecisionMetadata(
      result.finalDecision,
      result.decisionResult.decisionCandidates,
      errors,
    );
  }

  const eligible = collectEligibleCandidates(result.decisionResult);
  if (result.decisionCount === 1 && eligible.length !== 1) {
    errors.push('decisionCount 1 requires exactly one ELIGIBLE candidate');
  }

  if (
    result.decisionCount === 0 &&
    result.finalDecision === null &&
    eligible.length > 1 &&
    !result.halted
  ) {
    errors.push('multiple ELIGIBLE candidates require halted result');
  }

  return { valid: errors.length === 0, errors };
}

interface SelectionOutcome {
  finalDecision: FinalDecision | null;
  decisionCount: number;
  halted: boolean;
  message: string;
}

function selectFinalDecision(decisionResult: DecisionEngineResult): SelectionOutcome {
  const candidates = decisionResult.decisionCandidates;
  const eligible = collectEligibleCandidates(decisionResult);

  if (hasUnresolvedCandidates(decisionResult)) {
    return {
      finalDecision: null,
      decisionCount: 0,
      halted: true,
      message: 'Unresolved decision candidates.',
    };
  }

  if (eligible.length > 1) {
    return {
      finalDecision: null,
      decisionCount: 0,
      halted: true,
      message: 'Multiple eligible candidates.',
    };
  }

  if (eligible.length === 1) {
    return {
      finalDecision: toFinalDecision(eligible[0]),
      decisionCount: 1,
      halted: false,
      message: 'Final decision selected.',
    };
  }

  if (candidates.length === 0) {
    return {
      finalDecision: null,
      decisionCount: 0,
      halted: false,
      message: 'No decision candidate.',
    };
  }

  if (allCandidatesBlocked(decisionResult)) {
    return {
      finalDecision: null,
      decisionCount: 0,
      halted: false,
      message: 'All candidates blocked.',
    };
  }

  return {
    finalDecision: null,
    decisionCount: 0,
    halted: false,
    message: 'No decision candidate.',
  };
}

function buildFinalDecisionMessage(
  halted: boolean,
  errors: readonly string[],
  selectionMessage: string,
): string {
  if (halted && errors.length > 0) {
    return errors.join('; ');
  }
  return selectionMessage;
}

/**
 * Builds final decision result — validate, collect ELIGIBLE, select, validate output.
 *
 * **No EntryState, Transition, or State Machine.**
 */
export function buildFinalDecisionResult(context: FinalDecisionContext): FinalDecisionResult {
  const validation = validateFinalDecisionContext(context);
  const decisionResult = context.decisionResult ?? createMissingDecisionFallback();
  const halted = !validation.valid;

  if (halted) {
    return {
      decisionResult,
      finalDecision: null,
      decisionCount: 0,
      halted: true,
      message: buildFinalDecisionMessage(true, validation.errors, ''),
      context,
    };
  }

  const selection = selectFinalDecision(decisionResult);

  return {
    decisionResult,
    finalDecision: selection.finalDecision,
    decisionCount: selection.decisionCount,
    halted: selection.halted,
    message: selection.message,
    context,
  };
}

/** Namespace for discoverability. */
export const FinalDecisionEngine = {
  buildFinalDecisionResult,
  collectEligibleCandidates,
  validateFinalDecisionContext,
  validateFinalDecisionResult,
} as const;
