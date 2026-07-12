/**
 * Recovery Detection Engine (Task 02.4.8 / 02.4.9).
 *
 * **Detects recovery triggers by READING existing recovery hints only.**
 *
 * **MUST NOT:**
 * - Decide EntryState (READY/WATCH/LOCKED/BLOCKED)
 * - Choose transitions or run Decision Engine
 * - Create new recovery rules or edit RuleBook
 *
 * @module entryStateManager/recoveryDetectionEngine
 */

import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';
import { TRANSITION_SOURCE_MODULES, TransitionAuditLabel } from './transitionMetadata';
import {
  buildRecoveryEvidenceFromSignalSnapshot,
  dedupeRecoveryEvidence,
} from './recoveryEvidenceBuilder';
import { isValidRecoveryOriginRuleId } from './recoveryOriginRuleId';
import { adaptRecoverySignalsFromContext } from './recoverySignalAdapter';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type {
  RecoveryContextValidationResult,
  RecoveryDetectionContext,
  RecoveryDetectionResult,
  RecoveryDetectionValidationResult,
  RecoveryEvidence,
} from './recoveryDetectionTypes';

const RECOVERY_CATALOG = TRIGGER_TYPE_CATALOG[EntryTriggerKind.Recovery];

/**
 * Validates context structure — **no recovery computation**.
 */
export function validateRecoveryDetectionContext(
  context: RecoveryDetectionContext,
): RecoveryContextValidationResult {
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

  if (RECOVERY_CATALOG.priority !== 70) {
    errors.push('Catalog Recovery priority must be 70');
  }

  if (RECOVERY_CATALOG.auditLabel !== TransitionAuditLabel.ENTRY_RECOVERY) {
    errors.push('Catalog Recovery auditLabel must be ENTRY_RECOVERY');
  }

  if (!TRANSITION_SOURCE_MODULES.includes(RECOVERY_CATALOG.sourceModule)) {
    errors.push(`Invalid catalog sourceModule: ${RECOVERY_CATALOG.sourceModule}`);
  }

  if (!RECOVERY_CATALOG.ruleReference?.trim()) {
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
export function validateRecoveryDetectionResult(
  result: RecoveryDetectionResult,
): RecoveryDetectionValidationResult {
  const errors: string[] = [];

  if (result.priority !== 70) {
    errors.push('priority must be 70');
  }
  if (result.auditLabel !== TransitionAuditLabel.ENTRY_RECOVERY) {
    errors.push('auditLabel must be ENTRY_RECOVERY');
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

  const deduped = dedupeRecoveryEvidence(result.evidence);
  if (deduped.length !== result.evidence.length) {
    errors.push('Duplicate evidence rows detected');
  }

  for (const row of result.evidence) {
    if (!row.rawValue?.trim()) {
      errors.push('Evidence rawValue must be non-empty');
    }
    if (!isValidRecoveryOriginRuleId(row.originRuleId)) {
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

function collectOriginRuleIds(evidence: readonly RecoveryEvidence[]): string[] {
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
    return 'No Recovery evidence — detected=false';
  }
  return `Recovery passthrough: ${evidenceCount} evidence row(s) from app hints`;
}

/**
 * Recovery detection — **passthrough** from {@link RecoverySignalSnapshot} hints.
 *
 * `detected = true` iff at least one valid evidence row exists after dedupe.
 * Does **not** read `decision` for detection.
 */
export function detectRecovery(context: RecoveryDetectionContext): RecoveryDetectionResult {
  const validation = validateRecoveryDetectionContext(context);

  const base: Omit<
    RecoveryDetectionResult,
    | 'detected'
    | 'evidence'
    | 'originRuleIds'
    | 'evidenceCount'
    | 'detectionMessage'
    | 'halted'
  > = {
    triggerId: RECOVERY_CATALOG.triggerId,
    priority: RECOVERY_CATALOG.priority,
    sourceModule: RECOVERY_CATALOG.sourceModule,
    auditLabel: RECOVERY_CATALOG.auditLabel,
    ruleReference: RECOVERY_CATALOG.ruleReference,
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

  const snapshot = adaptRecoverySignalsFromContext({
    normalizedRuleOutput: context.normalizedRuleOutput,
    signalSnapshot: context.signalSnapshot,
    marketSnapshot: context.marketSnapshot,
    recoverySignalSnapshot: context.recoverySignalSnapshot,
  });

  const evidence = buildRecoveryEvidenceFromSignalSnapshot(
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
export const RecoveryDetectionEngine = {
  detectRecovery,
  validateRecoveryDetectionContext,
  validateRecoveryDetectionResult,
} as const;
