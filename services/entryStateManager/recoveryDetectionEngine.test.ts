/**
 * Recovery Detection Engine — runtime passthrough tests (Task 02.4.9).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { TransitionAuditLabel } from './transitionMetadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { RECOVERY_EVIDENCE_KINDS } from './recoveryEvidenceKinds';
import {
  buildRecoveryEvidenceFromSignalSnapshot,
  dedupeRecoveryEvidence,
} from './recoveryEvidenceBuilder';
import {
  RecoveryDetectionEngine,
  detectRecovery,
  validateRecoveryDetectionContext,
  validateRecoveryDetectionResult,
} from './recoveryDetectionEngine';
import type { RecoveryDetectionContext } from './recoveryDetectionTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { RecoverySignalSnapshot } from './recoverySignalAdapter';

const clearOutput = (): NormalizedRuleOutput => ({
  hardBlocks: [],
  groupBlocks: [],
  blockReasons: [],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const emptySnapshot = (): RecoverySignalSnapshot => ({
  blockClearedHint: null,
  rulesNormalizedHint: null,
  tradePlanRecoveredHint: null,
  marketStableHint: null,
  signalReturnedHint: null,
  readyForWatchHint: null,
});

const buildContext = (
  snapshot: RecoverySignalSnapshot = emptySnapshot(),
): RecoveryDetectionContext => ({
  normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
  currentEntryState: EntryState.BLOCKED,
  candidateTransitions: [],
  signalSnapshot: {
    direction: EsmDirection.LONG,
    canEnter: false,
    decision: 'KHONG_VAO',
    hardBlocks: [],
    tradePlanValid: true,
    entryScore: 7.5,
  },
  marketSnapshot: {
    symbol: 'BTCUSDT',
    markPrice: 100000,
    timestamp: '2026-07-11T00:00:00Z',
  },
  recoverySignalSnapshot: snapshot,
});

describe('RecoveryDetectionEngine — runtime passthrough', () => {
  it('valid context passes validation', () => {
    expect(validateRecoveryDetectionContext(buildContext()).valid).toBe(true);
  });

  it('blockClearedHint → RECOVERY_BLOCK_CLEARED evidence', () => {
    const result = detectRecovery(
      buildContext({ ...emptySnapshot(), blockClearedHint: 'hardBlocks cleared' }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('RECOVERY_BLOCK_CLEARED');
    expect(result.evidence[0].sourceModule).toBe('RuleEngine');
    expect(validateRecoveryDetectionResult(result).valid).toBe(true);
  });

  it('rulesNormalizedHint → RECOVERY_RULES_NORMALIZED evidence', () => {
    const result = detectRecovery(
      buildContext({ ...emptySnapshot(), rulesNormalizedHint: 'no active blocks' }),
    );
    expect(result.evidence[0].kind).toBe('RECOVERY_RULES_NORMALIZED');
  });

  it('tradePlanRecoveredHint → RECOVERY_TRADEPLAN_VALID evidence', () => {
    const result = detectRecovery(
      buildContext({ ...emptySnapshot(), tradePlanRecoveredHint: 'plan valid again' }),
    );
    expect(result.evidence[0].kind).toBe('RECOVERY_TRADEPLAN_VALID');
  });

  it('marketStableHint → RECOVERY_MARKET_STABLE evidence', () => {
    const result = detectRecovery(
      buildContext({ ...emptySnapshot(), marketStableHint: 'ADX trending' }),
    );
    expect(result.evidence[0].kind).toBe('RECOVERY_MARKET_STABLE');
  });

  it('signalReturnedHint → RECOVERY_SIGNAL_RETURNED evidence', () => {
    const result = detectRecovery(
      buildContext({ ...emptySnapshot(), signalReturnedHint: 'score recovered' }),
    );
    expect(result.evidence[0].kind).toBe('RECOVERY_SIGNAL_RETURNED');
  });

  it('readyForWatchHint → RECOVERY_READY_FOR_WATCH evidence', () => {
    const result = detectRecovery(
      buildContext({ ...emptySnapshot(), readyForWatchHint: 'exitBlockedScans met' }),
    );
    expect(result.evidence[0].kind).toBe('RECOVERY_READY_FOR_WATCH');
  });

  it('all hints at once → 6 evidence rows', () => {
    const result = detectRecovery(
      buildContext({
        blockClearedHint: 'a',
        rulesNormalizedHint: 'b',
        tradePlanRecoveredHint: 'c',
        marketStableHint: 'd',
        signalReturnedHint: 'e',
        readyForWatchHint: 'f',
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidenceCount).toBe(6);
    expect(result.priority).toBe(70);
    expect(result.auditLabel).toBe(TransitionAuditLabel.ENTRY_RECOVERY);
    expect(result.originRuleIds).toHaveLength(0);
  });

  it('no hints → detected=false, evidence=[]', () => {
    const result = RecoveryDetectionEngine.detectRecovery(buildContext());
    expect(result.detected).toBe(false);
    expect(result.evidence).toHaveLength(0);
    expect(validateRecoveryDetectionResult(result).valid).toBe(true);
  });

  it('dedupe removes duplicate evidence rows', () => {
    const rows = buildRecoveryEvidenceFromSignalSnapshot({
      ...emptySnapshot(),
      blockClearedHint: 'same',
      rulesNormalizedHint: 'same',
    });
    expect(rows).toHaveLength(2);
    const dup = dedupeRecoveryEvidence([rows[0], { ...rows[0] }]);
    expect(dup).toHaveLength(1);
  });

  it('halts on invalid context — missing normalizedRuleOutput', () => {
    const ctx = { ...buildContext(), normalizedRuleOutput: undefined as never };
    const result = detectRecovery(ctx);
    expect(result.halted).toBe(true);
    expect(result.detected).toBe(false);
  });

  it('recovery evidence kind taxonomy has 6 kinds', () => {
    expect(RECOVERY_EVIDENCE_KINDS).toHaveLength(6);
  });
});
