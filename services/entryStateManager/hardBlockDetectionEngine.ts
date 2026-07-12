/**
 * HardBlock Detection Engine (Task 02.4.2 / 02.4.3).
 *
 * **Detects HardBlock triggers by READING existing Rule Engine output only.**
 *
 * **MUST NOT:**
 * - Re-run scorerV4, adxGate, or trade plan logic
 * - Choose transitions or change EntryState
 * - Write Store, Journal, or production paths
 *
 * @module entryStateManager/hardBlockDetectionEngine
 */

import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';
import { TRANSITION_SOURCE_MODULES, TransitionAuditLabel } from './transitionMetadata';
import { buildHardBlockEvidenceFromRuleOutput, dedupeHardBlockEvidence } from './hardBlockEvidenceBuilder';
import { isValidHardBlockOriginRuleId } from './hardBlockOriginRuleId';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import type {
  HardBlockContextValidationResult,
  HardBlockDetectionContext,
  HardBlockDetectionResult,
  HardBlockDetectionValidationResult,
  HardBlockEvidence,
} from './hardBlockDetectionTypes';

const HARDBLOCK_CATALOG = TRIGGER_TYPE_CATALOG[EntryTriggerKind.HardBlock];

/**
 * Validates context structure — **no rule evaluation**.
 */
export function validateHardBlockDetectionContext(
  context: HardBlockDetectionContext,
): HardBlockContextValidationResult {
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

  if (HARDBLOCK_CATALOG.priority !== 100) {
    errors.push('Catalog HardBlock priority must be 100');
  }

  if (!TRANSITION_SOURCE_MODULES.includes(HARDBLOCK_CATALOG.sourceModule)) {
    errors.push(`Invalid catalog sourceModule: ${HARDBLOCK_CATALOG.sourceModule}`);
  }

  if (!HARDBLOCK_CATALOG.ruleReference?.trim()) {
    errors.push('Missing catalog ruleReference');
  }

  if (HARDBLOCK_CATALOG.auditLabel !== TransitionAuditLabel.ENTRY_BLOCK) {
    errors.push('Catalog HardBlock auditLabel must be ENTRY_BLOCK');
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
export function validateHardBlockDetectionResult(
  result: HardBlockDetectionResult,
): HardBlockDetectionValidationResult {
  const errors: string[] = [];

  if (result.priority !== 100) {
    errors.push('priority must be 100');
  }
  if (result.auditLabel !== TransitionAuditLabel.ENTRY_BLOCK) {
    errors.push('auditLabel must be ENTRY_BLOCK');
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

  const deduped = dedupeHardBlockEvidence(result.evidence);
  if (deduped.length !== result.evidence.length) {
    errors.push('Duplicate evidence rows detected');
  }

  for (const row of result.evidence) {
    if (!row.rawValue?.trim()) {
      errors.push('Evidence rawValue must be non-empty');
    }
    if (!isValidHardBlockOriginRuleId(row.originRuleId)) {
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

function collectOriginRuleIds(evidence: readonly HardBlockEvidence[]): string[] {
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
    return 'No HardBlock evidence — detected=false';
  }
  return `HardBlock passthrough: ${evidenceCount} evidence row(s) from Rule Engine`;
}

/**
 * HardBlock detection — **passthrough** from {@link NormalizedRuleOutput}.
 *
 * `detected = true` iff at least one valid evidence row exists after dedupe.
 */
export function detectHardBlock(context: HardBlockDetectionContext): HardBlockDetectionResult {
  const validation = validateHardBlockDetectionContext(context);

  const base: Omit<
    HardBlockDetectionResult,
    | 'detected'
    | 'evidence'
    | 'reason'
    | 'halted'
    | 'detectionMessage'
    | 'originRuleIds'
    | 'evidenceCount'
  > = {
    triggerId: HARDBLOCK_CATALOG.triggerId,
    sourceModule: HARDBLOCK_CATALOG.sourceModule,
    priority: HARDBLOCK_CATALOG.priority,
    auditLabel: HARDBLOCK_CATALOG.auditLabel,
    ruleReference: HARDBLOCK_CATALOG.ruleReference,
    context,
  };

  if (!validation.valid) {
    return {
      ...base,
      detected: false,
      reason: 'Context validation failed',
      evidence: [],
      originRuleIds: [],
      evidenceCount: 0,
      detectionMessage: validation.errors.join('; '),
      halted: true,
    };
  }

  const timestamp = context.marketSnapshot.timestamp;
  const evidence = buildHardBlockEvidenceFromRuleOutput(
    context.normalizedRuleOutput,
    timestamp,
  );
  const detected = evidence.length > 0;
  const evidenceCount = evidence.length;

  return {
    ...base,
    detected,
    reason: detected
      ? 'HardBlock active — passthrough from Rule Engine output'
      : 'No HardBlock — Rule Engine output clear',
    evidence,
    originRuleIds: collectOriginRuleIds(evidence),
    evidenceCount,
    detectionMessage: buildDetectionMessage(detected, evidenceCount),
    halted: false,
  };
}

/** Namespace for discoverability. */
export const HardBlockDetectionEngine = {
  detectHardBlock,
  validateHardBlockDetectionContext,
  validateHardBlockDetectionResult,
} as const;

/**
 * Maps manager input → {@link NormalizedRuleOutput} — **field copy only**.
 *
 * @deprecated Use {@link normalizeRuleOutput} from `./normalizedRuleOutput`.
 */
export function ruleEngineOutputFromManagerInput(input: NormalizedRuleOutput): NormalizedRuleOutput {
  return normalizeRuleOutput(input);
}
