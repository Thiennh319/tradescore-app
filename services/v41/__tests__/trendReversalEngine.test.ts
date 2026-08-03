import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { KlineV41 } from '../indicators';
import {
  computeTrendReversal,
  detectCvdFlip,
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
  resolveTrendReversalState,
  TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
  TREND_REVERSAL_CONFIDENCE_MIN,
  type TrendReversalSignals,
} from '../reversalDetector';
import { adaptTrendReversalResult } from '../foundation/adapters';
import { V41_ENGINE_ID } from '../foundation/engineIds';
import { V41_TREND_REVERSAL_FOUNDATION_STATE } from '../foundation/states';
import { validateV41EngineResult } from '../foundation/engineResult';

vi.mock('../trendExhaustionEngine', () => ({
  calculateTrendExhaustion: vi.fn(),
}));

import { calculateTrendExhaustion } from '../trendExhaustionEngine';

const mockExhaustion = vi.mocked(calculateTrendExhaustion);

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

function buildFlatKlines(
  count: number,
  overrides: Partial<KlineV41> | ((index: number) => Partial<KlineV41>) = {},
): KlineV41[] {
  return Array.from({ length: count }, (_, index) => {
    const patch = typeof overrides === 'function' ? overrides(index) : overrides;
    return buildKline({ openTime: index, closeTime: index + 1, ...patch });
  });
}

/** Hai swing HIGH: older=110, newer=105 → HH→LH (bearish structure break). */
function buildHhLhKlines(count = 30): KlineV41[] {
  const klines = buildFlatKlines(count, { close: 100, high: 101, low: 99, volume: 1000 });
  const olderIdx = count - 12;
  const newerIdx = count - 6;

  klines[olderIdx] = buildKline({
    openTime: olderIdx,
    closeTime: olderIdx + 1,
    open: 108,
    high: 110,
    low: 107,
    close: 109,
    volume: 1000,
    takerBuyVolume: 600,
  });
  for (let i = olderIdx - 3; i <= olderIdx + 3; i++) {
    if (i !== olderIdx) {
      klines[i] = { ...klines[i], high: Math.min(klines[i].high, 108) };
    }
  }

  klines[newerIdx] = buildKline({
    openTime: newerIdx,
    closeTime: newerIdx + 1,
    open: 104,
    high: 105,
    low: 103,
    close: 104,
    volume: 1000,
    takerBuyVolume: 600,
  });
  for (let i = newerIdx - 3; i <= newerIdx + 3; i++) {
    if (i !== newerIdx) {
      klines[i] = { ...klines[i], high: Math.min(klines[i].high, 104) };
    }
  }

  return klines;
}

function applyBearishCvdFlip(klines: KlineV41[]): KlineV41[] {
  const next = [...klines];
  const n = next.length;
  for (let i = n - 3; i < n - 1; i++) {
    next[i] = { ...next[i], takerBuyVolume: 700, volume: 1000 };
  }
  next[n - 1] = {
    ...next[n - 1],
    takerBuyVolume: 200,
    volume: 1000,
  };
  return next;
}

function applyStrongVolume(klines: KlineV41[]): KlineV41[] {
  const next = [...klines];
  const n = next.length;
  next[n - 1] = { ...next[n - 1], volume: 2500 };
  return next;
}

function applyBarelyVolume(klines: KlineV41[]): KlineV41[] {
  const next = [...klines];
  const n = next.length;
  next[n - 1] = { ...next[n - 1], volume: 1220 };
  return next;
}

function buildActiveBullReversalKlines(): KlineV41[] {
  return applyStrongVolume(applyBearishCvdFlip(buildHhLhKlines()));
}

beforeEach(() => {
  mockExhaustion.mockReset();
});

describe('trendReversal helpers', () => {
  it('detectCvdFlip BULL: dương → dương → âm', () => {
    const klines = buildFlatKlines(25, (index) => ({
      takerBuyVolume: index >= 22 ? (index === 24 ? 200 : 700) : 500,
      volume: 1000,
    }));
    expect(detectCvdFlip(klines, 'BULL')).toBe(true);
    expect(detectCvdFlip(klines, 'BEAR')).toBe(false);
  });

  it('detectTrendReversalVolumeConfirmation requires > 1.2× MA20', () => {
    const klines = buildFlatKlines(25, { volume: 1000 });
    klines[24] = buildKline({ volume: 1300 });
    expect(detectTrendReversalVolumeConfirmation(klines).confirmed).toBe(true);

    const weak = buildFlatKlines(25, { volume: 1000 });
    weak[24] = buildKline({ volume: 1200 });
    expect(detectTrendReversalVolumeConfirmation(weak).confirmed).toBe(false);
  });

  it('detectStructureBreak BULL: HH→LH', () => {
    const result = detectStructureBreak(buildHhLhKlines(), 'BULL');
    expect(result.confirmed).toBe(true);
    expect(result.breakType).toBe('HH_LH');
    expect(result.newerSwingPrice).toBeLessThan(result.olderSwingPrice!);
  });
});

describe('resolveTrendReversalState (ACTIVE min signals gate)', () => {
  const allTrue: TrendReversalSignals = {
    cvdFlip: true,
    volumeConfirmation: true,
    trendExhaustion: true,
    structureBreak: true,
  };

  it('config experiment: TREND_REVERSAL_ACTIVE_MIN_SIGNALS === 3', () => {
    expect(TREND_REVERSAL_ACTIVE_MIN_SIGNALS).toBe(3);
    expect(TREND_REVERSAL_CONFIDENCE_MIN).toBe(50);
  });

  it('4/4 + confidence ≥ MIN → ACTIVE', () => {
    expect(resolveTrendReversalState(allTrue, TREND_REVERSAL_CONFIDENCE_MIN)).toBe('ACTIVE');
    expect(resolveTrendReversalState(allTrue, 100)).toBe('ACTIVE');
  });

  it('3/4 (thiếu bất kỳ 1 signal) + confidence ≥ MIN → ACTIVE', () => {
    const missingOne: TrendReversalSignals[] = [
      { ...allTrue, cvdFlip: false },
      { ...allTrue, volumeConfirmation: false },
      { ...allTrue, trendExhaustion: false },
      { ...allTrue, structureBreak: false },
    ];
    for (const signals of missingOne) {
      expect(resolveTrendReversalState(signals, TREND_REVERSAL_CONFIDENCE_MIN)).toBe('ACTIVE');
      expect(resolveTrendReversalState(signals, TREND_REVERSAL_CONFIDENCE_MIN + 5)).toBe(
        'ACTIVE',
      );
    }
  });

  it('3/4 + confidence < MIN → WATCH (confidence gate giữ nguyên)', () => {
    expect(
      resolveTrendReversalState(
        { ...allTrue, structureBreak: false },
        TREND_REVERSAL_CONFIDENCE_MIN - 0.01,
      ),
    ).toBe('WATCH');
  });

  it('2/4 hoặc ít hơn → WATCH dù confidence cao', () => {
    expect(
      resolveTrendReversalState(
        {
          cvdFlip: true,
          volumeConfirmation: true,
          trendExhaustion: false,
          structureBreak: false,
        },
        100,
      ),
    ).toBe('WATCH');
    expect(
      resolveTrendReversalState(
        {
          cvdFlip: true,
          volumeConfirmation: false,
          trendExhaustion: false,
          structureBreak: false,
        },
        100,
      ),
    ).toBe('WATCH');
    expect(
      resolveTrendReversalState(
        {
          cvdFlip: false,
          volumeConfirmation: false,
          trendExhaustion: false,
          structureBreak: false,
        },
        100,
      ),
    ).toBe('WATCH');
  });
});

describe('computeTrendReversal', () => {
  it('đủ 4 điều kiện + confidence ≥ MIN → ACTIVE', () => {
    mockExhaustion.mockReturnValue({
      trendExhaustion: 80,
      rsiExtremeScore: 30,
      distanceEMA20Score: 20,
      volumeDivergencePts: 20,
      candleStreakScore: 10,
    });

    const result = computeTrendReversal({
      klines1H: buildActiveBullReversalKlines(),
      trendDirection: 'BULL',
    });

    expect(result.signals.cvdFlip).toBe(true);
    expect(result.signals.volumeConfirmation).toBe(true);
    expect(result.signals.trendExhaustion).toBe(true);
    expect(result.signals.structureBreak).toBe(true);
    expect(result.detail.confidence).toBeGreaterThanOrEqual(TREND_REVERSAL_CONFIDENCE_MIN);
    expect(result.state).toBe('ACTIVE');
  });

  it('thiếu CVD flip (3/4) + confidence ≥ MIN → ACTIVE (MIN=50; FAIL CVD kéo avg nhưng vẫn ≥50)', () => {
    mockExhaustion.mockReturnValue({
      trendExhaustion: 80,
      rsiExtremeScore: 30,
      distanceEMA20Score: 20,
      volumeDivergencePts: 20,
      candleStreakScore: 10,
    });

    const klines = applyStrongVolume(buildHhLhKlines());
    const result = computeTrendReversal({ klines1H: klines, trendDirection: 'BULL' });
    expect(result.signals.cvdFlip).toBe(false);
    expect(result.detail.activeConditionCount).toBe(3);
    expect(result.detail.confidence).toBeGreaterThanOrEqual(TREND_REVERSAL_CONFIDENCE_MIN);
    expect(result.state).toBe('ACTIVE');
  });

  it('thiếu volume confirmation (3/4) + confidence ≥ MIN → ACTIVE', () => {
    mockExhaustion.mockReturnValue({
      trendExhaustion: 80,
      rsiExtremeScore: 30,
      distanceEMA20Score: 20,
      volumeDivergencePts: 20,
      candleStreakScore: 10,
    });

    const klines = applyBearishCvdFlip(buildHhLhKlines());
    const result = computeTrendReversal({ klines1H: klines, trendDirection: 'BULL' });
    expect(result.signals.volumeConfirmation).toBe(false);
    expect(result.detail.activeConditionCount).toBe(3);
    expect(result.detail.confidence).toBeGreaterThanOrEqual(TREND_REVERSAL_CONFIDENCE_MIN);
    expect(result.state).toBe('ACTIVE');
  });

  it('thiếu trend exhaustion (3/4) + confidence ≥ MIN → ACTIVE', () => {
    mockExhaustion.mockReturnValue({
      // Below TREND_REVERSAL_EXHAUSTION_MIN (28 as of 2026-08-01; was 55)
      trendExhaustion: 20,
      rsiExtremeScore: 10,
      distanceEMA20Score: 10,
      volumeDivergencePts: 0,
      candleStreakScore: 20,
    });

    const result = computeTrendReversal({
      klines1H: buildActiveBullReversalKlines(),
      trendDirection: 'BULL',
    });
    expect(result.signals.trendExhaustion).toBe(false);
    expect(result.detail.activeConditionCount).toBe(3);
    expect(result.detail.confidence).toBeGreaterThanOrEqual(TREND_REVERSAL_CONFIDENCE_MIN);
    expect(result.state).toBe('ACTIVE');
  });

  it('thiếu structure break (3/4) + confidence ≥ MIN → ACTIVE (thử nghiệm min signals=3)', () => {
    mockExhaustion.mockReturnValue({
      trendExhaustion: 100,
      rsiExtremeScore: 30,
      distanceEMA20Score: 30,
      volumeDivergencePts: 20,
      candleStreakScore: 20,
    });

    const flat = applyStrongVolume(applyBearishCvdFlip(buildFlatKlines(30)));
    const result = computeTrendReversal({ klines1H: flat, trendDirection: 'BULL' });
    expect(result.signals.structureBreak).toBe(false);
    expect(result.detail.activeConditionCount).toBe(3);
    expect(result.detail.confidence).toBeGreaterThanOrEqual(TREND_REVERSAL_CONFIDENCE_MIN);
    expect(result.state).toBe('ACTIVE');
  });

  it('đủ 4 điều kiện nhưng confidence vừa dưới MIN → WATCH (gate unit)', () => {
    // Integration fixtures with 4/4 rarely score <50; gate covered via resolveTrendReversalState.
    expect(
      resolveTrendReversalState(
        {
          cvdFlip: true,
          volumeConfirmation: true,
          trendExhaustion: true,
          structureBreak: true,
        },
        TREND_REVERSAL_CONFIDENCE_MIN - 0.01,
      ),
    ).toBe('WATCH');
  });

  it('NEUTRAL trend → WATCH với 0 điều kiện', () => {
    const result = computeTrendReversal({
      klines1H: buildActiveBullReversalKlines(),
      trendDirection: 'NEUTRAL',
    });
    expect(result.state).toBe('WATCH');
    expect(result.detail.activeConditionCount).toBe(0);
  });
});

describe('adaptTrendReversalResult', () => {
  it('maps ACTIVE → V41EngineResult với engineId trend_reversal', () => {
    mockExhaustion.mockReturnValue({
      trendExhaustion: 80,
      rsiExtremeScore: 30,
      distanceEMA20Score: 20,
      volumeDivergencePts: 20,
      candleStreakScore: 10,
    });

    const legacy = computeTrendReversal({
      klines1H: buildActiveBullReversalKlines(),
      trendDirection: 'BULL',
    });
    const envelope = adaptTrendReversalResult(legacy);

    expect(envelope.engineId).toBe(V41_ENGINE_ID.TREND_REVERSAL);
    expect(envelope.version).toBe('4.1');
    expect(envelope.state).toBe(V41_TREND_REVERSAL_FOUNDATION_STATE.ACTIVE);
    expect(validateV41EngineResult(envelope).valid).toBe(true);
    expect(envelope.reviews.length).toBeGreaterThanOrEqual(4);
  });

  it('output không chứa entry / direction / SL / TP', () => {
    mockExhaustion.mockReturnValue({
      trendExhaustion: 80,
      rsiExtremeScore: 30,
      distanceEMA20Score: 20,
      volumeDivergencePts: 20,
      candleStreakScore: 10,
    });

    const envelope = adaptTrendReversalResult(
      computeTrendReversal({
        klines1H: buildActiveBullReversalKlines(),
        trendDirection: 'BULL',
      }),
    );
    const json = JSON.stringify(envelope);
    expect(json).not.toMatch(/"entryPrice"|"stopLoss"|"takeProfit"|"tradePlan"/i);
    expect(envelope.capabilities.canEntry).toBe(false);
    expect(envelope.capabilities.canTradePlan).toBe(false);
  });
});
