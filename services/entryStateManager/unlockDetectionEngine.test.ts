/**
 * Unlock Detection Engine — runtime passthrough tests (Task 02.4.11).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { TransitionAuditLabel } from './transitionMetadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { UNLOCK_EVIDENCE_KINDS } from './unlockEvidenceKinds';
import {
  buildUnlockEvidenceFromSignalSnapshot,
  dedupeUnlockEvidence,
} from './unlockEvidenceBuilder';
import {
  UnlockDetectionEngine,
  detectUnlock,
  validateUnlockDetectionContext,
  validateUnlockDetectionResult,
} from './unlockDetectionEngine';
import type { UnlockDetectionContext } from './unlockDetectionTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { UnlockSignalSnapshot } from './unlockSignalAdapter';

const clearOutput = (): NormalizedRuleOutput => ({
  hardBlocks: [],
  groupBlocks: [],
  blockReasons: [],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const emptySnapshot = (): UnlockSignalSnapshot => ({
  lockZoneExitedHint: null,
  priceRecoveredHint: null,
  confirmationReturnedHint: null,
  riskNormalizedHint: null,
  signalStableHint: null,
  readyForWatchHint: null,
});

const buildContext = (
  snapshot: UnlockSignalSnapshot = emptySnapshot(),
): UnlockDetectionContext => ({
  normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
  currentEntryState: EntryState.LOCKED,
  candidateTransitions: [],
  signalSnapshot: {
    direction: EsmDirection.LONG,
    canEnter: false,
    decision: 'VAO_TU_TIN',
    hardBlocks: [],
    tradePlanValid: true,
    entryScore: 9.0,
  },
  marketSnapshot: {
    symbol: 'BTCUSDT',
    markPrice: 100500,
    timestamp: '2026-07-11T00:00:00Z',
  },
  unlockSignalSnapshot: snapshot,
});

describe('UnlockDetectionEngine — runtime passthrough', () => {
  it('valid context passes validation', () => {
    expect(validateUnlockDetectionContext(buildContext()).valid).toBe(true);
  });

  it('lockZoneExitedHint → UNLOCK_LOCK_ZONE_EXITED evidence', () => {
    const result = detectUnlock(
      buildContext({ ...emptySnapshot(), lockZoneExitedHint: 'price left lock zone' }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('UNLOCK_LOCK_ZONE_EXITED');
    expect(result.evidence[0].sourceModule).toBe('EntryStateManager');
    expect(validateUnlockDetectionResult(result).valid).toBe(true);
  });

  it('priceRecoveredHint → UNLOCK_PRICE_RECOVERED evidence', () => {
    const result = detectUnlock(
      buildContext({ ...emptySnapshot(), priceRecoveredHint: 'price recovered' }),
    );
    expect(result.evidence[0].kind).toBe('UNLOCK_PRICE_RECOVERED');
  });

  it('confirmationReturnedHint → UNLOCK_CONFIRMATION_RETURNED evidence', () => {
    const result = detectUnlock(
      buildContext({ ...emptySnapshot(), confirmationReturnedHint: 'confirm back' }),
    );
    expect(result.evidence[0].kind).toBe('UNLOCK_CONFIRMATION_RETURNED');
  });

  it('riskNormalizedHint → UNLOCK_RISK_NORMALIZED evidence', () => {
    const result = detectUnlock(
      buildContext({ ...emptySnapshot(), riskNormalizedHint: 'risk ok' }),
    );
    expect(result.evidence[0].kind).toBe('UNLOCK_RISK_NORMALIZED');
  });

  it('signalStableHint → UNLOCK_SIGNAL_STABLE evidence', () => {
    const result = detectUnlock(
      buildContext({ ...emptySnapshot(), signalStableHint: 'layers stable' }),
    );
    expect(result.evidence[0].kind).toBe('UNLOCK_SIGNAL_STABLE');
  });

  it('readyForWatchHint → UNLOCK_READY_FOR_WATCH evidence (not a state transition)', () => {
    const result = detectUnlock(
      buildContext({ ...emptySnapshot(), readyForWatchHint: 'may evaluate WATCH' }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('UNLOCK_READY_FOR_WATCH');
    expect(result.context.currentEntryState).toBe(EntryState.LOCKED);
  });

  it('all hints at once → 6 evidence rows', () => {
    const result = detectUnlock(
      buildContext({
        lockZoneExitedHint: 'a',
        priceRecoveredHint: 'b',
        confirmationReturnedHint: 'c',
        riskNormalizedHint: 'd',
        signalStableHint: 'e',
        readyForWatchHint: 'f',
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidenceCount).toBe(6);
    expect(result.priority).toBe(70);
    expect(result.auditLabel).toBe(TransitionAuditLabel.ENTRY_UNLOCK);
    expect(result.originRuleIds).toHaveLength(0);
  });

  it('no hints → detected=false, evidence=[]', () => {
    const result = UnlockDetectionEngine.detectUnlock(buildContext());
    expect(result.detected).toBe(false);
    expect(result.evidence).toHaveLength(0);
    expect(validateUnlockDetectionResult(result).valid).toBe(true);
  });

  it('dedupe removes duplicate evidence rows', () => {
    const rows = buildUnlockEvidenceFromSignalSnapshot({
      ...emptySnapshot(),
      lockZoneExitedHint: 'same',
      priceRecoveredHint: 'same',
    });
    expect(rows).toHaveLength(2);
    const dup = dedupeUnlockEvidence([rows[0], { ...rows[0] }]);
    expect(dup).toHaveLength(1);
  });

  it('halts on invalid context — missing normalizedRuleOutput', () => {
    const ctx = { ...buildContext(), normalizedRuleOutput: undefined as never };
    const result = detectUnlock(ctx);
    expect(result.halted).toBe(true);
    expect(result.detected).toBe(false);
  });

  it('unlock evidence kind taxonomy has 6 kinds', () => {
    expect(UNLOCK_EVIDENCE_KINDS).toHaveLength(6);
  });
});
