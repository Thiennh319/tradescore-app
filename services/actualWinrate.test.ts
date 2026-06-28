import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { FundingState } from '../constants/scoring';
import {
  calculateActualWinrate,
  calculateAllBucketWinrates,
  calculateWinrateByFundingStateAtEntry,
  calculateWinrateBySqueezeLevel,
  scoreInBucket,
  squeezeLevelSampleWarning,
  summarizeFundingStateWinrate,
} from './actualWinrate';

function closedEntry(
  overrides: Partial<AiTradeJournalEntry> & {
    totalScore: number;
    status: 'WIN' | 'LOSS' | 'BREAKEVEN';
    scorerVersion?: 'v3' | 'v4';
  },
): AiTradeJournalEntry {
  const ts = Date.now() - 86_400_000;
  return {
    id: `t_${Math.random()}`,
    timestamp: ts,
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 34,
    market: {
      entryPrice: 100,
      priceAtAnalysis: 100,
      slippage: 0,
      cvdValue: 0,
      cvdTrend: 'FLAT',
      volumeRatio: 1,
      btcChangePct: 0,
      fundingRate: 0,
      topLSRatio: 1,
      oiChangePct: 0,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: overrides.totalScore,
      direction: 'LONG',
      layerScores: {
        l1: 0,
        l2: 0,
        l3: 0,
        l4: 0,
        l5: 0,
        l6: 0,
        l7: 0,
        l8: 0,
        l9: 0,
        l10: 0,
      },
      mandatoryViolations: [],
      decision: 'CO_THE_VAO',
      scorerVersion: overrides.scorerVersion,
    },
    plan: {
      entryZoneType: 'MARKET_NEAR',
      entryZoneOptimal: 100,
      entryZoneRangeLow: 99,
      entryZoneRangeHigh: 101,
      slProposed: 95,
      slActual: 95,
      tp1Proposed: 110,
      tp1Actual: 110,
      tp2: 115,
      tp3: 120,
      rrProposed: 2,
      sizeProposed: 6,
      sizeActual: 6,
      isSafeSL: false,
    },
    outcome: {
      status: overrides.status,
      exitPrice: 105,
      exitTimestamp: ts + 3_600_000,
      pnlUSDT: overrides.status === 'WIN' ? 1 : -1,
      holdingTimeMinutes: 60,
      holdDurationMinutes: 60,
    },
    tags: [],
    version: '1.0.2',
    fundingAtEntry: null,
    fundingVelocityAtEntry: null,
    fundingStateAtEntry: null,
    fundingAtExit: null,
    fundingStateAtExit: null,
    squeezeRiskScoreAtEntry: null,
    squeezeRiskLevelAtEntry: null,
    squeezeRiskDirectionAtEntry: null,
    squeezeRiskScoreAtExit: null,
    squeezeRiskLevelAtExit: null,
    squeezeRiskDirectionAtExit: null,
    ...overrides,
  };
}

describe('actualWinrate', () => {
  it('scoreInBucket phân loại đúng ngưỡng', () => {
    expect(scoreInBucket(8.5, '8-9')).toBe(true);
    expect(scoreInBucket(9.2, '9-10')).toBe(true);
    expect(scoreInBucket(10.5, '10-11.5')).toBe(true);
    expect(scoreInBucket(12, '11.5+')).toBe(true);
    expect(scoreInBucket(9.2, '8-9')).toBe(false);
  });

  it('calculateActualWinrate tính WIN/(WIN+LOSS) và độ lệch', () => {
    const entries = [
      closedEntry({ totalScore: 9.5, status: 'WIN' }),
      closedEntry({ totalScore: 9.2, status: 'WIN' }),
      closedEntry({ totalScore: 9.8, status: 'LOSS' }),
      closedEntry({ totalScore: 10.5, status: 'WIN', scorerVersion: 'v4' }),
    ];

    const r = calculateActualWinrate('9-10', 'all', entries);
    expect(r.totalTrades).toBe(3);
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(1);
    expect(r.winLossCount).toBe(3);
    expect(r.actualWinratePct).toBeCloseTo(66.7, 0);
    expect(r.expectedWinratePct).toBe(65);
    expect(r.deviationPct).toBeCloseTo(1.7, 0);
    expect(r.sampleTooSmall).toBe(true);
  });

  it('lọc theo scorerVersion', () => {
    const entries = [
      closedEntry({ totalScore: 10.2, status: 'WIN', scorerVersion: 'v3' }),
      closedEntry({ totalScore: 10.4, status: 'LOSS', scorerVersion: 'v4' }),
    ];
    const v3 = calculateActualWinrate('10-11.5', 'v3', entries);
    const v4 = calculateActualWinrate('10-11.5', 'v4', entries);
    expect(v3.totalTrades).toBe(1);
    expect(v3.wins).toBe(1);
    expect(v4.totalTrades).toBe(1);
    expect(v4.losses).toBe(1);
  });

  it('calculateAllBucketWinrates trả đủ 4 bucket', () => {
    const rows = calculateAllBucketWinrates([], 'all');
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.totalTrades === 0)).toBe(true);
  });

  it('winrate theo fundingStateAtEntry — chỉ V4', () => {
    const entries = [
      closedEntry({
        totalScore: 10,
        status: 'WIN',
        scorerVersion: 'v4',
        fundingStateAtEntry: FundingState.SHORT_SQUEEZE_BUILDING,
      }),
      closedEntry({
        totalScore: 10,
        status: 'LOSS',
        scorerVersion: 'v4',
        fundingStateAtEntry: FundingState.SHORT_SQUEEZE_BUILDING,
      }),
      closedEntry({ totalScore: 9, status: 'WIN', scorerVersion: 'v3' }),
    ];
    const rows = calculateWinrateByFundingStateAtEntry(entries, 'all');
    const squeeze = rows.find(
      (r) => r.fundingState === FundingState.SHORT_SQUEEZE_BUILDING,
    );
    expect(squeeze?.totalTrades).toBe(2);
    expect(squeeze?.actualWinratePct).toBe(50);
    expect(squeeze?.naCount).toBe(1);
  });

  it('engine V3 → funding winrate N/A', () => {
    const rows = calculateWinrateByFundingStateAtEntry(
      [closedEntry({ totalScore: 10, status: 'WIN', scorerVersion: 'v3' })],
      'v3',
    );
    expect(rows.every((r) => r.actualWinratePct == null)).toBe(true);
    const summary = summarizeFundingStateWinrate(
      rows,
      FundingState.SHORT_SQUEEZE_BUILDING,
    );
    expect(summary.isNA).toBe(true);
  });

  it('calculateWinrateBySqueezeLevel — LOW 100%, HIGH 0%, MEDIUM chưa đủ mẫu', () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) =>
        closedEntry({
          totalScore: 10,
          status: 'WIN',
          scorerVersion: 'v4',
          squeezeRiskLevelAtEntry: 'LOW',
          id: `low_win_${i}`,
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        closedEntry({
          totalScore: 10,
          status: 'LOSS',
          scorerVersion: 'v4',
          squeezeRiskLevelAtEntry: 'HIGH',
          id: `high_loss_${i}`,
        }),
      ),
    ];
    const rows = calculateWinrateBySqueezeLevel(entries, 'v4');
    const low = rows.find((r) => r.level === 'LOW');
    const high = rows.find((r) => r.level === 'HIGH');
    const medium = rows.find((r) => r.level === 'MEDIUM');
    expect(low?.actualWinratePct).toBe(100);
    expect(high?.actualWinratePct).toBe(0);
    expect(medium?.totalTrades).toBe(0);
    expect(medium?.sampleTooSmall).toBe(true);
    expect(squeezeLevelSampleWarning(medium!.totalTrades)).toBe('⚠️ Chưa đủ mẫu (n=0)');
  });
});
