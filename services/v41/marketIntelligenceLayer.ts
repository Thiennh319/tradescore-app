import { buildBTCContext } from './btcContextBuilder';
import type { KlineV41 } from './indicators';
import { calculateMarketState } from './marketStateEngine';
import { calculateReversalProbability } from './reversalProbabilityEngine';
import { calculateTrendExhaustion } from './trendExhaustionEngine';
import { calculateTrendStrength } from './trendStrengthEngine';
import type { MarketIntelligenceSnapshot, TrendDirection } from './types';

function resolveAltBtcAlignmentFactor(
  altDirection: TrendDirection,
  btcDirection: TrendDirection,
): number {
  if (altDirection === 'NEUTRAL') return 0.75;
  if (altDirection === 'BULL' && btcDirection === 'BULL') return 1.0;
  if (altDirection === 'BULL' && btcDirection === 'NEUTRAL') return 0.75;
  if (altDirection === 'BULL' && btcDirection === 'BEAR') return 0.5;
  if (altDirection === 'BEAR' && btcDirection === 'BEAR') return 1.0;
  if (altDirection === 'BEAR' && btcDirection === 'NEUTRAL') return 0.75;
  if (altDirection === 'BEAR' && btcDirection === 'BULL') return 0.5;
  return 0.75;
}

function computeMarketConfidence(
  trendStrength: number,
  trendExhaustion: number,
  btcAlignmentFactor: number,
): number {
  const raw = trendStrength * (1 - trendExhaustion / 100) * btcAlignmentFactor;
  return Math.min(100, Math.max(0, raw));
}

function reversalDivergenceType(
  trendDirection: TrendDirection,
): 'BULLISH' | 'BEARISH' {
  if (trendDirection === 'BEAR') return 'BULLISH';
  return 'BEARISH';
}

function createNeutralSnapshot(scanTimestamp = Date.now()): MarketIntelligenceSnapshot {
  return {
    trendStrength: 0,
    trendDirection: 'NEUTRAL',
    trendExhaustion: 0,
    volumeDivergencePts: 0,
    reversalProbability: 0,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 0,
    btcAlignmentFactor: 0.75,
    btcDirection: 'NEUTRAL',
    marketState: 'Transition',
    scanTimestamp,
  };
}

function runMarketIntelligenceLayerInternal(
  klines4H: KlineV41[],
  btcKlines4H: KlineV41[],
  scanTimestamp: number,
): MarketIntelligenceSnapshot {
  const engine1 = calculateTrendStrength(klines4H);
  const trendStrength = engine1.trendStrength;
  const trendDirection = engine1.trendDirection;

  const engine2 = calculateTrendExhaustion(klines4H, trendDirection);
  const trendExhaustion = engine2.trendExhaustion;
  const volumeDivergencePts = engine2.volumeDivergencePts;

  const engine3 = calculateReversalProbability(
    klines4H,
    trendExhaustion,
    reversalDivergenceType(trendDirection),
  );

  const btcCtx = buildBTCContext(btcKlines4H);
  const btcDirection = btcCtx.btcDirection;
  const btcAlignmentFactor = resolveAltBtcAlignmentFactor(trendDirection, btcDirection);
  const marketConfidence = computeMarketConfidence(
    trendStrength,
    trendExhaustion,
    btcAlignmentFactor,
  );

  const marketState = calculateMarketState({
    trendStrength,
    trendExhaustion,
    trendDirection,
    volumeDivergencePts,
  });

  return {
    trendStrength,
    trendDirection,
    trendExhaustion,
    volumeDivergencePts,
    reversalProbability: engine3.reversalProbability,
    rsiDivergenceScore: engine3.rsiDivergenceScore,
    cvdDivergenceScore: engine3.cvdDivergenceScore,
    marketConfidence,
    btcAlignmentFactor,
    btcDirection,
    marketState,
    scanTimestamp,
  };
}

/**
 * Orchestrator Bước 1 — Market Intelligence Layer.
 * Chạy Engine 1→4 + Market State; fallback neutral nếu bất kỳ engine throw.
 */
export function runMarketIntelligenceLayer(
  klines4H: KlineV41[],
  btcKlines4H: KlineV41[],
): MarketIntelligenceSnapshot {
  const scanTimestamp = Date.now();
  try {
    return runMarketIntelligenceLayerInternal(klines4H, btcKlines4H, scanTimestamp);
  } catch (error) {
    console.error('[v41] runMarketIntelligenceLayer failed:', error);
    return createNeutralSnapshot(scanTimestamp);
  }
}

/** Exported for unit tests — alt/BTC alignment matrix. */
export { resolveAltBtcAlignmentFactor, createNeutralSnapshot };
