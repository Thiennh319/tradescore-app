import type { MarketTrend, StructureType } from '../constants/scoring';
import type { CVDDivergenceType } from '../services/indicators';
import type { TradeAnalysis } from '../hooks/useMarketAnalysis';

export type TradingBias = 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';

export interface BiasSnapshot {
  bias: TradingBias;
  score: number;
  reasons: string[];
}

export function computeTradingBias(analysis: TradeAnalysis | null): BiasSnapshot {
  if (!analysis) {
    return { bias: 'WAIT', score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  const { smc, orderFlow, regime } = analysis;

  if (smc.trend === 'BULLISH') {
    score += 2;
    reasons.push('smc_bull');
  } else if (smc.trend === 'BEARISH') {
    score -= 2;
    reasons.push('smc_bear');
  }

  const lastSignal = smc.signals[smc.signals.length - 1];
  if (lastSignal?.type === 'BOS') {
    score += smc.trend === 'BULLISH' ? 1 : smc.trend === 'BEARISH' ? -1 : 0;
    reasons.push('bos');
  } else if (lastSignal?.type === 'CHOCH') {
    score += smc.trend === 'BULLISH' ? 1 : smc.trend === 'BEARISH' ? -1 : 0;
    reasons.push('choch');
  }

  const div = orderFlow.divergences.find((d) => d.type !== 'NONE');
  if (div?.type === 'BULLISH') {
    score += 1;
    reasons.push('div_bull');
  } else if (div?.type === 'BEARISH') {
    score -= 1;
    reasons.push('div_bear');
  }

  if (regime.regime === 'TRENDING_BULL') score += 1;
  else if (regime.regime === 'TRENDING_BEAR') score -= 1;
  else if (regime.regime === 'HIGH_VOLATILITY_CHOP') score *= 0.5;

  if (regime.trend === 'BULLISH') score += 0.5;
  else if (regime.trend === 'BEARISH') score -= 0.5;

  const cvdLast = orderFlow.cvd[orderFlow.cvd.length - 1];
  if (Number.isFinite(cvdLast)) {
    if (cvdLast > 0) score += 0.5;
    else if (cvdLast < 0) score -= 0.5;
  }

  let bias: TradingBias = 'NEUTRAL';
  if (score >= 2) bias = 'LONG';
  else if (score <= -2) bias = 'SHORT';
  else if (Math.abs(score) < 0.5) bias = 'WAIT';

  return { bias, score, reasons };
}

export function structureLabel(type: StructureType | undefined): StructureType | 'NONE' {
  return type ?? 'NONE';
}

export function divergenceType(
  divergences: { type: CVDDivergenceType }[],
): CVDDivergenceType {
  return divergences.find((d) => d.type !== 'NONE')?.type ?? 'NONE';
}

export function trendToBiasHint(trend: MarketTrend): 'up' | 'down' | 'flat' {
  if (trend === 'BULLISH') return 'up';
  if (trend === 'BEARISH') return 'down';
  return 'flat';
}
