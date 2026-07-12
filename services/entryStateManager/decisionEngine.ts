/**
 * Decision Engine — scaffold (Task 02.5.5).
 *
 * **Collects** {@link DecisionCandidate} placeholders from {@link ConflictResolverResult}.
 * **Does NOT** choose EntryState, transition, resolve conflicts, or mutate upstream modules.
 *
 * @module entryStateManager/decisionEngine
 */

import { EntryTriggerKind } from './evaluationTypes';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { validateConflictResolverContext } from './conflictResolver';
import { ConflictResolutionStatus } from './conflictResolverTypes';
import type { ConflictResolverResult, ResolvedConflict } from './conflictResolverTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';
import type { TriggerAggregateResult } from './triggerAggregatorTypes';
import type {
  DecisionCandidate,
  DecisionEngineContext,
  DecisionEngineContextValidationResult,
  DecisionEngineResult,
  DecisionEngineResultValidationResult,
} from './decisionEngineTypes';
import { DecisionCandidateStatus } from './decisionEngineTypes';
import { isRecord } from './pipelineValidationUtils';

type AggregateSlotKey = keyof Pick<
  TriggerAggregateResult,
  'hardBlockResult' | 'recoveryResult' | 'unlockResult' | 'confirmationResult' | 'noiseResult'
>;

interface AggregateSlotSpec {
  key: AggregateSlotKey;
  kind: EntryTriggerKind;
}

const AGGREGATE_SLOTS: readonly AggregateSlotSpec[] = [
  { key: 'hardBlockResult', kind: EntryTriggerKind.HardBlock },
  { key: 'recoveryResult', kind: EntryTriggerKind.Recovery },
  { key: 'unlockResult', kind: EntryTriggerKind.Unlock },
  { key: 'confirmationResult', kind: EntryTriggerKind.Confirmation },
  { key: 'noiseResult', kind: EntryTriggerKind.Noise },
];

function isMemberOfConflictGroup(
  conflictResult: ConflictResolverResult,
  groupId: string,
  triggerId: TriggerTypeId,
): boolean {
  const group = conflictResult.conflictGroups.find((row) => row.groupId === groupId);
  return group?.members.some((member) => member.triggerId === triggerId) ?? false;
}

function findPrimaryResolvedConflict(
  conflictResult: ConflictResolverResult,
  triggerId: TriggerTypeId,
): ResolvedConflict | undefined {
  for (const resolved of conflictResult.resolvedConflicts) {
    if (resolved.winningTrigger?.triggerId === triggerId) {
      return resolved;
    }
    if (resolved.suppressedTriggers.some((member) => member.triggerId === triggerId)) {
      return resolved;
    }
    if (
      resolved.status === ConflictResolutionStatus.UNRESOLVED &&
      isMemberOfConflictGroup(conflictResult, resolved.groupId, triggerId)
    ) {
      return resolved;
    }
  }
  return undefined;
}

function deriveDecisionStatus(
  conflictResult: ConflictResolverResult,
  resolved: ResolvedConflict | undefined,
  triggerId: TriggerTypeId,
): DecisionCandidateStatus {
  if (!resolved) {
    return DecisionCandidateStatus.ELIGIBLE;
  }

  if (resolved.status === ConflictResolutionStatus.RESOLVED) {
    if (resolved.winningTrigger?.triggerId === triggerId) {
      return DecisionCandidateStatus.ELIGIBLE;
    }
    if (resolved.suppressedTriggers.some((member) => member.triggerId === triggerId)) {
      return DecisionCandidateStatus.BLOCKED;
    }
  }

  if (
    resolved.status === ConflictResolutionStatus.UNRESOLVED &&
    isMemberOfConflictGroup(conflictResult, resolved.groupId, triggerId)
  ) {
    return DecisionCandidateStatus.UNRESOLVED;
  }

  return DecisionCandidateStatus.ELIGIBLE;
}

/**
 * Collects decision candidates from conflict resolver output — **placeholder only**.
 */
export function collectDecisionCandidates(
  conflictResult: ConflictResolverResult,
): readonly DecisionCandidate[] {
  const aggregate = conflictResult.priorityResult.aggregateResult;
  const candidates: DecisionCandidate[] = [];

  for (const spec of AGGREGATE_SLOTS) {
    const detectorResult = aggregate[spec.key];
    if (detectorResult === undefined) {
      continue;
    }

    const resolved = findPrimaryResolvedConflict(conflictResult, detectorResult.triggerId);
    const decisionStatus = deriveDecisionStatus(
      conflictResult,
      resolved,
      detectorResult.triggerId,
    );

    const candidate: DecisionCandidate = {
      triggerKind: spec.kind,
      triggerId: detectorResult.triggerId,
      priority: detectorResult.priority,
      sourceTriggerResult: spec.key,
      decisionStatus,
    };

    if (resolved) {
      candidate.resolvedConflictId = resolved.groupId;
      if (resolved.resolvedBy != null) {
        candidate.resolvedBy = resolved.resolvedBy;
      }
    }

    candidates.push(candidate);
  }

  return candidates;
}

function validateDecisionCandidates(
  conflictResult: ConflictResolverResult,
  candidates: readonly DecisionCandidate[],
  errors: string[],
): void {
  if (candidates.length !== new Set(candidates.map((c) => c.triggerId)).size) {
    errors.push('decisionCandidates must not contain duplicate triggerId');
  }

  const knownGroupIds = new Set(conflictResult.resolvedConflicts.map((row) => row.groupId));
  for (const candidate of candidates) {
    if (
      candidate.resolvedConflictId !== undefined &&
      !knownGroupIds.has(candidate.resolvedConflictId)
    ) {
      errors.push(`resolvedConflictId not found: ${candidate.resolvedConflictId}`);
    }
    const catalog = TRIGGER_TYPE_CATALOG[candidate.triggerKind];
    if (candidate.triggerId !== catalog.triggerId) {
      errors.push(`triggerId mismatch for ${candidate.triggerKind}`);
    }
    if (candidate.priority !== catalog.priority) {
      errors.push(`priority mismatch for ${candidate.triggerKind}`);
    }
  }
}

function buildDecisionMessage(
  halted: boolean,
  candidateCount: number,
  errors: readonly string[],
): string {
  if (halted) {
    return errors.join('; ');
  }
  if (candidateCount === 0) {
    return 'No decision candidates — empty conflict result';
  }
  return `Collected ${candidateCount} decision candidate(s) — scaffold only (Task 02.5.5)`;
}

function createMissingConflictFallback(): ConflictResolverResult {
  return {
    priorityResult: {
      aggregateResult: {
        triggerCount: 0,
        halted: true,
        message: 'Missing conflictResult',
        context: {},
      },
      priorityGroups: [],
      highestPriority: null,
      halted: true,
      message: 'Missing conflictResult',
      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
    },
    conflictGroups: [],
    conflictCount: 0,
    resolvedConflicts: [],
    resolvedCount: 0,
    unresolvedCount: 0,
    halted: true,
    message: 'Missing conflictResult',
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
  };
}

/**
 * Validates decision engine context — conflict result integrity and candidate rules.
 */
export function validateDecisionEngineContext(
  context: DecisionEngineContext,
): DecisionEngineContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.conflictResult === undefined) {
    errors.push('Missing conflictResult');
    return { valid: false, errors };
  }

  const conflictResult = context.conflictResult;

  if (!isRecord(conflictResult)) {
    errors.push('conflictResult must be an object');
    return { valid: false, errors };
  }

  if (typeof conflictResult.halted !== 'boolean') {
    errors.push('conflictResult.halted must be boolean');
  } else if (conflictResult.halted) {
    errors.push('conflictResult is halted');
  }

  if (!isRecord(conflictResult.context)) {
    errors.push('conflictResult.context must be an object');
  } else {
    const conflictValidation = validateConflictResolverContext(conflictResult.context);
    if (!conflictValidation.valid) {
      for (const err of conflictValidation.errors) {
        errors.push(`conflictResult.context: ${err}`);
      }
    }
  }

  if (errors.length === 0 && !conflictResult.halted) {
    const candidates = collectDecisionCandidates(conflictResult);
    validateDecisionCandidates(conflictResult, candidates, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates decision engine result — candidateCount and candidate integrity.
 */
export function validateDecisionEngineResult(
  result: DecisionEngineResult,
): DecisionEngineResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!Array.isArray(result.decisionCandidates)) {
    errors.push('decisionCandidates must be an array');
    return { valid: false, errors };
  }

  if (result.candidateCount !== result.decisionCandidates.length) {
    errors.push('candidateCount must match decisionCandidates.length');
  }

  if (!result.halted) {
    validateDecisionCandidates(result.conflictResult, result.decisionCandidates, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds decision engine scaffold result — validate then collect candidates.
 *
 * **No EntryState, Transition, or final decision.**
 */
export function buildDecisionEngineResult(context: DecisionEngineContext): DecisionEngineResult {
  const validation = validateDecisionEngineContext(context);
  const conflictResult = context.conflictResult ?? createMissingConflictFallback();
  const decisionCandidates = validation.valid ? collectDecisionCandidates(conflictResult) : [];
  const candidateCount = decisionCandidates.length;
  const halted = !validation.valid;

  return {
    conflictResult,
    decisionCandidates,
    candidateCount,
    halted,
    message: buildDecisionMessage(halted, candidateCount, validation.errors),
    context,
  };
}

/** Namespace for discoverability. */
export const DecisionEngine = {
  buildDecisionEngineResult,
  collectDecisionCandidates,
  validateDecisionEngineContext,
  validateDecisionEngineResult,
} as const;
