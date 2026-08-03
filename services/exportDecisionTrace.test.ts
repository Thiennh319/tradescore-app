import { describe, expect, it } from 'vitest';
import type { LayerResult } from '../constants/scoring';
import { FinalEntryStatus } from '../types/scoring';
import {
  buildDecisionTrace,
  formatDecisionTraceTXT,
} from './exportDecisionTrace';
import { exportTradeScoreAuditPackage } from './exportService';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';

function layer(
  id: number,
  name: string,
  passed: boolean,
  reason: string,
  score = passed ? 1 : 0,
  maxScore = 1.5,
): LayerResult {
  return {
    layer: id as LayerResult['layer'],
    name,
    score,
    maxScore,
    passed,
    isMandatory: id === 5,
    isMandatoryViolation: id === 5 && !passed,
    reason,
  };
}

function scorerSnapshot(
  partial: Partial<SignalRowScorerSnapshot> & { layers?: LayerResult[] },
): SignalRowScorerSnapshot {
  return {
    score: 9.5,
    longScore: 9.5,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CHO_THEM',
    decisionDisplay: 'CHỜ THÊM',
    winrate: '~55%',
    canEnter: false,
    layers: partial.layers ?? [
      layer(1, 'Giá & EMA (Slope)', true, 'EMA Alignment PASS', 1.5),
      layer(2, 'RSI 14 + Divergence', true, 'RSI Neutral', 1),
      layer(3, 'MACD + Histogram Momentum', false, 'Histogram yếu', 0),
      layer(5, 'L5a — CVD Strength', true, 'CVD ok', 1),
      layer(52, 'L5b — Volume / OI', false, 'Volume thấp', 0),
      layer(7, 'L/S Ratio + Whale Wall', false, 'Whale Wall quá gần', 0),
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    groupScores: { A: 4, B: 1.5, C: 3 },
    ...partial,
  };
}

function rowFromSnap(snap: SignalRowScorerSnapshot): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 100,
    change24h: 1,
    trend: 'UP',
    regimeConfidence: 70,
    score: snap.score,
    longScore: snap.longScore,
    shortScore: snap.shortScore,
    direction: snap.direction,
    decisionLabel: snap.decisionLabel,
    decisionDisplay: snap.decisionDisplay,
    winrate: snap.winrate,
    canEnter: snap.canEnter,
    tradePlan: null,
    layers: snap.layers,
    mandatoryViolations: snap.mandatoryViolations,
    hardBlocked: snap.hardBlocked,
    fromCache: false,
    finalEntryStatus: snap.finalEntryStatus,
    v4: snap,
  };
}

describe('TASK R1.3 Decision Trace export', () => {
  it('builds scorePipeline from frozen layer scores only', () => {
    const trace = buildDecisionTrace(rowFromSnap(scorerSnapshot({})));

    expect(trace.scorePipeline[0]).toEqual({
      step: 'Giá & EMA (Slope)',
      score: 1.5,
      maxScore: 1.5,
      reason: 'EMA Alignment PASS',
    });
    expect(trace.scorePipeline.some((s) => s.step.includes('Volume'))).toBe(
      true,
    );
    expect(
      trace.scorePipeline.find((s) => s.step.includes('Volume'))?.reason,
    ).toBe('Volume thấp');
  });

  it('maps scoreSummary from groupScores without inventing missing pillars', () => {
    const trace = buildDecisionTrace(rowFromSnap(scorerSnapshot({})));

    expect(trace.scoreSummary.trend).toBe(4);
    expect(trace.scoreSummary.volume).toBe(1.5);
    expect(trace.scoreSummary.context).toBe(3);
    expect(trace.scoreSummary.total).toBe(9.5);
    expect(trace.scoreSummary.momentum).toBeNull();
    expect(trace.scoreSummary.risk).toBeNull();
    expect(trace.scoreSummary.execution).toBeNull();
    expect(trace.scoreSummary.timing).toBeNull();
  });

  it('exports WAIT decisionPipeline with blocked reasons from frozen blocks', () => {
    const snap = scorerSnapshot({
      hardBlocked: true,
      canEnter: false,
      decisionLabel: 'KHONG_VAO',
      finalEntryStatus: FinalEntryStatus.HARD_BLOCKED,
      longHardBlocks: ['Whale Wall quá gần'],
      mandatoryViolations: ['Whale Wall quá gần'],
      groupBlocks: ['Volume'],
    });
    const trace = buildDecisionTrace(rowFromSnap(snap));

    expect(trace.decisionPipeline.decision).toBe('BLOCKED');
    expect(trace.decisionPipeline.blocked).toBe(true);
    expect(trace.decisionPipeline.grade).toBe('UNAVAILABLE');
    expect(trace.decisionPipeline.blockedReasons).toContain('Whale Wall quá gần');
    expect(trace.decisionPipeline.blockedReasons).toContain('Volume');
  });

  it('recommendationPipeline uses frozen reasons with priorities', () => {
    const snap = scorerSnapshot({
      hardBlocked: true,
      longHardBlocks: ['Whale Wall quá gần'],
      mandatoryViolations: ['Whale Wall quá gần'],
      scoringWarnings: ['Funding elevated watch'],
    });
    const trace = buildDecisionTrace(rowFromSnap(snap));

    expect(
      trace.recommendationPipeline.some(
        (r) => r.priority === 'HIGH' && r.reason.includes('Whale Wall'),
      ),
    ).toBe(true);
    expect(
      trace.recommendationPipeline.some(
        (r) => r.priority === 'MEDIUM' && r.reason === 'Funding elevated watch',
      ),
    ).toBe(true);
    expect(
      trace.recommendationPipeline.some(
        (r) => r.priority === 'LOW' && r.reason.includes('Volume thấp'),
      ),
    ).toBe(true);
  });

  it('does not invent letter grade', () => {
    const trace = buildDecisionTrace(
      rowFromSnap(
        scorerSnapshot({
          decisionLabel: 'SETUP_NGON',
          canEnter: true,
          score: 12,
        }),
      ),
    );
    expect(trace.decisionPipeline.grade).toBe('UNAVAILABLE');
  });

  it('formats TXT and appends SECTION 14 without renumbering 1–13', () => {
    const row = rowFromSnap(scorerSnapshot({}));
    const txt = formatDecisionTraceTXT([row]);
    expect(txt).toContain('decisionTrace');
    expect(txt).toContain('## scorePipeline');
    expect(txt).toContain('## scoreSummary');
    expect(txt).toContain('## decisionPipeline');
    expect(txt).toContain('## recommendationPipeline');
    expect(txt).toContain('momentum: UNAVAILABLE');

    const pkg = exportTradeScoreAuditPackage([row], 'v4');
    expect(pkg).toContain('SECTION 13\nDECISION REPLAY');
    expect(pkg).toContain('SECTION 14\nDECISION TRACE');
    expect(pkg.indexOf('SECTION 13')).toBeLessThan(pkg.indexOf('SECTION 14'));
  });
});
