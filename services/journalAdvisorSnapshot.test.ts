import { describe, expect, it } from 'vitest';
import { CVD_RECOVERING_SOFT_WARNING } from './indicators';
import { resolveJournalAdvisorSnapshot } from './journalAdvisorSnapshot';
import type { SignalRow } from './signalBoardScan';

function baseRow(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 65000,
    change24h: 1,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score: 8.3,
    longScore: 8.3,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CHO_THEM',
    decisionDisplay: 'Chờ thêm',
    winrate: '~55%',
    canEnter: false,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    ...overrides,
  };
}

describe('resolveJournalAdvisorSnapshot', () => {
  it('stores LONG 8.3/15 from V4 snapshot (no STRONG prefix)', () => {
    const row = baseRow({
      v4: {
        score: 8.3,
        longScore: 8.3,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'CHO_THEM',
        decisionDisplay: 'Chờ thêm',
        winrate: '~55%',
        canEnter: false,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'RANGING',
        groupScores: { A: 2, B: 2, C: 2 },
      },
    });

    const snap = resolveJournalAdvisorSnapshot({
      row,
      strategySource: 'V4',
    });

    expect(snap).toEqual({
      recommendationLabel: 'LONG 8.3/15',
      score: 8.3,
      marketState: 'RANGING',
    });
  });

  it('stores STRONG LONG 10.2/15 when scorer decision is VAO_TU_TIN', () => {
    const row = baseRow({
      score: 10.2,
      longScore: 10.2,
      decisionLabel: 'VAO_TU_TIN',
      v4: {
        score: 10.2,
        longScore: 10.2,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'Vào tự tin',
        winrate: '~70%',
        canEnter: true,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'TRENDING',
        groupScores: { A: 3, B: 3, C: 2 },
      },
    });

    const snap = resolveJournalAdvisorSnapshot({
      row,
      strategySource: 'V4',
    });

    expect(snap?.recommendationLabel).toBe('STRONG LONG 10.2/15');
    expect(snap?.score).toBe(10.2);
    expect(snap?.marketState).toBe('TRENDING');
  });

  it('stores RECOVERING LONG 9.5/15 for CVDX when recovering warning exists', () => {
    const row = baseRow({
      score: 9.5,
      longScore: 9.5,
      decisionLabel: 'CO_THE_VAO',
      v4: {
        score: 9.5,
        longScore: 9.5,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'CO_THE_VAO',
        decisionDisplay: 'Có thể vào',
        winrate: '~65%',
        canEnter: true,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'TRENDING',
        groupScores: { A: 3, B: 2, C: 2 },
        longWarnings: [CVD_RECOVERING_SOFT_WARNING],
      },
    });

    const snap = resolveJournalAdvisorSnapshot({
      row,
      strategySource: 'CVDX',
    });

    expect(snap?.recommendationLabel).toBe('RECOVERING LONG 9.5/15');
    expect(snap?.score).toBe(9.5);
    expect(snap?.marketState).toBe('TRENDING');
  });

  it('uses V3 engine path when strategySource is V3', () => {
    const row = baseRow({
      v3: {
        score: 9,
        longScore: 9,
        shortScore: 5,
        direction: 'LONG',
        decisionLabel: 'CO_THE_VAO',
        decisionDisplay: 'Có thể vào',
        winrate: '~65%',
        canEnter: true,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'RANGING',
        groupScores: { A: 2, B: 2, C: 2 },
      },
    });

    const snap = resolveJournalAdvisorSnapshot({
      row,
      strategySource: 'V3',
    });

    expect(snap?.recommendationLabel).toBe('LONG 9.0/15');
    expect(snap?.marketState).toBe('RANGING');
  });
});

describe('buildSnapshotsFromSignalRow advisor fields', () => {
  it('persists recommendationLabel, score, marketState on scoring snapshot', async () => {
    const { buildSnapshotsFromSignalRow } = await import('./journalService');
    const row = baseRow({
      v4: {
        score: 10.2,
        longScore: 10.2,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'Vào tự tin',
        winrate: '~70%',
        canEnter: true,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        marketMode: 'TRENDING',
        groupScores: { A: 3, B: 3, C: 2 },
      },
    });

    const snapshots = buildSnapshotsFromSignalRow({
      row,
      entryPrice: 65000,
      sizeActual: 10,
      planSource: 'v4',
      scorerVersion: 'v4',
      strategySource: 'V4',
    });

    expect(snapshots.scoring.recommendationLabel).toBe('STRONG LONG 10.2/15');
    expect(snapshots.scoring.score).toBe(10.2);
    expect(snapshots.scoring.marketState).toBe('TRENDING');
  });
});
