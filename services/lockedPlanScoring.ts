import type { AnalysisInput } from './analysisInput';
import type {
  DecisionTypeV2,
  MandatoryLayerV2,
  PsychologyChecklistV2,
  ScorerLayerId,
  AppSettings,
} from '../constants/scoring';
import type {
  LayerScoreMap,
  LockedTradePlan,
  TodayQuickStats,
} from '../constants/aiJournal';
import {
  DECISION_LABELS_V2,
  HARD_BLOCK_RULES,
  LAYER_MAX_POINTS,
  MANDATORY_LAYERS_V2,
  SCORE_THRESHOLDS,
  SCORER_LAYER_NAMES,
} from '../constants/scoring';
import type { AllMarketData, Kline } from './binanceApi';
import {
  analyzeCVD,
  buildCVDPointsFromKlines,
  getBollinger,
  getBollingerPercentB,
  getCurrentHourVN,
  getEMAs,
  getMACD,
  getRatioSlope,
  getRSI,
  getVolumeRatio,
  type CVDPoint,
} from './indicators';

// ─── Public types (Scorer v2) ──────────────────────────────────────────────────

export type Direction = 'LONG' | 'SHORT';

export interface ScoringLayerResult {
  layerNumber: number;
  score: number;
  maxScore: number;
  reason: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const RAW_LAYER_MAX = 2;
const WEIGHT_PER_RAW = LAYER_MAX_POINTS / RAW_LAYER_MAX;

function wrapLayer(layerNumber: number, raw: 0 | 1 | 2, reason: string): ScoringLayerResult {
  return {
    layerNumber,
    score: raw,
    maxScore: RAW_LAYER_MAX,
    reason,
  };
}

function rawToWeightedTotal(layers: ScoringLayerResult[]): number {
  let sum = 0;
  for (const layer of layers) sum += layer.score * WEIGHT_PER_RAW;
  return Math.round(sum * 100) / 100;
}

function isMandatoryLayer(n: number): n is MandatoryLayerV2 {
  return (MANDATORY_LAYERS_V2 as readonly number[]).includes(n);
}

function collectMandatoryViolations(layers: ScoringLayerResult[]): string[] {
  const violations: string[] = [];
  for (const layer of layers) {
    if (isMandatoryLayer(layer.layerNumber) && layer.score === 0) {
      violations.push(
        `L${layer.layerNumber} ${SCORER_LAYER_NAMES[layer.layerNumber as MandatoryLayerV2]}: ${layer.reason}`,
      );
    }
  }
  return violations;
}

// ─── Hard blocks (entry-zone monitor) ───────────────────────────────────────────

function checkHardBlocks(
  input: AnalysisInput,
  direction: Direction,
): string[] {
  const reasons: string[] = [];
  const btc = input.btc24hChangePct;
  const fr = input.fundingRate;
  const psych = input.psychologyChecklist;

  if (Math.abs(btc) > HARD_BLOCK_RULES.BTC_EXTREME_PCT) {
    reasons.push(`BTC biến động cực đoan ${btc >= 0 ? '+' : ''}${btc.toFixed(1)}%`);
  }
  if (direction === 'LONG' && btc < HARD_BLOCK_RULES.BTC_LONG_BLOCK_PCT) {
    reasons.push(`BTC ${btc.toFixed(1)}% — chặn LONG alt`);
  }
  if (direction === 'SHORT' && btc > HARD_BLOCK_RULES.BTC_SHORT_BLOCK_PCT) {
    reasons.push(`BTC +${btc.toFixed(1)}% — chặn SHORT alt`);
  }
  if (direction === 'LONG' && fr > HARD_BLOCK_RULES.FUNDING_LONG_SQUEEZE_PCT) {
    reasons.push(`Funding ${fr.toFixed(4)}% — rủi ro long squeeze`);
  }
  if (direction === 'SHORT' && fr < HARD_BLOCK_RULES.FUNDING_SHORT_SQUEEZE_PCT) {
    reasons.push(`Funding ${fr.toFixed(4)}% — rủi ro short squeeze`);
  }
  // TODO: BẬT LẠI KHI PRODUCTION
  // if (!psych.noLossStreak) {
  //   reasons.push(
  //     `Thua ${HARD_BLOCK_RULES.MAX_CONSECUTIVE_LOSSES} lệnh liên tiếp trong 24h — cooldown ${HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES} phút`,
  //   );
  // }
  // if (!psych.dailyLossOk) {
  //   reasons.push(`Lỗ ngày ≥ ${HARD_BLOCK_RULES.MAX_DAILY_LOSS_USDT} USDT`);
  // }

  return reasons;
}

// ─── Layer scorers ─────────────────────────────────────────────────────────────

export function scoreLayer1_PriceMA(
  direction: Direction,
  klines1h: Kline[],
  klines4h: Kline[],
  currentPrice: number,
): ScoringLayerResult {
  const ema1h = getEMAs(klines1h);
  const ema4h = getEMAs(klines4h);

  if (direction === 'LONG') {
    const above1h = currentPrice > ema1h.ema20 && currentPrice > ema1h.ema50;
    const above4h = currentPrice > ema4h.ema20 && currentPrice > ema4h.ema50;
    if (above1h && above4h) {
      return wrapLayer(1, 2, 'Giá trên EMA20/50 cả 1H&4H');
    }
    if (above1h || above4h) {
      return wrapLayer(1, 1, 'Mâu thuẫn giữa 1H và 4H');
    }
    return wrapLayer(1, 0, 'Giá dưới tất cả EMA');
  }

  const below1h = currentPrice < ema1h.ema20 && currentPrice < ema1h.ema50;
  const below4h = currentPrice < ema4h.ema20 && currentPrice < ema4h.ema50;
  if (below1h && below4h) {
    return wrapLayer(1, 2, 'Giá dưới EMA20/50 cả 1H&4H');
  }
  if (below1h || below4h) {
    return wrapLayer(1, 1, 'Mâu thuẫn giữa 1H và 4H');
  }
  return wrapLayer(1, 0, 'Giá trên tất cả EMA');
}

export function scoreLayer2_RSI(
  direction: Direction,
  klines1h: Kline[],
  klines4h: Kline[],
): ScoringLayerResult {
  const rsi1h = getRSI(klines1h);
  const rsi4h = getRSI(klines4h);

  if (direction === 'LONG') {
    const inSweet = (r: number) => r >= 45 && r <= 65;
    const inOk = (r: number) => (r >= 35 && r < 45) || (r > 65 && r <= 75);
    if (inSweet(rsi1h) && inSweet(rsi4h)) {
      return wrapLayer(
        2,
        2,
        `RSI 1H ${rsi1h.toFixed(1)}, 4H ${rsi4h.toFixed(1)} — vùng tối ưu`,
      );
    }
    if (inOk(rsi1h) || inOk(rsi4h)) {
      return wrapLayer(2, 1, 'RSI gần vùng tối ưu');
    }
    return wrapLayer(2, 0, 'RSI quá mua/quá bán');
  }

  const inSweet = (r: number) => r >= 35 && r <= 55;
  const inOk = (r: number) => (r >= 25 && r < 35) || (r > 55 && r <= 65);
  if (inSweet(rsi1h) && inSweet(rsi4h)) {
    return wrapLayer(
      2,
      2,
      `RSI 1H ${rsi1h.toFixed(1)}, 4H ${rsi4h.toFixed(1)} — vùng tối ưu`,
    );
  }
  if (inOk(rsi1h) || inOk(rsi4h)) {
    return wrapLayer(2, 1, 'RSI gần vùng tối ưu');
  }
  return wrapLayer(2, 0, 'RSI quá mua/quá bán');
}

export function scoreLayer3_MACD(
  direction: Direction,
  klines1h: Kline[],
  klines4h: Kline[],
): ScoringLayerResult {
  const macd1h = getMACD(klines1h);
  const macd4h = getMACD(klines4h);
  const h1 = macd1h.histogram;
  const h4 = macd4h.histogram;

  if (direction === 'LONG') {
    const pos1 = h1 > 0;
    const pos4 = h4 > 0;
    if (pos1 && pos4) {
      return wrapLayer(3, 2, `MACD dương cả 1H (${h1.toFixed(4)}) & 4H (${h4.toFixed(4)})`);
    }
    if (pos1 || pos4) {
      return wrapLayer(3, 1, 'MACD 1 khung còn dương');
    }
    return wrapLayer(3, 0, 'MACD cả 2 khung âm — bearish');
  }

  const neg1 = h1 < 0;
  const neg4 = h4 < 0;
  if (neg1 && neg4) {
    return wrapLayer(3, 2, `MACD âm cả 1H (${h1.toFixed(4)}) & 4H (${h4.toFixed(4)})`);
  }
  if (neg1 || neg4) {
    return wrapLayer(3, 1, 'MACD 1 khung còn âm');
  }
  return wrapLayer(3, 0, 'MACD cả 2 khung dương — bullish');
}

export function scoreLayer4_Bollinger(
  direction: Direction,
  klines1h: Kline[],
  currentPrice: number,
): ScoringLayerResult {
  const bb = getBollinger(klines1h);
  const pctB = getBollingerPercentB(bb, currentPrice);

  if (direction === 'LONG') {
    if (pctB >= 55 && pctB <= 75) {
      return wrapLayer(4, 2, `%B ${pctB.toFixed(0)} — momentum tăng`);
    }
    if ((pctB >= 45 && pctB < 55) || (pctB > 75 && pctB <= 85)) {
      return wrapLayer(4, 1, `%B ${pctB.toFixed(0)} — gần vùng thuận`);
    }
    return wrapLayer(4, 0, `%B ${pctB.toFixed(0)} — không thuận long`);
  }

  if (pctB >= 25 && pctB <= 45) {
    return wrapLayer(4, 2, `%B ${pctB.toFixed(0)} — momentum giảm`);
  }
  if ((pctB >= 15 && pctB < 25) || (pctB > 45 && pctB <= 55)) {
    return wrapLayer(4, 1, `%B ${pctB.toFixed(0)} — gần vùng thuận`);
  }
  return wrapLayer(4, 0, `%B ${pctB.toFixed(0)} — không thuận short`);
}

export function scoreLayer5_VolumeOICVD(
  direction: Direction,
  klines1h: Kline[],
  oiCurrent: number,
  oiPrevious: number,
  cvdPoints: CVDPoint[],
): ScoringLayerResult {
  const volRatio = getVolumeRatio(klines1h);
  const oiDelta = oiCurrent - oiPrevious;
  const cvd = analyzeCVD(cvdPoints, direction);

  let signals = 0;
  const parts: string[] = [];

  if (volRatio >= 1.2) {
    signals += 1;
    parts.push(`Vol ×${volRatio.toFixed(2)}`);
  } else if (volRatio < 0.7) {
    parts.push('Volume thấp');
  }

  if (direction === 'LONG' && oiDelta > 0) {
    signals += 1;
    parts.push('OI tăng');
  } else if (direction === 'SHORT' && oiDelta < 0) {
    signals += 1;
    parts.push('OI giảm');
  } else if (Math.abs(oiDelta) > 0) {
    parts.push(`ΔOI ${oiDelta.toFixed(0)}`);
  }

  if (cvd.supportive) {
    signals += 1;
    parts.push(cvd.reason);
  } else if (cvd.divergence) {
    parts.push('CVD phân kỳ');
  }

  if (signals >= 3) {
    return wrapLayer(5, 2, parts.join(' · ') || 'Volume/OI/CVD mạnh');
  }
  if (signals >= 1) {
    return wrapLayer(5, 1, parts.join(' · ') || 'Volume/OI/CVD trung bình');
  }
  return wrapLayer(5, 0, parts.join(' · ') || 'Volume/OI/CVD yếu');
}

export function scoreLayer6_FundingRate(
  direction: Direction,
  fundingRate: number,
): ScoringLayerResult {
  const fr = fundingRate;

  if (direction === 'LONG') {
    if (fr < 0) {
      return wrapLayer(6, 2, `Funding ${fr.toFixed(4)}% — short trả long`);
    }
    if (fr <= 0.01) {
      return wrapLayer(6, 1, `Funding ${fr.toFixed(4)}% — thấp`);
    }
    if (fr >= HARD_BLOCK_RULES.FUNDING_LONG_SQUEEZE_PCT) {
      return wrapLayer(6, 0, `Funding ${fr.toFixed(4)}% — squeeze long`);
    }
    return wrapLayer(6, 1, `Funding ${fr.toFixed(4)}%`);
  }

  if (fr > 0) {
    return wrapLayer(6, 2, `Funding ${fr.toFixed(4)}% — long trả short`);
  }
  if (fr >= -0.01) {
    return wrapLayer(6, 1, `Funding ${fr.toFixed(4)}% — gần 0`);
  }
  if (fr <= HARD_BLOCK_RULES.FUNDING_SHORT_SQUEEZE_PCT) {
    return wrapLayer(6, 0, `Funding ${fr.toFixed(4)}% — squeeze short`);
  }
  return wrapLayer(6, 1, `Funding ${fr.toFixed(4)}%`);
}

export function scoreLayer7_LongShortRatio(
  direction: Direction,
  topLongShortRatios: number[],
  globalLongShortRatios: number[],
): ScoringLayerResult {
  const top =
    topLongShortRatios.length > 0
      ? topLongShortRatios[topLongShortRatios.length - 1]
      : 1;
  const global =
    globalLongShortRatios.length > 0
      ? globalLongShortRatios[globalLongShortRatios.length - 1]
      : top;
  const slope = getRatioSlope(topLongShortRatios);

  if (direction === 'LONG') {
    if (top < 0.9 && slope !== 'UP') {
      return wrapLayer(7, 2, `L/S ${top.toFixed(2)} ↓ — short đông`);
    }
    if (top <= 1.1) {
      return wrapLayer(7, 1, `L/S ${top.toFixed(2)} cân bằng`);
    }
    if (top > 1.5) {
      return wrapLayer(7, 0, `L/S ${top.toFixed(2)} — long quá đông`);
    }
    return wrapLayer(7, 1, `L/S top ${top.toFixed(2)} · global ${global.toFixed(2)}`);
  }

  if (top > 1.1 && slope !== 'DOWN') {
    return wrapLayer(7, 2, `L/S ${top.toFixed(2)} ↑ — long đông`);
  }
  if (top >= 0.9) {
    return wrapLayer(7, 1, `L/S ${top.toFixed(2)} cân bằng`);
  }
  if (top < 0.7) {
    return wrapLayer(7, 0, `L/S ${top.toFixed(2)} — short quá đông`);
  }
  return wrapLayer(7, 1, `L/S top ${top.toFixed(2)} · global ${global.toFixed(2)}`);
}

export function scoreLayer8_BTCCondition(
  direction: Direction,
  btc24hChangePct: number,
): ScoringLayerResult {
  const chg = btc24hChangePct;
  const label = `BTC 24h ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;

  if (direction === 'LONG') {
    if (chg > 2) return wrapLayer(8, 2, `${label} — risk-on mạnh`);
    if (chg > 0) return wrapLayer(8, 1, label);
    if (chg > HARD_BLOCK_RULES.BTC_LONG_BLOCK_PCT) return wrapLayer(8, 1, label);
    return wrapLayer(8, 0, `${label} — chặn long alt`);
  }

  if (chg < -2) return wrapLayer(8, 2, `${label} — risk-off mạnh`);
  if (chg < 0) return wrapLayer(8, 1, label);
  if (chg < HARD_BLOCK_RULES.BTC_SHORT_BLOCK_PCT) return wrapLayer(8, 1, label);
  return wrapLayer(8, 0, `${label} — chặn short alt`);
}

export function scoreLayer9_TradingSession(_direction: Direction): ScoringLayerResult {
  const hour = getCurrentHourVN();

  if (hour >= 6 && hour < 22) {
    return wrapLayer(9, 2, `Giờ ${hour.toFixed(1)}h — trong phiên 6–22h`);
  }
  if (hour >= 22 || hour < 2) {
    return wrapLayer(9, 1, `Giờ ${hour.toFixed(1)}h — thanh khoản mỏng`);
  }
  return wrapLayer(9, 0, `Giờ ${hour.toFixed(1)}h — ngoài phiên chính`);
}

export function scoreLayer10_Psychology(
  checklist: PsychologyChecklistV2,
): ScoringLayerResult {
  // TODO: BẬT LẠI KHI PRODUCTION
  // if (!checklist.noLossStreak || !checklist.dailyLossOk) {
  //   const parts: string[] = [];
  //   if (!checklist.noLossStreak) parts.push('chuỗi thua');
  //   if (!checklist.dailyLossOk) parts.push('vượt trần lỗ ngày');
  //   return wrapLayer(10, 0, parts.join(' · ') || 'Tâm lý không đạt');
  // }

  const keys = Object.keys(checklist) as (keyof PsychologyChecklistV2)[];
  const passed = keys.filter((k) => checklist[k]).length;

  if (passed >= 5) {
    return wrapLayer(10, 2, 'Checklist tâm lý đầy đủ');
  }
  if (passed >= 3) {
    return wrapLayer(10, 1, `${passed}/5 mục checklist`);
  }
  return wrapLayer(10, 0, `${passed}/5 mục — thiếu kỷ luật`);
}

// ─── Aggregate ─────────────────────────────────────────────────────────────────

function scoreAllLayersV2(input: AnalysisInput, direction: Direction): ScoringLayerResult[] {
  return [
    scoreLayer1_PriceMA(direction, input.klines1h, input.klines4h, input.currentPrice),
    scoreLayer2_RSI(direction, input.klines1h, input.klines4h),
    scoreLayer3_MACD(direction, input.klines1h, input.klines4h),
    scoreLayer4_Bollinger(direction, input.klines1h, input.currentPrice),
    scoreLayer5_VolumeOICVD(
      direction,
      input.klines1h,
      input.oiCurrent,
      input.oiPrevious,
      input.cvdPoints,
    ),
    scoreLayer6_FundingRate(direction, input.fundingRate),
    scoreLayer7_LongShortRatio(
      direction,
      input.topLongShortRatios,
      input.globalLongShortRatios,
    ),
    scoreLayer8_BTCCondition(direction, input.btc24hChangePct),
    scoreLayer9_TradingSession(direction),
    scoreLayer10_Psychology(input.psychologyChecklist),
  ];
}

function resolveDecisionV2(
  totalScore: number,
  mandatoryViolations: string[],
  hardBlocked: boolean,
): DecisionTypeV2 {
  if (hardBlocked || mandatoryViolations.length > 0) return 'KHONG_VAO';
  if (totalScore < SCORE_THRESHOLDS.NO_ENTRY_MAX) return 'KHONG_VAO';
  if (totalScore < SCORE_THRESHOLDS.WAIT_MAX) return 'CHO_THEM';
  if (totalScore < SCORE_THRESHOLDS.CAN_ENTER_MAX) return 'CO_THE_VAO';
  if (totalScore < SCORE_THRESHOLDS.CONFIDENT_MAX) return 'VAO_TU_TIN';
  return 'SETUP_NGON';
}

// ─── Locked plan + Entry zone mode ─────────────────────────────────────────────

export const SIGNIFICANT_CVD_REVERSAL_THRESHOLD = 200_000;

export type CancelReason =
  | 'BTC_DUMP'
  | 'FUNDING_EXTREME'
  | 'CVD_REVERSAL'
  | 'PRICE_THROUGH_SL'
  | 'SESSION_EXPIRED'
  | 'USER_MANUAL'
  | 'PLAN_EXPIRED'
  | 'MULTI_CONFIRMATION_CANCEL';

export type EntryZonePriceStatus = 'ABOVE' | 'IN_ZONE' | 'BELOW';

const FROZEN_LAYER_NUMBERS = [1, 3, 4] as const;
const LIVE_LAYER_NUMBERS = [2, 5, 6, 7, 8, 9, 10] as const;

export interface EntryZoneScoringResult {
  totalScore: number;
  frozenLayers: Record<string, number>;
  liveLayers: Record<string, number>;
  hardBlocks: string[];
  shouldEnter: boolean;
  shouldCancel: boolean;
  decision: DecisionTypeV2;
  decisionLabel: string;
}

function weightedFromSnapshot(snapshot: LockedTradePlan['lockedScoringSnapshot'], n: number): number {
  const key = `l${n}` as keyof LayerScoreMap;
  return snapshot.layerScores[key] ?? 0;
}

function layerToWeighted(layer: ScoringLayerResult): number {
  return Math.round(layer.score * WEIGHT_PER_RAW * 100) / 100;
}

function isGoodTradingSession(
  hourVN: number,
  settings?: Pick<AppSettings, 'autoCheckStartHour' | 'autoCheckEndHour'>,
): boolean {
  const start = settings?.autoCheckStartHour ?? 8;
  const end = settings?.autoCheckEndHour ?? 23;
  return hourVN >= start && hourVN <= end;
}

export function isInEntryZone(
  currentPrice: number,
  entryZone: Pick<LockedTradePlan['entryZone'], 'rangeLow' | 'rangeHigh'>,
): boolean {
  return currentPrice >= entryZone.rangeLow && currentPrice <= entryZone.rangeHigh;
}

export function getEntryZonePriceStatus(
  currentPrice: number,
  rangeLow: number,
  rangeHigh: number,
): EntryZonePriceStatus {
  if (currentPrice >= rangeLow && currentPrice <= rangeHigh) return 'IN_ZONE';
  if (currentPrice > rangeHigh) return 'ABOVE';
  return 'BELOW';
}

export function shouldCancelLockedPlan(
  lockedPlan: LockedTradePlan,
  currentData: AnalysisInput,
  currentPrice: number,
  sessionSettings?: Pick<AppSettings, 'autoCheckStartHour' | 'autoCheckEndHour'>,
): { cancel: boolean; reason?: CancelReason; message?: string } {
  const dir = lockedPlan.lockedDirection;

  if (dir === 'LONG' && currentPrice < lockedPlan.sl) {
    return {
      cancel: true,
      reason: 'PRICE_THROUGH_SL',
      message: `Giá ${currentPrice.toFixed(4)} đã xuyên SL ${lockedPlan.sl.toFixed(4)}`,
    };
  }
  if (dir === 'SHORT' && currentPrice > lockedPlan.sl) {
    return {
      cancel: true,
      reason: 'PRICE_THROUGH_SL',
      message: `Giá ${currentPrice.toFixed(4)} đã xuyên SL ${lockedPlan.sl.toFixed(4)}`,
    };
  }

  const btc = currentData.btc24hChangePct;
  if (Math.abs(btc) > HARD_BLOCK_RULES.BTC_EXTREME_PCT) {
    return {
      cancel: true,
      reason: 'BTC_DUMP',
      message: `BTC biến động cực đoan ${btc >= 0 ? '+' : ''}${btc.toFixed(1)}%`,
    };
  }
  if (dir === 'LONG' && btc < HARD_BLOCK_RULES.BTC_LONG_BLOCK_PCT) {
    return {
      cancel: true,
      reason: 'BTC_DUMP',
      message: `BTC ${btc.toFixed(1)}% — rủi ro cao cho LONG`,
    };
  }
  if (dir === 'SHORT' && btc > HARD_BLOCK_RULES.BTC_SHORT_BLOCK_PCT) {
    return {
      cancel: true,
      reason: 'BTC_DUMP',
      message: `BTC +${btc.toFixed(1)}% — rủi ro cao cho SHORT`,
    };
  }

  const fr = currentData.fundingRate;
  if (dir === 'LONG' && fr > HARD_BLOCK_RULES.FUNDING_LONG_SQUEEZE_PCT) {
    return {
      cancel: true,
      reason: 'FUNDING_EXTREME',
      message: `Funding ${fr.toFixed(4)}% — rủi ro long squeeze`,
    };
  }
  if (dir === 'SHORT' && fr < HARD_BLOCK_RULES.FUNDING_SHORT_SQUEEZE_PCT) {
    return {
      cancel: true,
      reason: 'FUNDING_EXTREME',
      message: `Funding ${fr.toFixed(4)}% — rủi ro short squeeze`,
    };
  }

  const cvdPoints = currentData.cvdPoints;
  const currentCvd = cvdPoints.length > 0 ? cvdPoints[cvdPoints.length - 1].cvd : 0;
  const cvdChange = currentCvd - lockedPlan.lockedCvdValue;
  const cvdAnalysis = analyzeCVD(cvdPoints, dir);

  if (dir === 'LONG') {
    const trendFlip =
      lockedPlan.lockedCvdTrend === 'UP' &&
      cvdAnalysis.slope === 'down' &&
      Math.abs(cvdChange) >= SIGNIFICANT_CVD_REVERSAL_THRESHOLD;
    if (trendFlip || cvdChange <= -SIGNIFICANT_CVD_REVERSAL_THRESHOLD) {
      return {
        cancel: true,
        reason: 'CVD_REVERSAL',
        message: `CVD đảo chiều (${cvdChange >= 0 ? '+' : ''}${cvdChange.toFixed(0)})`,
      };
    }
  } else {
    const trendFlip =
      lockedPlan.lockedCvdTrend === 'DOWN' &&
      cvdAnalysis.slope === 'up' &&
      Math.abs(cvdChange) >= SIGNIFICANT_CVD_REVERSAL_THRESHOLD;
    if (trendFlip || cvdChange >= SIGNIFICANT_CVD_REVERSAL_THRESHOLD) {
      return {
        cancel: true,
        reason: 'CVD_REVERSAL',
        message: `CVD đảo chiều (${cvdChange >= 0 ? '+' : ''}${cvdChange.toFixed(0)})`,
      };
    }
  }

  if (lockedPlan.lockedSessionType === 'GOOD') {
    const hour = getCurrentHourVN();
    if (!isGoodTradingSession(hour, sessionSettings)) {
      return {
        cancel: true,
        reason: 'SESSION_EXPIRED',
        message: 'Hết phiên giao dịch tốt — nên hủy kế hoạch chờ',
      };
    }
  }

  return { cancel: false };
}

export function scoreInEntryZoneMode(
  input: AnalysisInput,
  lockedPlan: LockedTradePlan,
  _todayStats: TodayQuickStats,
): EntryZoneScoringResult {
  void _todayStats;

  const direction = lockedPlan.lockedDirection;
  const hardBlocks = checkHardBlocks(input, direction);
  const liveScored = scoreAllLayersV2(input, direction);

  const frozenLayers: Record<string, number> = {};
  const liveLayers: Record<string, number> = {};

  for (const n of FROZEN_LAYER_NUMBERS) {
    frozenLayers[`l${n}`] = weightedFromSnapshot(lockedPlan.lockedScoringSnapshot, n);
  }
  for (const n of LIVE_LAYER_NUMBERS) {
    const layer = liveScored.find((l) => l.layerNumber === n);
    liveLayers[`l${n}`] = layer ? layerToWeighted(layer) : 0;
  }

  let totalScore = 0;
  for (let n = 1; n <= 10; n += 1) {
    if ((FROZEN_LAYER_NUMBERS as readonly number[]).includes(n)) {
      totalScore += frozenLayers[`l${n}`] ?? 0;
    } else {
      totalScore += liveLayers[`l${n}`] ?? 0;
    }
  }
  totalScore = Math.round(totalScore * 100) / 100;

  const mandatoryViolations: string[] = [];
  if (hardBlocks.length === 0) {
    for (const n of MANDATORY_LAYERS_V2) {
      const weighted =
        (FROZEN_LAYER_NUMBERS as readonly number[]).includes(n)
          ? frozenLayers[`l${n}`] ?? 0
          : liveLayers[`l${n}`] ?? 0;
      if (weighted <= 0) {
        mandatoryViolations.push(
          `L${n} ${SCORER_LAYER_NAMES[n as MandatoryLayerV2]}: ${(FROZEN_LAYER_NUMBERS as readonly number[]).includes(n) ? 'đóng băng' : 'live'} = 0`,
        );
      }
    }
  }

  const hardBlocked = hardBlocks.length > 0;
  const decision = resolveDecisionV2(totalScore, mandatoryViolations, hardBlocked);
  const cancelCheck = shouldCancelLockedPlan(lockedPlan, input, input.currentPrice);
  const inZone = isInEntryZone(input.currentPrice, lockedPlan.entryZone);

  return {
    totalScore,
    frozenLayers,
    liveLayers,
    hardBlocks,
    shouldEnter:
      inZone &&
      !hardBlocked &&
      mandatoryViolations.length === 0 &&
      totalScore >= SCORE_THRESHOLDS.CAN_ENTER_MAX,
    shouldCancel: cancelCheck.cancel,
    decision,
    decisionLabel: DECISION_LABELS_V2[decision].label,
  };
}
