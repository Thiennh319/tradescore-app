import { FEATURE_FLAGS } from '../config/featureFlags';
import { TP_MIN_PROBABILITY } from '../constants/tradePlan';
import type { TakeProfitLevel } from '../constants/scoring';

export { TP_MIN_PROBABILITY };

export function isTpProbabilityAboveMin(probability: number): boolean {
  return probability >= TP_MIN_PROBABILITY;
}

/** Hiển thị TP trên UI — khi filter tắt luôn hiện (kèm nhãn tham khảo nếu thấp). */
export function isTpProbabilityDisplayable(probability: number): boolean {
  if (!FEATURE_FLAGS.TP_PROBABILITY_FILTER) return true;
  return isTpProbabilityAboveMin(probability);
}

export function isTp1ProbabilityBlocking(probability: number): boolean {
  return FEATURE_FLAGS.TP_PROBABILITY_FILTER && !isTpProbabilityAboveMin(probability);
}

export function formatTpProbabilityLabel(probability: number): string {
  const pct = (probability * 100).toFixed(0);
  if (!FEATURE_FLAGS.TP_PROBABILITY_FILTER && !isTpProbabilityAboveMin(probability)) {
    return `Xác suất: ${pct}% (tham khảo)`;
  }
  return `Xác suất: ${pct}%`;
}

/**
 * EV = Σ(probability × reward) cho TP hợp lệ − (1 − winProbability) × maxLoss
 * Chỉ gồm TP có xác suất ≥ TP_MIN_PROBABILITY.
 */
export function computeTradePlanExpectedValue(
  tps: TakeProfitLevel[],
  winProbability: number,
  maxLossUSDT: number,
): number {
  const tpContribution = tps
    .filter((tp) => isTpProbabilityAboveMin(tp.probability))
    .reduce((sum, tp) => sum + tp.probability * tp.expectedPnlUSDT, 0);
  return +(tpContribution - (1 - winProbability) * maxLossUSDT).toFixed(2);
}

export function buildTp1LowProbabilityWarning(tp1Probability: number): string {
  const pct = (tp1Probability * 100).toFixed(0);
  return `⚠️ R:R không đạt — TP1 xác suất quá thấp (${pct}%)`;
}

export function resolveTradePlanValid(input: {
  tp1: TakeProfitLevel;
  primaryRr: number;
  maxLossUSDT: number;
  tierMaxLossPerTrade: number;
  minRrToEnter?: number;
}): {
  tradePlanValid: boolean;
  tp1LowProbabilityWarning: string | null;
} {
  const minRr = input.minRrToEnter ?? 2.0;

  if (isTp1ProbabilityBlocking(input.tp1.probability)) {
    return {
      tradePlanValid: false,
      tp1LowProbabilityWarning: buildTp1LowProbabilityWarning(input.tp1.probability),
    };
  }
  if (input.primaryRr < minRr) {
    return { tradePlanValid: false, tp1LowProbabilityWarning: null };
  }
  if (
    input.tierMaxLossPerTrade > 0 &&
    input.maxLossUSDT > input.tierMaxLossPerTrade + 0.01
  ) {
    return { tradePlanValid: false, tp1LowProbabilityWarning: null };
  }
  return { tradePlanValid: true, tp1LowProbabilityWarning: null };
}
