/**
 * Noise Detection Engine — runtime passthrough tests (Task 02.4.5).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { TransitionAuditLabel } from './transitionMetadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { NOISE_EVIDENCE_KINDS } from './noiseEvidenceKinds';
import { buildNoiseEvidenceFromSignalSnapshot, dedupeNoiseEvidence } from './noiseEvidenceBuilder';
import {
  NoiseDetectionEngine,
  detectNoise,
  validateNoiseDetectionContext,
  validateNoiseDetectionResult,
} from './noiseDetectionEngine';
import type { NoiseDetectionContext } from './noiseDetectionTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { NoiseSignalSnapshot } from './noiseSignalAdapter';

const clearOutput = (): NormalizedRuleOutput => ({
  hardBlocks: [],
  groupBlocks: [],
  blockReasons: [],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const emptySnapshot = (): NoiseSignalSnapshot => ({
  macdNoiseHint: null,
  rsiNoiseHint: null,
  emaFlipHint: null,
  cvdFlipHint: null,
  volumeSpikeHint: null,
  scoreFluctuationHint: null,
  shortTermReversalHint: null,
});

const buildContext = (
  snapshot: NoiseSignalSnapshot = emptySnapshot(),
): NoiseDetectionContext => ({
  normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
  currentEntryState: EntryState.WATCH,
  candidateTransitions: [],
  signalSnapshot: {
    direction: EsmDirection.LONG,
    canEnter: false,
    decision: 'VAO_TU_TIN',
    hardBlocks: [],
    tradePlanValid: true,
    entryScore: 8.5,
  },
  marketSnapshot: {
    symbol: 'BTCUSDT',
    markPrice: 100000,
    timestamp: '2026-07-11T00:00:00Z',
  },
  noiseSignalSnapshot: snapshot,
});

describe('NoiseDetectionEngine — runtime passthrough', () => {
  it('valid context passes validation', () => {
    expect(validateNoiseDetectionContext(buildContext()).valid).toBe(true);
  });

  it('macdNoiseHint → detected=true, MACD_NOISE evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), macdNoiseHint: 'MACD histogram flip 1 scan' }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('MACD_NOISE');
    expect(result.evidence[0].reason).toBe('MACD histogram flip 1 scan');
    expect(validateNoiseDetectionResult(result).valid).toBe(true);
  });

  it('rsiNoiseHint → RSI_NOISE evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), rsiNoiseHint: 'RSI left sweet zone' }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidence[0].kind).toBe('RSI_NOISE');
  });

  it('emaFlipHint → EMA_NOISE evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), emaFlipHint: 'EMA20 cross noise' }),
    );
    expect(result.evidence[0].kind).toBe('EMA_NOISE');
  });

  it('cvdFlipHint → CVD_NOISE evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), cvdFlipHint: 'CVD minor flip' }),
    );
    expect(result.evidence[0].kind).toBe('CVD_NOISE');
    expect(result.evidence[0].sourceModule).toBe('CVDFilter');
  });

  it('volumeSpikeHint → VOLUME_SPIKE evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), volumeSpikeHint: 'Small volume spike' }),
    );
    expect(result.evidence[0].kind).toBe('VOLUME_SPIKE');
  });

  it('scoreFluctuationHint → SCORE_FLUCTUATION evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), scoreFluctuationHint: 'Live score drift 0.8đ' }),
    );
    expect(result.evidence[0].kind).toBe('SCORE_FLUCTUATION');
  });

  it('shortTermReversalHint → SHORT_TERM_REVERSAL evidence', () => {
    const result = detectNoise(
      buildContext({ ...emptySnapshot(), shortTermReversalHint: 'Momentum dip 1 scan' }),
    );
    expect(result.evidence[0].kind).toBe('SHORT_TERM_REVERSAL');
  });

  it('all hints at once → 7 evidence rows', () => {
    const result = detectNoise(
      buildContext({
        macdNoiseHint: 'm',
        rsiNoiseHint: 'r',
        emaFlipHint: 'e',
        cvdFlipHint: 'c',
        volumeSpikeHint: 'v',
        scoreFluctuationHint: 's',
        shortTermReversalHint: 't',
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.evidenceCount).toBe(7);
    expect(result.priority).toBe(50);
    expect(result.auditLabel).toBe(TransitionAuditLabel.ENTRY_NOISE_FILTER);
    expect(result.originRuleIds).toHaveLength(0);
  });

  it('no hints → detected=false, evidence=[]', () => {
    const result = NoiseDetectionEngine.detectNoise(buildContext());
    expect(result.detected).toBe(false);
    expect(result.evidence).toHaveLength(0);
    expect(result.evidenceCount).toBe(0);
    expect(validateNoiseDetectionResult(result).valid).toBe(true);
  });

  it('dedupe removes duplicate hint evidence', () => {
    const rows = buildNoiseEvidenceFromSignalSnapshot({
      ...emptySnapshot(),
      macdNoiseHint: 'same',
      rsiNoiseHint: 'same',
    });
    expect(rows).toHaveLength(2);
    const dup = dedupeNoiseEvidence([
      rows[0],
      { ...rows[0] },
    ]);
    expect(dup).toHaveLength(1);
  });

  it('halts on invalid context — missing normalizedRuleOutput', () => {
    const ctx = { ...buildContext(), normalizedRuleOutput: undefined as never };
    const result = detectNoise(ctx);
    expect(result.halted).toBe(true);
    expect(result.detected).toBe(false);
  });

  it('noise evidence kind taxonomy has 7 kinds', () => {
    expect(NOISE_EVIDENCE_KINDS).toHaveLength(7);
  });
});
