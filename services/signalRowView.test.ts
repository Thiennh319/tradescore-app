import { describe, expect, it } from 'vitest';
import type { SignalRow } from './signalBoardScan';
import { resolveSignalRow, scoringResultV3FromSignalRow } from './signalRowView';

function mockRow(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 100_000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score: 12,
    longScore: 12.5,
    shortScore: 8,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'VÀO TỰ TIN',
    winrate: '~68%',
    canEnter: true,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    v3: {
      score: 12,
      longScore: 12.5,
      shortScore: 8,
      direction: 'LONG',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: 'VÀO TỰ TIN',
      winrate: '~68%',
      canEnter: true,
      layers: [{ layer: 1, name: 'L1', score: 1.5, maxScore: 1.5, passed: true, isMandatory: false, isMandatoryViolation: false, reason: 'ok' }],
      mandatoryViolations: [],
      hardBlocked: false,
      marketMode: 'TRENDING',
      groupScores: { A: 4, B: 4, C: 4 },
      groupBlocks: [],
    },
    ...overrides,
  };
}

describe('resolveSignalRow', () => {
  it('returns V3 snapshot when present', () => {
    const row = mockRow();
    const snap = resolveSignalRow(row);
    expect(snap.score).toBe(12);
    expect(snap.decisionLabel).toBe('VAO_TU_TIN');
    expect(snap.marketMode).toBe('TRENDING');
    expect(snap.groupScores).toEqual({ A: 4, B: 4, C: 4 });
  });

  it('falls back to top-level fields when v3 missing', () => {
    const row = mockRow({
      v3: undefined,
      score: 10.5,
      decisionLabel: 'CO_THE_VAO',
    });
    const snap = resolveSignalRow(row);
    expect(snap.score).toBe(10.5);
    expect(snap.decisionLabel).toBe('CO_THE_VAO');
  });
});

describe('scoringResultV3FromSignalRow', () => {
  it('v3 version builds native ScoringResultV3 from v3 snapshot', () => {
    const row = mockRow({
      v3: {
        score: 10,
        longScore: 10,
        shortScore: 7,
        direction: 'LONG',
        decisionLabel: 'CO_THE_VAO',
        decisionDisplay: 'CÓ THỂ VÀO',
        winrate: '~60%',
        canEnter: true,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'RANGING',
        groupScores: { A: 3, B: 3, C: 4 },
        groupBlocks: [],
      },
      v4: {
        score: 12,
        longScore: 12,
        shortScore: 8,
        direction: 'LONG',
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'VÀO TỰ TIN',
        winrate: '~68%',
        canEnter: true,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'TRENDING',
        groupScores: { A: 4, B: 4, C: 4 },
        groupBlocks: [],
      },
    });
    const native = scoringResultV3FromSignalRow(row, 'v3');
    const viaV4 = scoringResultV3FromSignalRow(row, 'v4');
    expect(native?.long.totalScore).toBe(10);
    expect(viaV4?.long.totalScore).toBe(12);
  });

  it('uses per-direction layers for L8', () => {
    const row = mockRow({
      v3: {
        score: 12,
        longScore: 8,
        shortScore: 11,
        direction: 'SHORT',
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'VÀO TỰ TIN',
        winrate: '~68%',
        canEnter: true,
        layers: [
          {
            layer: 8,
            name: 'L8',
            score: 0,
            maxScore: 1.5,
            passed: false,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: 'SHORT snapshot',
          },
        ],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'TRENDING',
        groupScores: { A: 4, B: 4, C: 4 },
        groupBlocks: [],
        longLayers: [
          {
            layer: 8,
            name: 'L8',
            score: 0,
            maxScore: 1.5,
            passed: false,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: 'BTC 24h -1.5% — đỏ cả 2 khung',
          },
        ],
        shortLayers: [
          {
            layer: 8,
            name: 'L8',
            score: 1.5,
            maxScore: 1.5,
            passed: true,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: 'BTC 24h -1.5% — cùng chiều giảm',
          },
        ],
        longGroupScores: { A: 2, B: 3, C: 3 },
        shortGroupScores: { A: 4, B: 4, C: 3 },
      },
    });
    const result = scoringResultV3FromSignalRow(row, 'v3');
    expect(result?.long.layers.find((l) => l.layerNumber === 8)?.score).toBe(0);
    expect(result?.short.layers.find((l) => l.layerNumber === 8)?.score).toBe(1.5);
    expect(result?.long.layers.find((l) => l.layerNumber === 8)?.reason).toContain('đỏ');
    expect(result?.short.layers.find((l) => l.layerNumber === 8)?.reason).toContain('giảm');
  });
});
