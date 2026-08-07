import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTradeJournalEntry } from '../../../store/useTradeStore';
import type { MarketIntelligenceSnapshot } from '../types';

const { journalRef, v41StoreRef } = vi.hoisted(() => ({
  journalRef: { entries: [] as StoredTradeJournalEntry[] },
  v41StoreRef: {
    previousMode: 'INACTIVE' as const,
    updateSymbolState: vi.fn(),
    setScanning: vi.fn(),
  },
}));

vi.mock('../../../store/useTradeStore', () => ({
  useTradeStore: {
    getState: () => ({
      tradeJournal: journalRef.entries,
    }),
  },
}));

vi.mock('../../../store/useV41Store', () => ({
  useV41Store: {
    getState: () => ({
      getSymbolState: () => ({ previousMode: v41StoreRef.previousMode }),
      updateSymbolState: v41StoreRef.updateSymbolState,
      setScanning: v41StoreRef.setScanning,
    }),
  },
}));

const fetchRawMarketV41 = vi.fn();
const runMarketIntelligenceLayer = vi.fn();

vi.mock('../rawMarketFetcher', () => ({
  fetchRawMarketV41: (...args: unknown[]) => fetchRawMarketV41(...args),
}));

vi.mock('../marketIntelligenceLayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../marketIntelligenceLayer')>();
  return {
    ...actual,
    runMarketIntelligenceLayer: (...args: unknown[]) => runMarketIntelligenceLayer(...args),
  };
});

import { resolvePositionState, scanV41 } from '../scanV41';

function journalEntry(
  overrides: Partial<StoredTradeJournalEntry> &
    Pick<StoredTradeJournalEntry, 'symbol' | 'direction' | 'status'>,
): StoredTradeJournalEntry {
  return {
    id: overrides.id ?? 'test-id',
    symbol: overrides.symbol,
    direction: overrides.direction,
    status: overrides.status,
    entryPrice: overrides.entryPrice ?? 100,
    entryTime: overrides.entryTime ?? Date.now(),
    leverage: overrides.leverage ?? 5,
    size: overrides.size ?? 6,
    ...overrides,
  };
}

describe('resolvePositionState', () => {
  beforeEach(() => {
    journalRef.entries.length = 0;
  });

  it('Case A — có OPEN position → hasOpenPosition true, openDirection LONG', () => {
    journalRef.entries.push(
      journalEntry({
        symbol: 'NEARUSDT',
        status: 'OPEN',
        direction: 'LONG',
      }),
    );

    const state = resolvePositionState('NEARUSDT');
    expect(state.hasOpenPosition).toBe(true);
    expect(state.openDirection).toBe('LONG');
    expect(state.symbol).toBe('NEARUSDT');
  });

  it('Case B — không có OPEN → hasOpenPosition false, openDirection null', () => {
    expect(journalRef.entries).toHaveLength(0);

    const state = resolvePositionState('NEARUSDT');
    expect(state.hasOpenPosition).toBe(false);
    expect(state.openDirection).toBeNull();
    expect(state.symbol).toBeNull();
  });

  it('Case C — OPEN entry symbol khác → NEARUSDT hasOpenPosition false', () => {
    journalRef.entries.push(
      journalEntry({
        symbol: 'SOLUSDT',
        status: 'OPEN',
        direction: 'LONG',
      }),
    );

    const state = resolvePositionState('NEARUSDT');
    expect(state.hasOpenPosition).toBe(false);
    expect(state.openDirection).toBeNull();
    expect(state.symbol).toBeNull();
  });
});

function miSnapshot(overrides: Partial<MarketIntelligenceSnapshot> = {}): MarketIntelligenceSnapshot {
  return {
    trendStrength: 80,
    trendDirection: 'NEUTRAL',
    trendExhaustion: 25,
    volumeDivergencePts: 0,
    reversalProbability: 30,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 0,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'Transition',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

describe('scanV41 — Bước 3 opportunity', () => {
  beforeEach(() => {
    journalRef.entries.length = 0;
    v41StoreRef.previousMode = 'INACTIVE';
    v41StoreRef.updateSymbolState.mockClear();
    v41StoreRef.setScanning.mockClear();
    fetchRawMarketV41.mockReset();
    runMarketIntelligenceLayer.mockReset();

    fetchRawMarketV41.mockResolvedValue({
      symbol: 'NEARUSDT',
      klines: [],
      btcKlines: [],
      fetchedAt: 1_700_000_000_000,
    });
  });

  it('WATCH_MODE → opportunity defined', async () => {
    runMarketIntelligenceLayer.mockReturnValue(
      miSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        trendStrength: 80,
        marketConfidence: 72,
        reversalProbability: 30,
      }),
    );

    const [row] = await scanV41(['NEARUSDT']);

    expect(row.visibilityMode).toBe('TRADE_MODE');
    expect(row.opportunity).toBeDefined();
    expect(row.opportunity?.entryQualityLong).toBe(92);
    expect(row.opportunity?.entryQualityShort).toBe(62);
  });

  it('INACTIVE → opportunity undefined', async () => {
    runMarketIntelligenceLayer.mockReturnValue(
      miSnapshot({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 10,
        trendExhaustion: 10,
        reversalProbability: 20,
        marketConfidence: 0,
      }),
    );

    const [row] = await scanV41(['NEARUSDT']);

    expect(row.visibilityMode).toBe('INACTIVE');
    expect(row.opportunity).toBeUndefined();
  });

  it('opportunity.opportunityValid đúng theo entry_quality ≥ 70', async () => {
    runMarketIntelligenceLayer.mockReturnValue(
      miSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        trendStrength: 80,
        marketConfidence: 72,
        reversalProbability: 30,
      }),
    );

    const [highQuality] = await scanV41(['NEARUSDT']);
    expect(highQuality.opportunity?.entryQuality).toBe(92);
    expect(highQuality.opportunity?.opportunityValid).toBe(true);

    runMarketIntelligenceLayer.mockReturnValue(
      miSnapshot({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 20,
        trendExhaustion: 25,
        reversalProbability: 55,
        marketConfidence: 10,
      }),
    );
    v41StoreRef.previousMode = 'WATCH_MODE';

    const [lowQuality] = await scanV41(['NEARUSDT']);
    expect(lowQuality.visibilityMode).toBe('WATCH_MODE');
    expect(lowQuality.opportunity).toBeDefined();
    expect(lowQuality.opportunity?.entryQuality).toBeLessThan(70);
    expect(lowQuality.opportunity?.opportunityValid).toBe(false);
  });

  it('markPrice prefers raw.liveMarkPrice over last closed 4H close', async () => {
    runMarketIntelligenceLayer.mockReturnValue(
      miSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        trendStrength: 80,
        marketConfidence: 72,
        reversalProbability: 30,
      }),
    );
    fetchRawMarketV41.mockResolvedValue({
      symbol: 'NEARUSDT',
      klines: [
        {
          openTime: 1,
          open: 1.64,
          high: 1.65,
          low: 1.63,
          close: 1.642,
          volume: 1,
          takerBuyVolume: 0.5,
          closeTime: 2,
        },
      ],
      btcKlines: [],
      klines30M: [],
      klines1H: [],
      btcKlines1H: [],
      liveMarkPrice: 1.635,
      fetchedAt: 1_700_000_000_000,
    });

    const [row] = await scanV41(['NEARUSDT']);
    expect(row.markPrice).toBe(1.635);
  });

  it('missing liveMarkPrice → closed-4H markPrice + console.warn (not silent)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    runMarketIntelligenceLayer.mockReturnValue(
      miSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        trendStrength: 80,
        marketConfidence: 72,
        reversalProbability: 30,
      }),
    );
    fetchRawMarketV41.mockResolvedValue({
      symbol: 'NEARUSDT',
      klines: [
        {
          openTime: 1,
          open: 1.64,
          high: 1.65,
          low: 1.63,
          close: 1.642,
          volume: 1,
          takerBuyVolume: 0.5,
          closeTime: 2,
        },
      ],
      btcKlines: [],
      klines30M: [],
      klines1H: [],
      btcKlines1H: [],
      // liveMarkPrice absent — both ticker+forming failed at fetch layer
      fetchedAt: 1_700_000_000_000,
    });

    const [row] = await scanV41(['NEARUSDT']);
    expect(row.markPrice).toBe(1.642);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/markPrice fallback to closed-4H close=1\.642 for NEARUSDT/),
    );
    warn.mockRestore();
  });
});
