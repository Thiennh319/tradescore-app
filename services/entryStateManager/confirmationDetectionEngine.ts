/**
 * Confirmation Detection Engine (Task 02.4.6 / 02.4.7).
 *
 * **Detects confirmation triggers by READING existing confirmation hints only.**
 *
 * **MUST NOT:**
 * - Decide EntryState (READY/WATCH/LOCKED/BLOCKED)
 * - Choose transitions or run Decision Engine
 * - Create new confirmation rules or edit RuleBook
 *
 * @module entryStateManager/confirmationDetectionEngine
 */

import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';
import { TRANSITION_SOURCE_MODULES, TransitionAuditLabel } from './transitionMetadata';
import {
  buildConfirmationEvidenceFromSignalSnapshot,
  dedupeConfirmationEvidence,
} from './confirmationEvidenceBuilder';
import { isValidConfirmationOriginRuleId } from './confirmationOriginRuleId';
import { adaptConfirmationSignalsFromContext } from './confirmationSignalAdapter';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type {
  ConfirmationContextValidationResult,
  ConfirmationDetectionContext,
  ConfirmationDetectionResult,
  ConfirmationDetectionValidationResult,
  ConfirmationEvidence,
} from './confirmationDetectionTypes';

const CONFIRMATION_CATALOG = TRIGGER_TYPE_CATALOG[EntryTriggerKind.Confirmation];

/**
 * Validates context structure — **no confirmation computation**.
 */
export function validateConfirmationDetectionContext(
  context: ConfirmationDetectionContext,
): ConfirmationContextValidationResult {
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

  if (CONFIRMATION_CATALOG.priority !== 60) {
    errors.push('Catalog Confirmation priority must be 60');
  }

  if (CONFIRMATION_CATALOG.auditLabel !== TransitionAuditLabel.ENTRY_CONFIRM) {
    errors.push('Catalog Confirmation auditLabel must be ENTRY_CONFIRM');
  }

  if (!TRANSITION_SOURCE_MODULES.includes(CONFIRMATION_CATALOG.sourceModule)) {
    errors.push(`Invalid catalog sourceModule: ${CONFIRMATION_CATALOG.sourceModule}`);
  }

  if (!CONFIRMATION_CATALOG.ruleReference?.trim()) {
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
export function validateConfirmationDetectionResult(
  result: ConfirmationDetectionResult,
): ConfirmationDetectionValidationResult {
  const errors: string[] = [];

  if (result.priority !== 60) {
    errors.push('priority must be 60');
  }
  if (result.auditLabel !== TransitionAuditLabel.ENTRY_CONFIRM) {
    errors.push('auditLabel must be ENTRY_CONFIRM');
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

  const deduped = dedupeConfirmationEvidence(result.evidence);
  if (deduped.length !== result.evidence.length) {
    errors.push('Duplicate evidence rows detected');
  }

  for (const row of result.evidence) {
    if (!row.rawValue?.trim()) {
      errors.push('Evidence rawValue must be non-empty');
    }
    if (!isValidConfirmationOriginRuleId(row.originRuleId)) {
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

function collectOriginRuleIds(evidence: readonly ConfirmationEvidence[]): string[] {
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
    return 'No Confirmation evidence — detected=false';
  }
  return `Confirmation passthrough: ${evidenceCount} evidence row(s) from app hints`;
}

/**
 * Confirmation detection — **passthrough** from {@link ConfirmationSignalSnapshot} hints.
 *
 * `detected = true` iff at least one valid evidence row exists after dedupe.
 * Does **not** read `decision` for detection.
 */
export function detectConfirmation(
  context: ConfirmationDetectionContext,
): ConfirmationDetectionResult {
  const validation = validateConfirmationDetectionContext(context);

  const base: Omit<
    ConfirmationDetectionResult,
    | 'detected'
    | 'evidence'
    | 'originRuleIds'
    | 'evidenceCount'
    | 'detectionMessage'
    | 'halted'
  > = {
    triggerId: CONFIRMATION_CATALOG.triggerId,
    priority: CONFIRMATION_CATALOG.priority,
    sourceModule: CONFIRMATION_CATALOG.sourceModule,
    auditLabel: CONFIRMATION_CATALOG.auditLabel,
    ruleReference: CONFIRMATION_CATALOG.ruleReference,
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

  const snapshot = adaptConfirmationSignalsFromContext({
    normalizedRuleOutput: context.normalizedRuleOutput,
    signalSnapshot: context.signalSnapshot,
    marketSnapshot: context.marketSnapshot,
    confirmationSignalSnapshot: context.confirmationSignalSnapshot,
  });

  const evidence = buildConfirmationEvidenceFromSignalSnapshot(
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
export const ConfirmationDetectionEngine = {
  detectConfirmation,
  validateConfirmationDetectionContext,
  validateConfirmationDetectionResult,
} as const;
