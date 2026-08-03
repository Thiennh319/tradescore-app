import { describe, expect, it } from 'vitest';
import type { BreakoutTradeLevels } from '../../breakoutDetector';
import { createNeutralSnapshot } from '../../marketIntelligenceLayer';
import type { SignalRowV41 } from '../../scanV41';
import {
  adaptBreakoutToRc3Card,
  BREAKOUT_CHECKLIST_IDS,
  BREAKOUT_GATE_SIGNALS_REQUIRED,
} from '../adaptBreakoutToRc3Card';

/**
 * Fixture inspired by Confirm B + ATR SL research (NEAR-style levels).
 * Geometry only — not a live API replay.
 */
function nearConfirmBLongLevels(): BreakoutTradeLevels {
  const entry = 2.45;
  const atr = 0.08;
  const sl = entry - atr * 1.0; // atr_break_level ×1.0
  const risk = entry - sl;
  const tp1 = entry + risk * 1.5;
  return {
    side: 'LONG',
    entry,
    sl,
    tp1,
    slDistancePct: (risk / entry) * 100,
    tp1RR: 1.5,
    rangeHigh: 2.44,
    rangeLow: 2.3,
    confirmMode: 'retest',
    consolidationMode: 'width',
    breakoutOpenTime: 1_700_000_000_000,
    activeOpenTime: 1_700_003_600_000,
  };
}

function nearRow(overrides: Partial<SignalRowV41> = {}): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    snapshot: createNeutralSnapshot(),
    visibilityMode: 'WATCH_MODE',
    markPrice: 2.45,
    fetchedAt: 1_720_000_000_000,
    ...overrides,
  };
}

describe('adaptBreakoutToRc3Card', () => {
  it('maps Confirm B levels → LONG card with Breakout Confirmed trigger', () => {
    const levels = nearConfirmBLongLevels();
    const card = adaptBreakoutToRc3Card(levels, nearRow());

    expect(card.symbol).toBe('NEARUSDT');
    expect(card.displayName).toBe('NEAR');
    expect(card.triggerType).toBe('Breakout Confirmed');
    expect(card.decision).toBe('LONG');
    expect(card.confidence).toBeNull();
    expect(card.fetchedAt).toBe(1_720_000_000_000);

    expect(card.levels).toEqual({
      entry: levels.entry,
      stop: levels.sl,
      tp1: levels.tp1,
      tp2: levels.tp1,
      tp3: levels.tp1,
      rr: 1.5,
    });

    expect(card.checklist).toHaveLength(4);
    expect(card.checklist.map((c) => c.id)).toEqual([...BREAKOUT_CHECKLIST_IDS]);
    expect(card.checklist.every((c) => c.passed)).toBe(true);

    expect(card.gate).toMatchObject({
      signalsPassed: BREAKOUT_GATE_SIGNALS_REQUIRED,
      signalsRequired: BREAKOUT_GATE_SIGNALS_REQUIRED,
      signalsTotal: 4,
      confidenceTr: null,
      confidenceMin: 0,
      signalsMet: true,
      confidenceMet: true,
      activeEligible: true,
    });
  });

  it('maps SHORT side → SHORT decision', () => {
    const long = nearConfirmBLongLevels();
    const short: BreakoutTradeLevels = {
      ...long,
      side: 'SHORT',
      sl: long.entry + 0.08,
      tp1: long.entry - 0.08 * 1.5,
    };
    const card = adaptBreakoutToRc3Card(short, nearRow());
    expect(card.decision).toBe('SHORT');
    expect(card.levels?.stop).toBe(short.sl);
    expect(card.levels?.tp1).toBe(short.tp1);
  });

  it('null levels → WATCH, no trigger, empty checklist pass', () => {
    const card = adaptBreakoutToRc3Card(null, nearRow());
    expect(card.decision).toBe('WATCH');
    expect(card.triggerType).toBeNull();
    expect(card.levels).toBeNull();
    expect(card.confidence).toBeNull();
    expect(card.checklist.every((c) => c.passed)).toBe(false);
    expect(card.gate.activeEligible).toBe(false);
  });

  it('row.error → IGNORE regardless of levels', () => {
    const card = adaptBreakoutToRc3Card(nearConfirmBLongLevels(), nearRow({ error: 'fetch failed' }));
    expect(card.decision).toBe('IGNORE');
    expect(card.levels).toBeNull();
    expect(card.triggerType).toBeNull();
  });
});
