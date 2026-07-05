import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import {
  computeV41Analytics,
  formatV41AnalyticsSummary,
  isV41JournalEntry,
} from '../analyticsV41';

function baseJournalEntry(
  overrides: Partial<AiTradeJournalEntry> & {
    win?: boolean;
    marketState?: string;
    qualityLabel?: string;
    entryQuality?: number;
    confidence?: number;
    rr?: number;
    scorerVersion?: string;
    tags?: string[];
  } = {},
): AiTradeJournalEntry {
  const win = overrides.win ?? false;
  const marketState = overrides.marketState ?? 'HealthyUptrend';
  const entryQuality = overrides.entryQuality ?? 80;
  const confidence = overrides.confidence ?? 72;
  const qualityLabel = overrides.qualityLabel ?? 'Trade Ready';
  const rr = overrides.rr ?? 2.5;
  const scorerVersion = overrides.scorerVersion ?? 'v41';

  const v41Snapshot = JSON.stringify({
    marketState,
    marketConfidence: confidence,
    entryQuality,
    qualityLabel,
    riskRewardRatio: rr,
  });

  const tags = overrides.tags ?? [
    'v41',
    `entryQualityV41:${entryQuality}`,
    `marketStateV41:${marketState}`,
    `confidenceV41:${confidence}`,
    `v41Snapshot:${v41Snapshot}`,
  ];

  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: overrides.timestamp ?? Date.now(),
    symbol: overrides.symbol ?? 'NEARUSDT',
    accountSizeAtEntry: 100,
    market: {
      entryPrice: 2,
      priceAtAnalysis: 2,
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
      ...overrides.market,
    },
    scoring: {
      totalScore: entryQuality,
      score: entryQuality,
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
      decision: 'V4.1',
      scorerVersion: scorerVersion as 'v4',
      marketState,
      recommendationLabel: qualityLabel,
      ...overrides.scoring,
    },
    plan: {
      entryZoneType: 'MARKET_NEAR',
      entryZoneOptimal: 2,
      entryZoneRangeLow: 2,
      entryZoneRangeHigh: 2,
      slProposed: 1.9,
      slActual: 1.9,
      tp1Proposed: 2.2,
      tp1Actual: 2.2,
      tp2: 2.4,
      tp3: 2.6,
      rrProposed: rr,
      sizeProposed: 6,
      sizeActual: 6,
      isSafeSL: true,
      openReason: 'V4.1 test',
      ...overrides.plan,
    },
    outcome: {
      status: win ? 'WIN' : 'LOSS',
      pnlUSDT: win ? 1.5 : -1,
      ...overrides.outcome,
    },
    tags,
    version: '1.0.3',
    ...overrides,
  };
}

describe('isV41JournalEntry', () => {
  it('nhận diện scorerVersion v41 và tag v41', () => {
    expect(isV41JournalEntry(baseJournalEntry())).toBe(true);
    expect(
      isV41JournalEntry(
        baseJournalEntry({
          scorerVersion: 'v4',
          tags: ['v41'],
        }),
      ),
    ).toBe(true);
    expect(
      isV41JournalEntry(
        baseJournalEntry({
          scorerVersion: 'v4',
          tags: [],
        }),
      ),
    ).toBe(false);
  });
});

describe('computeV41Analytics', () => {
  it('entries rỗng → totalTrades 0', () => {
    const result = computeV41Analytics([]);
    expect(result.totalTrades).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.bestMarketState).toBeNull();
  });

  it('3 entries V4.1, 2 win → winRate 66.7%', () => {
    const entries = [
      baseJournalEntry({ id: 'a', win: true }),
      baseJournalEntry({ id: 'b', win: true }),
      baseJournalEntry({ id: 'c', win: false }),
    ];

    const result = computeV41Analytics(entries);
    expect(result.totalTrades).toBe(3);
    expect(result.winRate).toBe(66.7);
    expect(result.avgEntryQuality).toBe(80);
  });

  it('entries V3/V4 bị lọc ra', () => {
    const entries = [
      baseJournalEntry({ id: 'v41', win: true }),
      baseJournalEntry({
        id: 'v4',
        scorerVersion: 'v4',
        tags: [],
      }),
    ];

    const result = computeV41Analytics(entries);
    expect(result.totalTrades).toBe(1);
    expect(result.winRate).toBe(100);
  });

  it('byMarketState đúng count', () => {
    const entries = [
      baseJournalEntry({ id: '1', marketState: 'HealthyUptrend', win: true }),
      baseJournalEntry({ id: '2', marketState: 'HealthyUptrend', win: false }),
      baseJournalEntry({ id: '3', marketState: 'StrongUptrend', win: true }),
    ];

    const result = computeV41Analytics(entries);
    expect(result.byMarketState.HealthyUptrend.count).toBe(2);
    expect(result.byMarketState.HealthyUptrend.wins).toBe(1);
    expect(result.byMarketState.HealthyUptrend.winRate).toBe(50);
    expect(result.byMarketState.StrongUptrend.count).toBe(1);
    expect(result.byMarketState.StrongUptrend.winRate).toBe(100);
  });

  it('bestMarketState đúng khi ≥ 3 trades', () => {
    const entries = [
      ...Array.from({ length: 3 }).map((_, i) =>
        baseJournalEntry({
          id: `good-${i}`,
          marketState: 'StrongUptrend',
          win: true,
        }),
      ),
      ...Array.from({ length: 3 }).map((_, i) =>
        baseJournalEntry({
          id: `bad-${i}`,
          marketState: 'Distribution',
          win: false,
        }),
      ),
    ];

    const result = computeV41Analytics(entries);
    expect(result.bestMarketState).toBe('StrongUptrend');
    expect(result.worstMarketState).toBe('Distribution');
  });
});

describe('formatV41AnalyticsSummary', () => {
  it('trả về các dòng tóm tắt', () => {
    const analytics = computeV41Analytics([
      baseJournalEntry({ win: true }),
      baseJournalEntry({ win: false }),
    ]);

    const lines = formatV41AnalyticsSummary(analytics);
    expect(lines[0]).toBe('Tổng lệnh V4.1: 2');
    expect(lines[1]).toBe('Win rate: 50%');
    expect(lines[2]).toBe('EQ trung bình: 80/100');
    expect(lines[4]).toBe('R:R trung bình: 2.5×');
  });
});
