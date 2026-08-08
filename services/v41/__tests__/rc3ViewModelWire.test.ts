import { describe, expect, it, vi } from 'vitest';
import type { KlineV41 } from '../indicators';
import {
  buildRc3ViewModelFromRow,
  buildRc3ViewModelsFromScan,
} from '../rc3/buildRc3ViewModel';
import type { SignalRowV41 } from '../scanV41';
import { createNeutralSnapshot } from '../marketIntelligenceLayer';

vi.mock('../trendExhaustionEngine', () => ({
  calculateTrendExhaustion: vi.fn(() => ({
    trendExhaustion: 10,
    exhaustionType: null,
  })),
}));

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(count: number): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({ openTime: index, closeTime: index + 1 }),
  );
}

function baseRow(overrides: Partial<SignalRowV41> = {}): SignalRowV41 {
  return {
    symbol: 'BTCUSDT',
    snapshot: {
      ...createNeutralSnapshot(),
      trendDirection: 'NEUTRAL',
    },
    visibilityMode: 'INACTIVE',
    markPrice: 65000,
    klines1H: buildFlatKlines(30),
    klines4H: buildFlatKlines(70),
    btcKlines4H: buildFlatKlines(70),
    fundingRate: 0.0001,
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe('Task 10 — RC3 ViewModel wire', () => {
  it('maps scan row → ViewModel without throwing', () => {
    const card = buildRc3ViewModelFromRow(baseRow());
    expect(card.symbol).toBe('BTCUSDT');
    expect(card.displayName).toBe('BTC');
    expect(['LONG', 'SHORT', 'WATCH', 'IGNORE']).toContain(card.decision);
    expect(card.checklist).toHaveLength(4);
    expect(card.checklist.map((c) => c.label)).toEqual([
      'CVD Flip',
      'Volume Confirm',
      'Structure Break',
      'Exhaustion',
    ]);
    expect(card.checklist.map((c) => c.id)).toEqual([
      'cvd_flip',
      'volume',
      'structure',
      'exhaustion',
    ]);
    expect(card.gate).toMatchObject({
      signalsRequired: 3,
      signalsTotal: 4,
      confidenceMin: 50,
    });
    expect(card.gate.activeEligible).toBe(
      card.gate.signalsMet && card.gate.confidenceMet,
    );
  });

  it('gate activeEligible is ≥3/4 signals AND confidenceTr ≥ min — not every()', () => {
    const card = buildRc3ViewModelFromRow(baseRow());
    const passed = card.checklist.filter((c) => c.passed).length;
    expect(card.gate.signalsPassed).toBe(passed);
    expect(card.gate.signalsMet).toBe(passed >= card.gate.signalsRequired);
    expect(card.gate.activeEligible).toBe(
      card.gate.signalsMet && card.gate.confidenceMet,
    );
    // Title/badge logic must NOT require all 4 checklist items.
    const everyFour = card.checklist.every((c) => c.passed);
    if (card.gate.activeEligible) {
      expect(card.gate.signalsPassed).toBeGreaterThanOrEqual(3);
      // 3/4 can be active without every() === true
      if (card.gate.signalsPassed === 3) {
        expect(everyFour).toBe(false);
      }
    }
  });

  it('error row → IGNORE, no levels', () => {
    const card = buildRc3ViewModelFromRow(
      baseRow({ error: 'fetch failed', klines1H: [] }),
    );
    expect(card.decision).toBe('IGNORE');
    expect(card.levels).toBeNull();
    expect(card.gate.activeEligible).toBe(false);
  });

  it('LONG/SHORT buttons gated by decision — levels only when tradable', () => {
    const card = buildRc3ViewModelFromRow(baseRow());
    if (card.decision === 'LONG' || card.decision === 'SHORT') {
      expect(card.levels).not.toBeNull();
    } else {
      expect(card.levels).toBeNull();
    }
  });

  it('batch preserves RC3 symbol order', () => {
    const cards = buildRc3ViewModelsFromScan([
      baseRow({ symbol: 'NEARUSDT' }),
      baseRow({ symbol: 'BTCUSDT' }),
    ]);
    expect(cards.map((c) => c.displayName)).toEqual(['BTC', 'SOL', 'BNB', 'NEAR', 'XRP']);
  });

  it('wire module calls engines but UI types stay ViewModel-shaped', () => {
    const card = buildRc3ViewModelFromRow(baseRow());
    expect(card).toHaveProperty('triggerType');
    expect(card).toHaveProperty('confidence');
    expect(card).toHaveProperty('gate');
    expect(card).toHaveProperty('checklist');
    expect(card).toHaveProperty('levels');
    expect(card).toHaveProperty('decision');
  });
});
