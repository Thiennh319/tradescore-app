import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlineV41 } from '../indicators';
import {
  createNeutralSnapshot,
  resolveAltBtcAlignmentFactor,
  runMarketIntelligenceLayer,
} from '../marketIntelligenceLayer';
import type { MarketIntelligenceSnapshot } from '../types';

vi.mock('../trendStrengthEngine', () => ({
  calculateTrendStrength: vi.fn(),
}));

vi.mock('../trendExhaustionEngine', () => ({
  calculateTrendExhaustion: vi.fn(),
}));

vi.mock('../reversalProbabilityEngine', () => ({
  calculateReversalProbability: vi.fn(),
}));

vi.mock('../btcContextBuilder', () => ({
  buildBTCContext: vi.fn(),
}));

vi.mock('../marketStateEngine', () => ({
  calculateMarketState: vi.fn(),
}));

import { calculateTrendStrength } from '../trendStrengthEngine';
import { calculateTrendExhaustion } from '../trendExhaustionEngine';
import { calculateReversalProbability } from '../reversalProbabilityEngine';
import { buildBTCContext } from '../btcContextBuilder';
import { calculateMarketState } from '../marketStateEngine';

const mockKlines = [{ close: 1 }] as KlineV41[];
const mockBtcKlines = [{ close: 2 }] as KlineV41[];

const SNAPSHOT_KEYS: (keyof MarketIntelligenceSnapshot)[] = [
  'trendStrength',
  'trendDirection',
  'trendExhaustion',
  'volumeDivergencePts',
  'reversalProbability',
  'rsiDivergenceScore',
  'cvdDivergenceScore',
  'marketConfidence',
  'btcAlignmentFactor',
  'btcDirection',
  'marketState',
  'scanTimestamp',
];

function stubEnginesSuccess(overrides?: {
  trendDirection?: 'BULL' | 'BEAR' | 'NEUTRAL';
  btcDirection?: 'BULL' | 'BEAR' | 'NEUTRAL';
}) {
  const trendDirection = overrides?.trendDirection ?? 'BULL';
  const btcDirection = overrides?.btcDirection ?? 'BULL';

  vi.mocked(calculateTrendStrength).mockReturnValue({
    trendStrength: 80,
    trendDirection,
    emaAlignmentScore: 40,
    adxScore: 25,
    slopeScore: 15,
  });

  vi.mocked(calculateTrendExhaustion).mockReturnValue({
    trendExhaustion: 25,
    rsiExtremeScore: 10,
    distanceEMA20Score: 10,
    volumeDivergencePts: 0,
    candleStreakScore: 5,
  });

  vi.mocked(calculateReversalProbability).mockReturnValue({
    reversalProbability: 55,
    rsiDivergenceScore: 50,
    cvdDivergenceScore: 0,
  });

  vi.mocked(buildBTCContext).mockReturnValue({
    btcTrendStrength: 85,
    btcDirection,
    btcStrengthBand: 'strong',
    btcAlignmentFactor: 0.75,
  });

  vi.mocked(calculateMarketState).mockReturnValue('HealthyUptrend');
}

describe('resolveAltBtcAlignmentFactor', () => {
  it.each([
    ['BULL', 'BULL', 1.0],
    ['BULL', 'NEUTRAL', 0.75],
    ['BULL', 'BEAR', 0.5],
    ['BEAR', 'BEAR', 1.0],
    ['BEAR', 'NEUTRAL', 0.75],
    ['BEAR', 'BULL', 0.5],
    ['NEUTRAL', 'BULL', 0.75],
    ['NEUTRAL', 'BEAR', 0.75],
    ['NEUTRAL', 'NEUTRAL', 0.75],
  ] as const)('alt %s + btc %s → %s', (alt, btc, expected) => {
    expect(resolveAltBtcAlignmentFactor(alt, btc)).toBe(expected);
  });
});

describe('runMarketIntelligenceLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns snapshot with all MarketIntelligenceSnapshot fields', () => {
    stubEnginesSuccess();
    const snap = runMarketIntelligenceLayer(mockKlines, mockBtcKlines);

    for (const key of SNAPSHOT_KEYS) {
      expect(snap).toHaveProperty(key);
    }
    expect(snap.trendStrength).toBe(80);
    expect(snap.trendDirection).toBe('BULL');
    expect(snap.trendExhaustion).toBe(25);
    expect(snap.volumeDivergencePts).toBe(0);
    expect(snap.reversalProbability).toBe(55);
    expect(snap.rsiDivergenceScore).toBe(50);
    expect(snap.cvdDivergenceScore).toBe(0);
    expect(snap.marketState).toBe('HealthyUptrend');
    expect(snap.btcDirection).toBe('BULL');
  });

  it('scanTimestamp > 0', () => {
    stubEnginesSuccess();
    const before = Date.now();
    const snap = runMarketIntelligenceLayer(mockKlines, mockBtcKlines);
    const after = Date.now();

    expect(snap.scanTimestamp).toBeGreaterThan(0);
    expect(snap.scanTimestamp).toBeGreaterThanOrEqual(before);
    expect(snap.scanTimestamp).toBeLessThanOrEqual(after);
  });

  it('computes marketConfidence from engines and btcAlignmentFactor', () => {
    stubEnginesSuccess({ trendDirection: 'BULL', btcDirection: 'BULL' });
    const snap = runMarketIntelligenceLayer(mockKlines, mockBtcKlines);

    expect(snap.btcAlignmentFactor).toBe(1.0);
    expect(snap.marketConfidence).toBe(60);
    expect(snap.detail?.trend.emaAlignmentScore).toBe(40);
    expect(snap.detail?.trend.adxScore).toBe(25);
    expect(snap.detail?.trend.slopeScore).toBe(15);
    expect(snap.detail?.confidence.exhaustionMultiplier).toBeCloseTo(0.75);
  });

  it('btcAlignmentFactor matrix via orchestrator', () => {
    const cases = [
      { alt: 'BULL' as const, btc: 'NEUTRAL' as const, factor: 0.75 },
      { alt: 'BULL' as const, btc: 'BEAR' as const, factor: 0.5 },
      { alt: 'BEAR' as const, btc: 'BEAR' as const, factor: 1.0 },
      { alt: 'BEAR' as const, btc: 'BULL' as const, factor: 0.5 },
      { alt: 'NEUTRAL' as const, btc: 'BULL' as const, factor: 0.75 },
    ];

    for (const { alt, btc, factor } of cases) {
      vi.clearAllMocks();
      stubEnginesSuccess({ trendDirection: alt, btcDirection: btc });
      const snap = runMarketIntelligenceLayer(mockKlines, mockBtcKlines);
      expect(snap.btcAlignmentFactor).toBe(factor);
    }
  });

  it('engine throw → fallback Transition neutral snapshot', () => {
    vi.mocked(calculateTrendStrength).mockImplementation(() => {
      throw new Error('engine failure');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const snap = runMarketIntelligenceLayer(mockKlines, mockBtcKlines);
    const expected = createNeutralSnapshot(snap.scanTimestamp);

    expect(snap).toEqual(expected);
    expect(snap.marketState).toBe('Transition');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('calls engines in pipeline order', () => {
    stubEnginesSuccess();
    runMarketIntelligenceLayer(mockKlines, mockBtcKlines);

    expect(calculateTrendStrength).toHaveBeenCalledWith(mockKlines);
    expect(calculateTrendExhaustion).toHaveBeenCalledWith(mockKlines, 'BULL');
    expect(calculateReversalProbability).toHaveBeenCalledWith(
      mockKlines,
      25,
      'BEARISH',
    );
    expect(buildBTCContext).toHaveBeenCalledWith(mockBtcKlines);
    expect(calculateMarketState).toHaveBeenCalledWith({
      trendStrength: 80,
      trendExhaustion: 25,
      trendDirection: 'BULL',
      volumeDivergencePts: 0,
    });
  });
});
