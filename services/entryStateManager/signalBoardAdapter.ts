/**
 * Signal Board Scan adapter — mapping boundary (Task 02.7.1).
 *
 * **Purpose:** Map SignalBoardScan snapshot → ESM pipeline context inputs.
 * **Does NOT** evaluate triggers, resolve priority/conflict, decide, or transition.
 *
 * @module entryStateManager/signalBoardAdapter
 */

import type { ConflictResolverContext, ConflictResolverResult } from './conflictResolverTypes';
import type { DecisionEngineContext } from './decisionEngineTypes';
import type { EntryStateMarketSnapshot } from './evaluationTypes';
import { isRecord } from './pipelineValidationUtils';
import type {
  PriorityResolverContext,
  PriorityResolverResult,
} from './priorityResolverTypes';
import type { TriggerAggregateResult, TriggerAggregatorContext } from './triggerAggregatorTypes';
import type {
  SignalBoardAdapterContext,
  SignalBoardAdapterContextValidationResult,
  SignalBoardAdapterResult,
  SignalBoardAdapterResultValidationResult,
  SignalBoardScanSnapshot,
  SignalBoardTriggerSnapshot,
} from './signalBoardAdapterTypes';

const AGGREGATE_SLOT_KEYS = [
  'hardBlockResult',
  'recoveryResult',
  'unlockResult',
  'confirmationResult',
  'noiseResult',
] as const satisfies readonly (keyof TriggerAggregatorContext)[];

function countPresentDetectorSlots(context: TriggerAggregatorContext): number {
  let count = 0;
  for (const key of AGGREGATE_SLOT_KEYS) {
    if (context[key] !== undefined) {
      count += 1;
    }
  }
  return count;
}

function copyTriggerSnapshot(triggerSnapshot: SignalBoardTriggerSnapshot): SignalBoardTriggerSnapshot {
  return {
    hardBlockResult: triggerSnapshot.hardBlockResult,
    recoveryResult: triggerSnapshot.recoveryResult,
    unlockResult: triggerSnapshot.unlockResult,
    confirmationResult: triggerSnapshot.confirmationResult,
    noiseResult: triggerSnapshot.noiseResult,
    aggregateResult: triggerSnapshot.aggregateResult,
    priorityResult: triggerSnapshot.priorityResult,
    conflictResult: triggerSnapshot.conflictResult,
  };
}

function mapAggregateContext(
  triggerSnapshot: SignalBoardTriggerSnapshot,
  scanId: string,
): TriggerAggregatorContext {
  const copied = copyTriggerSnapshot(triggerSnapshot);
  return {
    hardBlockResult: copied.hardBlockResult,
    recoveryResult: copied.recoveryResult,
    unlockResult: copied.unlockResult,
    confirmationResult: copied.confirmationResult,
    noiseResult: copied.noiseResult,
    scanId,
  };
}

/**
 * Structural shell for priority wiring — field copy from aggregate context only.
 * Integration replaces with `aggregateTriggers()` output before `resolvePriority()`.
 */
function mapAggregateResultShell(aggregateContext: TriggerAggregatorContext): TriggerAggregateResult {
  const triggerCount = countPresentDetectorSlots(aggregateContext);
  return {
    hardBlockResult: aggregateContext.hardBlockResult,
    recoveryResult: aggregateContext.recoveryResult,
    unlockResult: aggregateContext.unlockResult,
    confirmationResult: aggregateContext.confirmationResult,
    noiseResult: aggregateContext.noiseResult,
    triggerCount,
    halted: false,
    message: 'signal-board-adapter-mapped',
    context: aggregateContext,
  };
}

function mapPriorityResultShell(
  aggregateResult: TriggerAggregateResult,
  scanId: string,
): PriorityResolverResult {
  const priorityContext: PriorityResolverContext = {
    aggregateResult,
    scanId,
  };
  return {
    aggregateResult,
    priorityGroups: [],
    highestPriority: null,
    halted: false,
    message: 'signal-board-adapter-mapped',
    context: priorityContext,
  };
}

function mapConflictResultShell(
  priorityResult: PriorityResolverResult,
  scanId: string,
): ConflictResolverResult {
  const conflictContext: ConflictResolverContext = {
    priorityResult,
    scanId,
  };
  return {
    priorityResult,
    conflictGroups: [],
    conflictCount: 0,
    resolvedConflicts: [],
    resolvedCount: 0,
    unresolvedCount: 0,
    halted: false,
    message: 'signal-board-adapter-mapped',
    context: conflictContext,
  };
}

function validateMarketSnapshot(
  marketSnapshot: EntryStateMarketSnapshot,
  signalBoardScan: SignalBoardScanSnapshot,
  errors: string[],
): void {
  if (!isRecord(marketSnapshot)) {
    errors.push('marketSnapshot must be an object');
    return;
  }
  if (typeof marketSnapshot.symbol !== 'string' || !marketSnapshot.symbol.trim()) {
    errors.push('marketSnapshot.symbol must be a non-empty string');
  } else if (
    typeof signalBoardScan.symbol === 'string'
    && signalBoardScan.symbol.trim()
    && marketSnapshot.symbol !== signalBoardScan.symbol
  ) {
    errors.push('marketSnapshot.symbol must match signalBoardScan.symbol');
  }
  if (typeof marketSnapshot.markPrice !== 'number' || !Number.isFinite(marketSnapshot.markPrice)) {
    errors.push('marketSnapshot.markPrice must be a finite number');
  }
  if (typeof marketSnapshot.timestamp !== 'string' || !marketSnapshot.timestamp.trim()) {
    errors.push('marketSnapshot.timestamp must be a non-empty string');
  }
}

function validateSignalBoardScanSnapshot(snapshot: SignalBoardScanSnapshot, errors: string[]): void {
  if (!isRecord(snapshot)) {
    errors.push('signalBoardScan must be an object');
    return;
  }
  if (typeof snapshot.symbol !== 'string' || !snapshot.symbol.trim()) {
    errors.push('signalBoardScan.symbol must be a non-empty string');
  }
  if (snapshot.price !== null && (typeof snapshot.price !== 'number' || !Number.isFinite(snapshot.price))) {
    errors.push('signalBoardScan.price must be null or a finite number');
  }
  if (typeof snapshot.direction !== 'string' || !snapshot.direction.trim()) {
    errors.push('signalBoardScan.direction must be a non-empty string');
  }
  if (typeof snapshot.canEnter !== 'boolean') {
    errors.push('signalBoardScan.canEnter must be boolean');
  }
  if (typeof snapshot.hardBlocked !== 'boolean') {
    errors.push('signalBoardScan.hardBlocked must be boolean');
  }
}

function validateTriggerSnapshot(snapshot: SignalBoardTriggerSnapshot, errors: string[]): void {
  if (!isRecord(snapshot)) {
    errors.push('triggerSnapshot must be an object');
  }
}

function validateScanId(scanId: string | undefined, errors: string[], label = 'scanId'): void {
  if (typeof scanId !== 'string' || !scanId.trim()) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function validateTimestamp(timestamp: string | undefined, errors: string[]): void {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    errors.push('timestamp must be a non-empty string');
  }
}

/** Validates adapter input — required snapshots and metadata only. */
export function validateSignalBoardAdapterContext(
  context: SignalBoardAdapterContext,
): SignalBoardAdapterContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  validateScanId(context.scanId, errors);
  validateTimestamp(context.timestamp, errors);

  if (context.signalBoardScan === undefined) {
    errors.push('signalBoardScan is required');
  } else {
    validateSignalBoardScanSnapshot(context.signalBoardScan, errors);
  }

  if (context.marketSnapshot === undefined) {
    errors.push('marketSnapshot is required');
  } else if (context.signalBoardScan !== undefined) {
    validateMarketSnapshot(context.marketSnapshot, context.signalBoardScan, errors);
  }

  if (context.triggerSnapshot === undefined) {
    errors.push('triggerSnapshot is required');
  } else {
    validateTriggerSnapshot(context.triggerSnapshot, errors);
  }

  return { valid: errors.length === 0, errors };
}

function validateAggregateContext(
  aggregateContext: TriggerAggregatorContext,
  scanId: string,
  errors: string[],
): void {
  if (!isRecord(aggregateContext)) {
    errors.push('aggregateContext must be an object');
    return;
  }
  if (aggregateContext.scanId !== scanId) {
    errors.push('aggregateContext.scanId must match result scanId');
  }
}

function validatePriorityContext(
  priorityContext: PriorityResolverContext,
  scanId: string,
  errors: string[],
): void {
  if (!isRecord(priorityContext)) {
    errors.push('priorityContext must be an object');
    return;
  }
  if (priorityContext.scanId !== scanId) {
    errors.push('priorityContext.scanId must match result scanId');
  }
  if (!isRecord(priorityContext.aggregateResult)) {
    errors.push('priorityContext.aggregateResult must be an object');
  }
}

function validateConflictContext(
  conflictContext: ConflictResolverContext,
  scanId: string,
  errors: string[],
): void {
  if (!isRecord(conflictContext)) {
    errors.push('conflictContext must be an object');
    return;
  }
  if (conflictContext.scanId !== scanId) {
    errors.push('conflictContext.scanId must match result scanId');
  }
  if (!isRecord(conflictContext.priorityResult)) {
    errors.push('conflictContext.priorityResult must be an object');
  }
}

function validateDecisionContext(
  decisionContext: DecisionEngineContext,
  scanId: string,
  errors: string[],
): void {
  if (!isRecord(decisionContext)) {
    errors.push('decisionContext must be an object');
    return;
  }
  if (decisionContext.scanId !== scanId) {
    errors.push('decisionContext.scanId must match result scanId');
  }
  if (!isRecord(decisionContext.conflictResult)) {
    errors.push('decisionContext.conflictResult must be an object');
  }
}

/** Validates adapter output — mapped contexts and metadata only. */
export function validateSignalBoardAdapterResult(
  result: SignalBoardAdapterResult,
): SignalBoardAdapterResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  validateScanId(result.scanId, errors, 'result.scanId');
  validateTimestamp(result.timestamp, errors);

  validateAggregateContext(result.aggregateContext, result.scanId, errors);
  validatePriorityContext(result.priorityContext, result.scanId, errors);
  validateConflictContext(result.conflictContext, result.scanId, errors);
  validateDecisionContext(result.decisionContext, result.scanId, errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Maps SignalBoardScan snapshot → ESM pipeline contexts.
 *
 * **Field copy only** — does not call `aggregateTriggers`, `resolvePriority`, etc.
 */
export function buildSignalBoardAdapterResult(
  context: SignalBoardAdapterContext,
): SignalBoardAdapterResult {
  const validation = validateSignalBoardAdapterContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid SignalBoardAdapterContext: ${validation.errors.join('; ')}`,
    );
  }

  const scanId = context.scanId.trim();
  const timestamp = context.timestamp.trim();
  const triggerSnapshot = copyTriggerSnapshot(context.triggerSnapshot);

  const aggregateContext = mapAggregateContext(triggerSnapshot, scanId);

  const aggregateResult = triggerSnapshot.aggregateResult ?? mapAggregateResultShell(aggregateContext);

  const priorityContext: PriorityResolverContext = {
    aggregateResult,
    scanId,
  };

  const priorityResult = triggerSnapshot.priorityResult
    ?? mapPriorityResultShell(aggregateResult, scanId);

  const conflictContext: ConflictResolverContext = {
    priorityResult,
    scanId,
  };

  const conflictResult = triggerSnapshot.conflictResult
    ?? mapConflictResultShell(priorityResult, scanId);

  const decisionContext: DecisionEngineContext = {
    conflictResult,
    scanId,
  };

  return {
    aggregateContext,
    priorityContext,
    conflictContext,
    decisionContext,
    scanId,
    timestamp,
  };
}

/** Namespace for integration discoverability. */
export const SignalBoardAdapter = {
  buildSignalBoardAdapterResult,
  validateSignalBoardAdapterContext,
  validateSignalBoardAdapterResult,
} as const;
