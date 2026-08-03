import { describe, expect, it } from 'vitest';
import { NEUTRAL_PROTECTION } from '../protectionLayer';
import { computeVolatilityExplosion } from '../volatilityExplosionEngine';
import {
  V41_ENGINE_ID,
  V41_ENGINE_VERSION,
  V41_STRENGTH_BAND,
  V41_VOLATILITY_FOUNDATION_STATE,
  adaptProtectionSnapshot,
  adaptVolatilityExplosionResult,
  buildV41EngineResult,
  getEngineCapabilities,
  resolveStrengthBand,
  validateV41EngineResult,
  toFoundationVolatilityState,
  toLegacyVolatilityState,
  engineResultToReviewItems,
} from '../foundation';

function buildFlatKlines(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    openTime: i,
    closeTime: i + 1,
    open: 100,
    high: 100.075,
    low: 99.925,
    close: 100,
    volume: 1000,
    takerBuyVolume: 500,
  }));
}

describe('V4.1 foundation — engineResult v1.1b', () => {
  it('validateV41EngineResult accepts final envelope', () => {
    const result = adaptProtectionSnapshot(NEUTRAL_PROTECTION);
    const validation = validateV41EngineResult(result);
    expect(validation.valid).toBe(true);
    expect(result.engineId).toBe(V41_ENGINE_ID.PROTECTION);
    expect(result.version).toBe(V41_ENGINE_VERSION);
    expect(result.strengthBand).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(Array.isArray(result.reviews)).toBe(true);
  });

  it('strengthBand enum maps from numeric strength', () => {
    expect(resolveStrengthBand(85)).toBe(V41_STRENGTH_BAND.EXTREME);
    expect(resolveStrengthBand(65)).toBe(V41_STRENGTH_BAND.HIGH);
    expect(resolveStrengthBand(40)).toBe(V41_STRENGTH_BAND.MEDIUM);
    expect(resolveStrengthBand(10)).toBe(V41_STRENGTH_BAND.LOW);
  });

  it('buildV41EngineResult attaches capabilities from registry', () => {
    const result = buildV41EngineResult({
      engineId: V41_ENGINE_ID.TRADE_SETUP,
      state: 'Ready',
      confidence: 80,
      metrics: {},
    });
    expect(result.capabilities.canTradePlan).toBe(true);
    expect(result.capabilities.canEntry).toBe(true);
    expect(getEngineCapabilities(V41_ENGINE_ID.VOLATILITY_EXPLOSION).canEntry).toBe(false);
  });

  it('metrics are numeric — no text fields in metrics bag', () => {
    const result = adaptProtectionSnapshot(NEUTRAL_PROTECTION);
    for (const value of Object.values(result.metrics)) {
      if (value != null) {
        expect(typeof value).toBe('number');
      }
    }
  });
});

describe('V4.1 foundation — volatility state bridge', () => {
  it('maps legacy Quiet Market ↔ QuietMarket', () => {
    expect(toFoundationVolatilityState('Quiet Market')).toBe(
      V41_VOLATILITY_FOUNDATION_STATE.QUIET_MARKET,
    );
    expect(toLegacyVolatilityState(V41_VOLATILITY_FOUNDATION_STATE.QUIET_MARKET)).toBe(
      'Quiet Market',
    );
  });

  it('adaptVolatilityExplosionResult preserves readiness in metrics', () => {
    const legacy = computeVolatilityExplosion({ klines4H: buildFlatKlines(70) });
    const adapted = adaptVolatilityExplosionResult(legacy);
    expect(adapted.state).toBe(V41_VOLATILITY_FOUNDATION_STATE.QUIET_MARKET);
    expect(adapted.metrics.readinessScore).toBe(legacy.detail.readinessScore);
    expect(adapted.debug?.raw?.legacyState).toBe(legacy.state);
  });
});

describe('V4.1 foundation — reviews (canonical)', () => {
  it('adaptProtectionSnapshot populates V41ReviewItem[] directly', () => {
    const snapshot = {
      ...NEUTRAL_PROTECTION,
      protectionWarnings: ['⚠️ Volatility cực cao'],
      volatilityRisk: 'EXTREME' as const,
      protectionPenalty: -10,
    };
    const engine = adaptProtectionSnapshot(snapshot);
    expect(engine.reviews.length).toBeGreaterThanOrEqual(1);
    expect(engine.reviews[0].id).toContain(V41_ENGINE_ID.PROTECTION);
    expect(engine.reviews[0].level).toBe('CRITICAL');
    expect(engine.reviews[0].source).toBe(V41_ENGINE_ID.PROTECTION);
  });

  it('engineResultToReviewItems returns reviews without loss', () => {
    const engine = adaptProtectionSnapshot({
      ...NEUTRAL_PROTECTION,
      protectionWarnings: ['warn'],
      volatilityRisk: 'HIGH',
    });
    expect(engineResultToReviewItems(engine)).toEqual(engine.reviews);
  });
});

describe('V4.1 foundation — future engine ids', () => {
  it('registers placeholder capabilities for fake breakout and trend reversal', () => {
    expect(getEngineCapabilities(V41_ENGINE_ID.FAKE_BREAKOUT).canGenerateSignal).toBe(true);
    expect(getEngineCapabilities(V41_ENGINE_ID.TREND_REVERSAL).canGenerateSignal).toBe(true);
    expect(getEngineCapabilities(V41_ENGINE_ID.CONFIDENCE).canGenerateSignal).toBe(false);
    expect(getEngineCapabilities(V41_ENGINE_ID.DECISION).canGenerateSignal).toBe(true);
    expect(getEngineCapabilities(V41_ENGINE_ID.POSITION_ADVISOR).canProvideAdvisor).toBe(true);
  });
});
