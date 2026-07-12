/**
 * Unlock Detection Engine (Task 02.4.10 / 02.4.11).
 *
 * **Detects unlock triggers by READING existing unlock hints only.**
 *
 * **MUST NOT:**
 * - Decide EntryState (READY/WATCH/LOCKED/BLOCKED)
 * - Choose transitions or run Decision Engine
 * - Create new unlock rules or edit RuleBook
 *
 * UNLOCK_READY_FOR_WATCH evidence does **not** transition to WATCH — State Machine (02.5.x).
 *
 * @module entryStateManager/unlockDetectionEngine
 */

import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';
import { TRANSITION_SOURCE_MODULES, TransitionAuditLabel } from './transitionMetadata';
import {
  buildUnlockEvidenceFromSignalSnapshot,
  dedupeUnlockEvidence,
} from './unlockEvidenceBuilder';
import { isValidUnlockOriginRuleId } from './unlockOriginRuleId';
import { adaptUnlockSignalsFromContext } from './unlockSignalAdapter';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type {
  UnlockContextValidationResult,
  UnlockDetectionContext,
  UnlockDetectionResult,
  UnlockDetectionValidationResult,
  UnlockEvidence,
} from './unlockDetectionTypes';

const UNLOCK_CATALOG = TRIGGER_TYPE_CATALOG[EntryTriggerKind.Unlock];

/**
 * Validates context structure — **no unlock computation**.
 */
export function validateUnlockDetectionContext(
  context: UnlockDetectionContext,
): UnlockContextValidationResult {
  const errors: string[] = [];

  if (!context.normalizedRuleOutput) {
    errors.push('Missing normalizedRuleOutput');
  } else {
    validateNormalizedRuleOutput(context.normalizedRuleOutput, errors);
  }

  if (!context.currentEntryState) {
    errors.push('Missing currentEntryState');
  }

  if (!context.marketSnapshot?.symbol?.trim()) {
    errors.push('Missing marketSnapshot.symbol');
  }

  if (!context.signalSnapshot) {
    errors.push('Missing signalSnapshot');
  }

  if (!Array.isArray(context.candidateTransitions)) {
    errors.push('candidateTransitions must be an array');
  }

  if (UNLOCK_CATALOG.priority !== 70) {
    errors.push('Catalog Unlock priority must be 70');
  }

  if (UNLOCK_CATALOG.auditLabel !== TransitionAuditLabel.ENTRY_UNLOCK) {
    errors.push('Catalog Unlock auditLabel must be ENTRY_UNLOCK');
  }

  if (!TRANSITION_SOURCE_MODULES.includes(UNLOCK_CATALOG.sourceModule)) {
    errors.push(`Invalid catalog sourceModule: ${UNLOCK_CATALOG.sourceModule}`);
  }

  if (!UNLOCK_CATALOG.ruleReference?.trim()) {
    errors.push('Missing catalog ruleReference');
  }

  return { valid: errors.length === 0, errors };
}

function validateNormalizedRuleOutput(output: NormalizedRuleOutput, errors: string[]): void {
  if (!Array.isArray(output.hardBlocks)) {
    errors.push('normalizedRuleOutput.hardBlocks must be an array');
  }
  if (!Array.isArray(output.groupBlocks)) {
    errors.push('normalizedRuleOutput.groupBlocks must be an array');
  }
  if (!Array.isArray(output.blockReasons)) {
    errors.push('normalizedRuleOutput.blockReasons must be an array');
  }
  if (typeof output.adxGateBlocked !== 'boolean') {
    errors.push('normalizedRuleOutput.adxGateBlocked must be boolean');
  }
  if (typeof output.tradePlanValid !== 'boolean') {
    errors.push('normalizedRuleOutput.tradePlanValid must be boolean');
  }
  if (typeof output.decision !== 'string' || !output.decision.trim()) {
    errors.push('normalizedRuleOutput.decision must be non-empty string');
  }
}

/**
 * Validates detection result metadata and evidence integrity.
 */
export function validateUnlockDetectionResult(
  result: UnlockDetectionResult,
): UnlockDetectionValidationResult {
  const errors: string[] = [];

  if (result.priority !== 70) {
    errors.push('priority must be 70');
  }
  if (result.auditLabel !== TransitionAuditLabel.ENTRY_UNLOCK) {
    errors.push('auditLabel must be ENTRY_UNLOCK');
  }
  if (!TRANSITION_SOURCE_MODULES.includes(result.sourceModule)) {
    errors.push(`Invalid sourceModule: ${result.sourceModule}`);
  }
  if (result.evidenceCount !== result.evidence.length) {
    errors.push('evidenceCount must match evidence.length');
  }
  if (result.detected !== result.evidence.length > 0) {
    errors.push('detected must equal (evidence.length > 0)');
  }

  const deduped = dedupeUnlockEvidence(result.evidence);
  if (deduped.length !== result.evidence.length) {
    errors.push('Duplicate evidence rows detected');
  }

  for (const row of result.evidence) {
    if (!row.rawValue?.trim()) {
      errors.push('Evidence rawValue must be non-empty');
    }
    if (!isValidUnlockOriginRuleId(row.originRuleId)) {
      errors.push(`Invalid originRuleId: ${String(row.originRuleId)}`);
    }
    if (!TRANSITION_SOURCE_MODULES.includes(row.sourceModule)) {
      errors.push(`Invalid evidence sourceModule: ${row.sourceModule}`);
    }
  }

  const expectedOriginIds = [
    ...new Set(
      result.evidence
        .map((e) => e.originRuleId)
        .filter((id): id is string => id != null && id !== ''),
    ),
  ];
  if (result.originRuleIds.length !== expectedOriginIds.length) {
    errors.push('originRuleIds length mismatch');
  }

  return { valid: errors.length === 0, errors };
}

function collectOriginRuleIds(evidence: readonly UnlockEvidence[]): string[] {
  const ids = new Set<string>();
  for (const row of evidence) {
    if (row.originRuleId != null && row.originRuleId !== '') {
      ids.add(row.originRuleId);
    }
  }
  return [...ids];
}

function buildDetectionMessage(detected: boolean, evidenceCount: number): string {
  if (!detected) {
    return 'No Unlock evidence — detected=false';
  }
  return `Unlock passthrough: ${evidenceCount} evidence row(s) from app hints`;
}

/**
 * Unlock detection — **passthrough** from {@link UnlockSignalSnapshot} hints.
 *
 * `detected = true` iff at least one valid evidence row exists after dedupe.
 * Does **not** read `decision` or transition state.
 */
export function detectUnlock(context: UnlockDetectionContext): UnlockDetectionResult {
  const validation = validateUnlockDetectionContext(context);

  const base: Omit<
    UnlockDetectionResult,
    | 'detected'
    | 'evidence'
    | 'originRuleIds'
    | 'evidenceCount'
    | 'detectionMessage'
    | 'halted'
  > = {
    triggerId: UNLOCK_CATALOG.triggerId,
    priority: UNLOCK_CATALOG.priority,
    sourceModule: UNLOCK_CATALOG.sourceModule,
    auditLabel: UNLOCK_CATALOG.auditLabel,
    ruleReference: UNLOCK_CATALOG.ruleReference,
    context,
  };

  if (!validation.valid) {
    return {
      ...base,
      detected: false,
      evidence: [],
      originRuleIds: [],
      evidenceCount: 0,
      detectionMessage: validation.errors.join('; '),
      halted: true,
    };
  }

  const snapshot = adaptUnlockSignalsFromContext({
    normalizedRuleOutput: context.normalizedRuleOutput,
    signalSnapshot: context.signalSnapshot,
    marketSnapshot: context.marketSnapshot,
    unlockSignalSnapshot: context.unlockSignalSnapshot,
  });

  const evidence = buildUnlockEvidenceFromSignalSnapshot(
    snapshot,
    context.marketSnapshot.timestamp,
  );
  const detected = evidence.length > 0;
  const evidenceCount = evidence.length;

  return {
    ...base,
    detected,
    evidence,
    originRuleIds: collectOriginRuleIds(evidence),
    evidenceCount,
    detectionMessage: buildDetectionMessage(detected, evidenceCount),
    halted: false,
  };
}

/** Namespace for discoverability. */
export const UnlockDetectionEngine = {
  detectUnlock,
  validateUnlockDetectionContext,
  validateUnlockDetectionResult,
} as const;
