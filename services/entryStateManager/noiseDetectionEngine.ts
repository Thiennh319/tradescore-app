/**
 * Noise Detection Engine (Task 02.4.4 / 02.4.5).
 *
 * **Detects noise triggers by READING existing noise hints only.**
 *
 * **MUST NOT:**
 * - Decide EntryState (READY/WATCH/LOCKED/BLOCKED)
 * - Choose transitions, hysteresis, or Decision Engine
 * - Create new noise rules or edit RuleBook
 *
 * @module entryStateManager/noiseDetectionEngine
 */

import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';
import { TRANSITION_SOURCE_MODULES, TransitionAuditLabel } from './transitionMetadata';
import { buildNoiseEvidenceFromSignalSnapshot, dedupeNoiseEvidence } from './noiseEvidenceBuilder';
import { isValidNoiseOriginRuleId } from './noiseOriginRuleId';
import { adaptNoiseSignalsFromContext } from './noiseSignalAdapter';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type {
  NoiseContextValidationResult,
  NoiseDetectionContext,
  NoiseDetectionResult,
  NoiseDetectionValidationResult,
  NoiseEvidence,
} from './noiseDetectionTypes';

const NOISE_CATALOG = TRIGGER_TYPE_CATALOG[EntryTriggerKind.Noise];

/**
 * Validates context structure — **no noise computation**.
 */
export function validateNoiseDetectionContext(
  context: NoiseDetectionContext,
): NoiseContextValidationResult {
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

  if (NOISE_CATALOG.priority !== 50) {
    errors.push('Catalog Noise priority must be 50');
  }

  if (NOISE_CATALOG.auditLabel !== TransitionAuditLabel.ENTRY_NOISE_FILTER) {
    errors.push('Catalog Noise auditLabel must be ENTRY_NOISE_FILTER');
  }

  if (!TRANSITION_SOURCE_MODULES.includes(NOISE_CATALOG.sourceModule)) {
    errors.push(`Invalid catalog sourceModule: ${NOISE_CATALOG.sourceModule}`);
  }

  if (!NOISE_CATALOG.ruleReference?.trim()) {
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
export function validateNoiseDetectionResult(
  result: NoiseDetectionResult,
): NoiseDetectionValidationResult {
  const errors: string[] = [];

  if (result.priority !== 50) {
    errors.push('priority must be 50');
  }
  if (result.auditLabel !== TransitionAuditLabel.ENTRY_NOISE_FILTER) {
    errors.push('auditLabel must be ENTRY_NOISE_FILTER');
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

  const deduped = dedupeNoiseEvidence(result.evidence);
  if (deduped.length !== result.evidence.length) {
    errors.push('Duplicate evidence rows detected');
  }

  for (const row of result.evidence) {
    if (!row.rawValue?.trim()) {
      errors.push('Evidence rawValue must be non-empty');
    }
    if (!isValidNoiseOriginRuleId(row.originRuleId)) {
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

function collectOriginRuleIds(evidence: readonly NoiseEvidence[]): string[] {
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
    return 'No Noise evidence — detected=false';
  }
  return `Noise passthrough: ${evidenceCount} evidence row(s) from app hints`;
}

/**
 * Noise detection — **passthrough** from {@link NoiseSignalSnapshot} hints.
 *
 * `detected = true` iff at least one valid evidence row exists after dedupe.
 * Does **not** read `decision` for detection.
 */
export function detectNoise(context: NoiseDetectionContext): NoiseDetectionResult {
  const validation = validateNoiseDetectionContext(context);

  const base: Omit<
    NoiseDetectionResult,
    'detected' | 'evidence' | 'originRuleIds' | 'evidenceCount' | 'detectionMessage' | 'halted'
  > = {
    triggerId: NOISE_CATALOG.triggerId,
    priority: NOISE_CATALOG.priority,
    sourceModule: NOISE_CATALOG.sourceModule,
    auditLabel: NOISE_CATALOG.auditLabel,
    ruleReference: NOISE_CATALOG.ruleReference,
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

  const snapshot = adaptNoiseSignalsFromContext({
    normalizedRuleOutput: context.normalizedRuleOutput,
    signalSnapshot: context.signalSnapshot,
    marketSnapshot: context.marketSnapshot,
    noiseSignalSnapshot: context.noiseSignalSnapshot,
  });

  const evidence = buildNoiseEvidenceFromSignalSnapshot(
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
export const NoiseDetectionEngine = {
  detectNoise,
  validateNoiseDetectionContext,
  validateNoiseDetectionResult,
} as const;
