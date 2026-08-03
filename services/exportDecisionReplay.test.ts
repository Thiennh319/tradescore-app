import { describe, expect, it } from 'vitest';
import type { LayerResult } from '../constants/scoring';
import { FinalEntryStatus } from '../types/scoring';
import { formatDecisionReplayTXT } from './exportDecisionReplay';
import { exportTradeScoreAuditPackage } from './exportService';
import { buildRuleAuditSnapshot } from './ruleAuditSnapshotBuilder';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';

function layer(
  id: number,
  name: string,
  passed: boolean,
  reason: string,
  score = passed ? 1 : 0,
): LayerResult {
  return {
    layer: id as LayerResult['layer'],
    name,
    score,
    maxScore: 1.5,
    passed,
    isMandatory: id === 5,
    isMandatoryViolation: id === 5 && !passed,
    reason,
  };
}

function baseLayers(): LayerResult[] {
  return [
    layer(1, 'EMA', true, 'EMA aligned', 1),
    layer(2, 'RSI', true, 'RSI in range', 1),
    layer(3, 'MACD', true, 'Histogram positive', 1),
    layer(5, 'CVD', true, 'CVD supportive', 1),
    layer(6, 'Funding', true, 'Funding neutral', 1),
  ];
}

function scorerSnapshot(
  partial: Partial<SignalRowScorerSnapshot> & {
    layers?: LayerResult[];
  },
): SignalRowScorerSnapshot {
  return {
    score: 10,
    longScore: 10,
    shortScore: 5,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    winrate: '~65%',
    canEnter: true,
    layers: partial.layers ?? baseLayers(),
    mandatoryViolations: [],
    hardBlocked: false,
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
    ruleAuditSnapshot: buildRuleAuditSnapshot(),
    v4: snap,
  };
}

describe('TASK 16.2 Decision Replay export', () => {
  it('exports LONG decision replay from frozen snapshot', () => {
    const txt = formatDecisionReplayTXT(
      [
        rowFromSnap(
          scorerSnapshot({
            direction: 'LONG',
            decisionLabel: 'VAO_TU_TIN',
            decisionDisplay: 'VÀO TỰ TIN',
            canEnter: true,
          }),
        ),
      ],
      'v4',
      '2026-07-18T01:00:00.000Z',
    );

    expect(txt).toContain('DECISION REPLAY');
    expect(txt).toContain('Decision: LONG');
    expect(txt).toContain('Direction: Bullish');
    expect(txt).toContain('Source: Decision Snapshot');
    expect(txt).toContain('Result: PASS');
    expect(txt).toContain('Contribution: +1');
    expect(txt).toContain('EMA aligned');
  });

  it('exports SHORT decision replay', () => {
    const txt = formatDecisionReplayTXT([
      rowFromSnap(
        scorerSnapshot({
          direction: 'SHORT',
          longScore: 4,
          shortScore: 11,
          decisionLabel: 'SETUP_NGON',
          decisionDisplay: 'SETUP NGON',
          canEnter: true,
        }),
      ),
    ]);

    expect(txt).toContain('Decision: SHORT');
    expect(txt).toContain('Direction: Bearish');
  });

  it('exports WAIT when not enterable', () => {
    const txt = formatDecisionReplayTXT([
      rowFromSnap(
        scorerSnapshot({
          decisionLabel: 'CHO_THEM',
          decisionDisplay: 'CHỜ THÊM',
          canEnter: false,
        }),
      ),
    ]);

    expect(txt).toContain('Decision: WAIT');
    expect(txt).toContain('Blocked: NO');
  });

  it('exports BLOCKED hard-block replay', () => {
    const txt = formatDecisionReplayTXT([
      rowFromSnap(
        scorerSnapshot({
          hardBlocked: true,
          canEnter: false,
          decisionLabel: 'KHONG_VAO',
          decisionDisplay: 'KHÔNG VÀO',
          finalEntryStatus: FinalEntryStatus.HARD_BLOCKED,
          longHardBlocks: ['L5 CVD hard block — CVD too negative'],
          mandatoryViolations: ['L5 CVD hard block — CVD too negative'],
        }),
      ),
    ]);

    expect(txt).toContain('Decision: BLOCKED');
    expect(txt).toContain('Blocked: YES');
    expect(txt).toContain('Reason: L5 CVD hard block — CVD too negative');
    expect(txt).toContain('Blocked Layer: L5');
  });

  it('exports RECOVERY from awaitingRescore / CHO_TAI_CHAM', () => {
    const txt = formatDecisionReplayTXT([
      rowFromSnap(
        scorerSnapshot({
          awaitingRescore: true,
          decisionLabel: 'CHO_TAI_CHAM',
          decisionDisplay: 'CHỜ TÁI CHẤM',
          canEnter: false,
        }),
      ),
    ]);

    expect(txt).toContain('Decision: WAIT');
    expect(txt).toContain('Recovery: YES');
    expect(txt).toContain('Recovered By: awaitingRescore (frozen)');
    expect(txt).toContain('Recovery Layer: 9');
  });

  it('exports UNKNOWN when direction is ambiguous', () => {
    const txt = formatDecisionReplayTXT([
      rowFromSnap(
        scorerSnapshot({
          isAmbiguousDirection: true,
          ambiguousMessage: 'Long/Short too close',
          canEnter: false,
          decisionLabel: 'KHONG_VAO',
        }),
      ),
    ]);

    expect(txt).toContain('Decision: UNKNOWN');
    expect(txt).toContain('Direction: Unknown');
    expect(txt).toContain('Ambiguity: Long/Short too close');
  });

  it('marks missing contribution when layers are empty', () => {
    const txt = formatDecisionReplayTXT([
      rowFromSnap(
        scorerSnapshot({
          layers: [],
          decisionLabel: 'CHO_THEM',
          canEnter: false,
        }),
      ),
    ]);

    expect(txt).toContain('Contribution: UNAVAILABLE');
  });

  it('does not invent decision confidence', () => {
    const txt = formatDecisionReplayTXT([rowFromSnap(scorerSnapshot({}))]);

    expect(txt).toContain('## Confidence Replay');
    expect(txt).toContain('Confidence: UNAVAILABLE');
    expect(txt).toContain('Raw Confidence: UNAVAILABLE');
    expect(txt).toContain('Confidence Source: Decision Snapshot');
  });

  it('handles missing decision snapshot fields without guessing', () => {
    const row: SignalRow = {
      symbol: 'ETHUSDT',
      price: null,
      change24h: 0,
      trend: 'SIDEWAYS',
      regimeConfidence: 0,
      score: 0,
      longScore: 0,
      shortScore: 0,
      direction: 'LONG',
      decisionLabel: 'KHONG_VAO',
      decisionDisplay: 'KHÔNG VÀO',
      winrate: '~50%',
      canEnter: false,
      tradePlan: null,
      layers: [],
      mandatoryViolations: [],
      hardBlocked: false,
      fromCache: false,
    };

    const txt = formatDecisionReplayTXT([row], 'v4', '2026-07-18T02:00:00.000Z');
    expect(txt).toContain('DECISION REPLAY');
    expect(txt).toContain('Decision: WAIT');
    expect(txt).toContain('Contribution: UNAVAILABLE');
    expect(txt).toContain('Confidence: UNAVAILABLE');
    expect(txt).not.toMatch(/Contribution: \+[1-9]/);
  });

  it('appends SECTION 13 without renumbering SECTION 1–12', () => {
    const txt = exportTradeScoreAuditPackage([rowFromSnap(scorerSnapshot({}))], 'v4');

    expect(txt).toContain('SECTION 12\nLAYER INPUT SNAPSHOT');
    expect(txt).toContain('SECTION 13\nDECISION REPLAY');
    expect(txt.indexOf('SECTION 12')).toBeLessThan(txt.indexOf('SECTION 13'));
  });
});
