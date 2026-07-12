/**
 * Confirmation Detection Engine — runtime passthrough tests (Task 02.4.7).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { TransitionAuditLabel } from './transitionMetadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { CONFIRMATION_EVIDENCE_KINDS } from './confirmationEvidenceKinds';
import {
  buildConfirmationEvidenceFromSignalSnapshot,
  dedupeConfirmationEvidence,
} from './confirmationEvidenceBuilder';
import {
  ConfirmationDetectionEngine,
  detectConfirmation,
  validateConfirmationDetectionContext,
  validateConfirmationDetectionResult,
} from './confirmationDetectionEngine';
import type { ConfirmationDetectionContext } from './confirmationDetectionTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { ConfirmationSignalSnapshot } from './confirmationSignalAdapter';

const clearOutput = (): NormalizedRuleOutput => ({
  hardBlocks: [],
  groupBlocks: [],
  blockReasons: [],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const emptySnapshot = (): ConfirmationSignalSnapshot => ({
  emaConfirmedHint: null,
  trendConfirmedHint: null,
  scoreConfirmedHint: null,
  tradePlanConfirmedHint: null,
  volumeConfirmedHint: null,
  directionConfirmedHint: null,
});

const buildContext = (
  snapshot: ConfirmationSignalSnapshot = emptySnapshot(),
): ConfirmationDetectionContext => ({
  normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
  currentEntryState: EntryState.WATCH,
  candidateTransitions: [],
  signalSnapshot: {
    direction: EsmDirection.LONG,
    canEnter: true,
    decision: 'VAO_TU_TIN',
    hardBlocks: [],
    tradePlanValid: true,
    entryScore: 9.2,
  },
  marketSnapshot: {
    symbol: 'BTCUSDT',
    markPrice: 100000,
    timestamp: '2026-07-11T00:00:00Z',
  },
  confirmationSignalSnapshot: snapshot,
});

describe('ConfirmationDetectionEngine — runtime passthrough', () => {
  it('valid context passes validation', () => {
    expect(validateConfirmationDetectionContext(buildContext()).valid).toBe(true);
  });

  it('emaConfirmedHint → EMA_CONFIRMED evidence', () => {
    const result = detectConfirmation(
      buildContext({ ...emptySnapshot(), emaConfirmedHint: 'EMA20 aligned' }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('EMA_CONFIRMED');
    expect(result.evidence[0].sourceModule).toBe('EntryStateManager');
    expect(validateConfirmationDetectionResult(result).valid).toBe(true);
  });

  it('trendConfirmedHint → TREND_CONFIRMED evidence', () => {
    const result = detectConfirmation(
      buildContext({ ...emptySnapshot(), trendConfirmedHint: 'Trend intact' }),
    );
    expect(result.evidence[0].kind).toBe('TREND_CONFIRMED');
  });

  it('scoreConfirmedHint → SCORE_CONFIRMED evidence', () => {
    const result = detectConfirmation(
      buildContext({ ...emptySnapshot(), scoreConfirmedHint: 'Score >= 9' }),
    );
    expect(result.evidence[0].kind).toBe('SCORE_CONFIRMED');
  });

  it('tradePlanConfirmedHint → TRADEPLAN_CONFIRMED evidence', () => {
    const result = detectConfirmation(
      buildContext({ ...emptySnapshot(), tradePlanConfirmedHint: 'Plan valid' }),
    );
    expect(result.evidence[0].kind).toBe('TRADEPLAN_CONFIRMED');
  });

  it('volumeConfirmedHint → VOLUME_CONFIRMED evidence', () => {
    const result = detectConfirmation(
      buildContext({ ...emptySnapshot(), volumeConfirmedHint: 'Volume supports' }),
    );
    expect(result.evidence[0].kind).toBe('VOLUME_CONFIRMED');
  });

  it('directionConfirmedHint → DIRECTION_CONFIRMED evidence', () => {
    const result = detectConfirmation(
      buildContext({ ...emptySnapshot(), directionConfirmedHint: 'Direction clear' }),
    );
    expect(result.evidence[0].kind).toBe('DIRECTION_CONFIRMED');
  });

  it('all hints at once → 6 evidence rows', () => {
    const result = detectConfirmation(
      buildContext({
        emaConfirmedHint: 'e',
        trendConfirmedHint: 't',
        scoreConfirmedHint: 's',
        tradePlanConfirmedHint: 'p',
        volumeConfirmedHint: 'v',
        directionConfirmedHint: 'd',
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidenceCount).toBe(6);
    expect(result.priority).toBe(60);
    expect(result.auditLabel).toBe(TransitionAuditLabel.ENTRY_CONFIRM);
    expect(result.originRuleIds).toHaveLength(0);
  });

  it('no hints → detected=false, evidence=[]', () => {
    const result = ConfirmationDetectionEngine.detectConfirmation(buildContext());
    expect(result.detected).toBe(false);
    expect(result.evidence).toHaveLength(0);
    expect(validateConfirmationDetectionResult(result).valid).toBe(true);
  });

  it('dedupe removes duplicate evidence rows', () => {
    const rows = buildConfirmationEvidenceFromSignalSnapshot({
      ...emptySnapshot(),
      emaConfirmedHint: 'same',
      trendConfirmedHint: 'same',
    });
    expect(rows).toHaveLength(2);
    const dup = dedupeConfirmationEvidence([rows[0], { ...rows[0] }]);
    expect(dup).toHaveLength(1);
  });

  it('halts on invalid context — missing normalizedRuleOutput', () => {
    const ctx = { ...buildContext(), normalizedRuleOutput: undefined as never };
    const result = detectConfirmation(ctx);
    expect(result.halted).toBe(true);
    expect(result.detected).toBe(false);
  });

  it('confirmation evidence kind taxonomy has 6 kinds', () => {
    expect(CONFIRMATION_EVIDENCE_KINDS).toHaveLength(6);
  });
});
