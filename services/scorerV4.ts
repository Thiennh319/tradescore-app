import type { Kline } from './binanceApi';
import {
  type BollingerAnalysisV3,
  type BTCAnalysisV3,
  type CVDPoint,
  type EMAAnalysisV3,
  type EntryWhaleWalls,
  type FundingAnalysisV3,
  type MACDAnalysisV3,
  analyzeCVD,
  applyRecoveringCvdLocalPenalty,
  evaluateLongCvdHardBlock,
  checkWinStreakV3,
  detectRSIDivergenceV3,
  getBollingerAnalysisV3,
  getBTCAnalysisV3,
  getEMAAnalysisV3,
  getFundingAnalysisV3,
  getMACDAnalysisV3,
  getRatioSlope,
  getRSI,
  getSessionScoreV3,
  getVolumeRatio,
} from './indicators';
import { resolveWhaleWallsForConfirmation } from './whaleMarketBehavior';
import { scoreL7FlowWithWhaleConfirmation } from './whaleConfirmation';

import {
  classifyFundingState,
  convertToGroupScoreV4,
  DECISION_LABELS_V4,
  FundingState,
  getFundingStateLabel,
  HARD_BLOCK_RULES_V4,
  LAYER_L5B_ID,
  LAYER_MAX_POINTS,
  LAYER_NAMES_V4,
  SCORING_GROUPS_V4,
  type DecisionTypeV4,
  type LayerResult,
  type LiquidityPool,
  type PsychologyChecklistV2,
  type PsychologyChecklistV3,
  type ScorerLayerId,
  type AppTradeSymbol,
} from '../constants/scoring';

import type { AllMarketData, OpenInterestHistPoint } from './binanceApi';
import {
  calculateFundingMetrics,
} from './binanceApi';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import { getWhaleRadarSnapshotsSync } from './whaleRadarPersist';
import { buildAnalysisInputFromMarket } from './analysisInput';
import type { SqueezeRiskInput, SqueezeRiskResult } from '../types/squeezeRisk';
import { calculateSqueezeRisk } from './squeezeRiskEngine';
import { resolveNearShortL3Gate } from '../config/nearV4LayerGates';

import type { AnalysisInput } from './analysisInput';
import {
  buildTodayStatsFromJournal,
  lossStreakCooldownL10,
  type TodayStats,
  type TodayStatsLockExtras,
} from './scorerV3';

export type { AnalysisInput };
export type { TodayStats, TodayStatsLockExtras };

/** Funding metrics — đơn vị % (0.01 = 0.01%), khớp classifyFundingState. */
export interface FundingMetricsPct {
  fundingCurrent: number;
  fundingAvg8: number;
  fundingAvg16: number;
  fundingVelocity: number;
  fundingAcceleration: number;
}

export interface L6DetailV4 {
  fundingCurrent: number;
  fundingAvg8: number;
  fundingVelocity: number;
  fundingAcceleration: number;
  fundingState: FundingState;
  isFallback: boolean;
}

export interface AnalysisInputV4 extends AnalysisInput {
  btcKlines1h?: Kline[];
  fundingHistory?: { rate: number; timestamp: number }[];
  fundingMetrics?: FundingMetricsPct | null;
  whaleWalls?: EntryWhaleWalls;
  recentJournal?: Array<{ outcome: { status: string } }>;
  psychologyChecklistV3?: PsychologyChecklistV3;
  /** % thay đổi OI 1H — từ oiEngine history */
  oiChange1h?: number;
  /** % thay đổi OI 4H — từ oiEngine history */
  oiChange4h?: number;
  /** % thay đổi giá 4H */
  priceChange4h?: number;
}

export type Direction = 'LONG' | 'SHORT';

export interface LayerResultV4 {
  layerNumber: number;
  score: number;
  maxScore: number;
  reason: string;
  group: 'A' | 'B' | 'C';
}

export interface GroupScores {
  A: number;
  B: number;
  C: number;
}

export interface DirectionalScoreV4 {
  direction: Direction;
  layers: LayerResultV4[];
  rawLayerScores: Record<number, number>;
  groupScores: GroupScores;
  /** Điểm tham khảo (A+B+C) — ẩn khi awaitingRescore */
  referenceTotalScore: number;
  /** Điểm chính thức cho quyết định — null khi CHỜ TÁI CHẤM */
  officialTotalScore: number | null;
  hardBlocks: string[];
  /** Lý do chặn điểm (không phải hard block) — vd. L5a CVD chưa đủ 1đ */
  blockReasons: string[];
  groupBlocks: string[];
  warnings: string[];
  decision: DecisionTypeV4;
  decisionLabel: string;
  decisionColor: string;
  winrate: string;
  /** L9 là chặn duy nhất — không hiển thị điểm tổng chính thức */
  awaitingRescore: boolean;
  /**
   * NEAR SHORT only — UI badge (S3 L3≥2). Không ảnh hưởng canEnter.
   * @see config/nearV4LayerGates.ts
   */
  signalTags?: ReadonlyArray<'STRONG_L3'>;
}

export interface ScoringResultV4 {
  long: DirectionalScoreV4;
  short: DirectionalScoreV4;
  marketMode: 'TRENDING' | 'RANGING';
  warnings: string[];
  atr1h: number;
  l6Detail: L6DetailV4;
  /** L11 — không cộng vào thang 15 điểm */
  squeezeRisk: SqueezeRiskResult;
}

function layerA(
  num: number,
  score: number,
  reason: string,
): LayerResultV4 {
  return {
    layerNumber: num,
    score: Math.max(0, Math.min(2, score)),
    maxScore: 2,
    reason,
    group: 'A',
  };
}

function layerB(
  num: number,
  score: number,
  maxScore: number,
  reason: string,
): LayerResultV4 {
  return {
    layerNumber: num,
    score: Math.max(0, Math.min(maxScore, score)),
    maxScore,
    reason,
    group: 'B',
  };
}

function layerC(num: number, score: number, reason: string): LayerResultV4 {
  return {
    layerNumber: num,
    score: Math.max(0, Math.min(2, score)),
    maxScore: 2,
    reason,
    group: 'C',
  };
}

function cvdDeltaOverLookback(cvdPoints: CVDPoint[], lookback = 12): number {
  if (cvdPoints.length < 2) return 0;
  const recent = cvdPoints.slice(-Math.min(lookback, cvdPoints.length));
  return recent[recent.length - 1].cvd - recent[0].cvd;
}

function cvdDivergenceAgainstDirection(
  cvdPoints: CVDPoint[],
  direction: Direction,
): boolean {
  if (cvdPoints.length < 2) return false;
  const lookback = Math.min(12, cvdPoints.length);
  const recent = cvdPoints.slice(-lookback);
  const priceDelta = recent[recent.length - 1].price - recent[0].price;
  const cvdDelta = recent[recent.length - 1].cvd - recent[0].cvd;
  const bearishDiv = priceDelta > 0 && cvdDelta < 0;
  const bullishDiv = priceDelta < 0 && cvdDelta > 0;
  return direction === 'LONG' ? bearishDiv : bullishDiv;
}

// ─────────────────────────────────────────
// L1–L4 — giữ nguyên logic V3
// ─────────────────────────────────────────

/** Raw L1 = 4/3 → hiển thị 1đ sau quy đổi LAYER_MAX_POINTS (1.5/2). */
const L1_MTF_CONFLICT_RAW = 2 / LAYER_MAX_POINTS;

export function scoreL1V4(
  direction: Direction,
  ema1h: EMAAnalysisV3,
  ema4h: EMAAnalysisV3,
): LayerResultV4 {
  if (direction === 'LONG') {
    const both1h = ema1h.priceAboveEma20 && ema1h.priceAboveEma50;
    const both4h = ema4h.priceAboveEma20 && ema4h.priceAboveEma50;
    const slopeUp = ema1h.slope20 === 'UP' || ema4h.slope20 === 'UP';
    const nearEma1h = Math.abs(ema1h.priceVsEma20Pct) < 2;
    const nearEma4h = Math.abs(ema4h.priceVsEma20Pct) < 2;

    if (both1h && both4h && slopeUp) {
      return layerA(1, 2, 'Giá trên EMA20/50 cả 2 khung, EMA dốc lên');
    }
    if (both1h && both4h) {
      return layerA(1, 1.5, 'Giá trên EMA nhưng slope phẳng');
    }
    if ((both1h || both4h) && (nearEma1h || nearEma4h)) {
      return layerA(1, 1, 'Đang pullback về EMA — vùng entry hợp lý');
    }
    if (both1h || both4h) {
      return layerA(1, L1_MTF_CONFLICT_RAW, 'Mâu thuẫn 1H vs 4H');
    }
    return layerA(1, 0, 'Giá dưới tất cả EMA cả 2 khung');
  }

  const both1h = !ema1h.priceAboveEma20 && !ema1h.priceAboveEma50;
  const both4h = !ema4h.priceAboveEma20 && !ema4h.priceAboveEma50;
  const slopeDown = ema1h.slope20 === 'DOWN' || ema4h.slope20 === 'DOWN';

  if (both1h && both4h && slopeDown) {
    return layerA(1, 2, 'Giá dưới EMA20/50 cả 2 khung, EMA dốc xuống');
  }
  if (both1h && both4h) {
    return layerA(1, 1.5, 'Giá dưới EMA, slope chưa dốc rõ');
  }
  if (both1h || both4h) {
    return layerA(1, L1_MTF_CONFLICT_RAW, 'Mâu thuẫn 1H vs 4H');
  }
  const partial1h = ema1h.priceAboveEma20 === false && ema1h.priceAboveEma50 === true;
  const partial4h = ema4h.priceAboveEma20 === false && ema4h.priceAboveEma50 === true;
  if (partial1h || partial4h) {
    return layerA(1, 1, 'Giá dưới EMA20 nhưng chưa qua EMA50 — Short chưa đủ mạnh');
  }
  return layerA(1, 0, 'EMA chưa đồng thuận Short — cần giá dưới EMA20 & EMA50');
}

export function scoreL2V4(
  direction: Direction,
  klines1h: Kline[],
  klines4h: Kline[],
): LayerResultV4 {
  const rsi1h = getRSI(klines1h);
  const rsi4h = getRSI(klines4h);
  const div1h = detectRSIDivergenceV3(klines1h);

  if (Number.isNaN(rsi1h) || Number.isNaN(rsi4h)) {
    return layerA(2, 1, 'Không đủ data RSI');
  }

  if (direction === 'LONG') {
    const inSweet = (r: number) => r >= 45 && r <= 65;
    const inOk = (r: number) => (r >= 35 && r < 45) || (r > 65 && r <= 75);

    let score = 0;
    let reason = '';

    if (inSweet(rsi1h) && inSweet(rsi4h)) {
      score = 2;
      reason = `RSI 1H ${rsi1h.toFixed(1)} & 4H ${rsi4h.toFixed(1)} — vùng tối ưu 45-65`;
    } else if (inOk(rsi1h) || inOk(rsi4h)) {
      score = 1;
      reason = `RSI gần vùng tốt (1H: ${rsi1h.toFixed(1)}, 4H: ${rsi4h.toFixed(1)})`;
    } else if (rsi1h < 30 && div1h === 'BULLISH') {
      score = 1.5;
      reason = 'RSI oversold + Bullish divergence — tín hiệu đảo chiều';
    } else {
      score = 0;
      reason = 'RSI quá mua hoặc quá bán không thuận Long';
    }

    if (div1h === 'BULLISH' && score > 0) {
      score = Math.min(2, score + 0.5);
    }

    return layerA(2, score, reason);
  }

  const inSweet = (r: number) => r >= 35 && r <= 55;
  const inOk = (r: number) => (r >= 25 && r < 35) || (r > 55 && r <= 65);

  let score = 0;
  let reason = '';

  if (inSweet(rsi1h) && inSweet(rsi4h)) {
    score = 2;
    reason = `RSI 1H ${rsi1h.toFixed(1)} & 4H ${rsi4h.toFixed(1)} — vùng tối ưu 35-55`;
  } else if (inOk(rsi1h) || inOk(rsi4h)) {
    score = 1;
    reason = `RSI gần vùng Short (1H: ${rsi1h.toFixed(1)}, 4H: ${rsi4h.toFixed(1)})`;
  } else if (rsi1h > 70 && div1h === 'BEARISH') {
    score = 1.5;
    reason = 'RSI overbought + Bearish divergence — tín hiệu đảo chiều';
  } else {
    score = 0;
    reason = 'RSI không thuận Short';
  }

  if (div1h === 'BEARISH' && score > 0) {
    score = Math.min(2, score + 0.5);
  }

  return layerA(2, score, reason);
}

export function scoreL3V4(
  direction: Direction,
  macd1h: MACDAnalysisV3,
  macd4h: MACDAnalysisV3,
): LayerResultV4 {
  const h1 = macd1h.histogram ?? 0;
  const h4 = macd4h.histogram ?? 0;

  if (direction === 'LONG') {
    if (h1 > 0 && h4 > 0) {
      return layerA(3, 2, 'Histogram dương cả 1H & 4H');
    }
    if (macd1h.crossedZeroRecentlyUp || macd4h.crossedZeroRecentlyUp) {
      return layerA(3, 1.5, 'MACD vừa cắt lên 0 — tín hiệu mạnh');
    }
    if (h1 > 0 && macd1h.isTurningUp) {
      return layerA(3, 1.5, '1H dương & đang bẻ góc lên');
    }
    if (macd1h.isTurningUp && macd4h.isTurningUp) {
      return layerA(3, 1.5, 'Cả 2 khung đang bẻ góc lên');
    }
    if (h1 > 0 || h4 > 0 || macd1h.isTurningUp || macd4h.isTurningUp) {
      return layerA(3, 1, '1 khung thuận Long');
    }
    return layerA(3, 0, 'Histogram âm cả 2 khung — VI PHẠM');
  }

  if (direction === 'SHORT') {
    if (h1 > 0 && h4 > 0) {
      return layerA(3, 0, 'Histogram dương cả 2 khung — VI PHẠM Short');
    }
    if (h1 < 0 && h4 < 0) {
      return layerA(3, 2, 'Histogram âm cả 1H & 4H');
    }
    if (macd1h.crossedZeroRecentlyDown || macd4h.crossedZeroRecentlyDown) {
      return layerA(3, 1.5, 'MACD vừa cắt xuống 0 — tín hiệu mạnh');
    }
    if (macd1h.isTurningDown && macd4h.isTurningDown) {
      return layerA(3, 1.5, 'Cả 2 khung đang bẻ góc xuống');
    }
    if (h1 < 0 || h4 < 0 || macd1h.isTurningDown || macd4h.isTurningDown) {
      return layerA(3, 1, '1 khung thuận Short');
    }
    return layerA(3, 0, 'MACD không thuận Short');
  }

  return layerA(3, 0, 'MACD không xác định');
}

export function scoreL4V4(
  direction: Direction,
  bb: BollingerAnalysisV3,
): LayerResultV4 {
  const { percentB, marketMode } = bb;

  if (direction === 'LONG') {
    if (marketMode === 'TRENDING') {
      if (percentB >= 60 && percentB <= 90) {
        return layerA(4, 2, `%B=${percentB.toFixed(0)} Trending nửa trên — ride band`);
      }
      if (percentB >= 40 && percentB < 60) {
        return layerA(4, 1.5, `%B=${percentB.toFixed(0)} Pullback về giữa trong uptrend`);
      }
      if (percentB >= 20 && percentB < 40) {
        return layerA(4, 0.5, `%B=${percentB.toFixed(0)} Đã pullback sâu`);
      }
      return layerA(4, 0, `%B=${percentB.toFixed(0)} Không thuận Long Trending`);
    }
    if (percentB >= 35 && percentB <= 55) {
      return layerA(4, 2, `%B=${percentB.toFixed(0)} Ranging vùng giữa — tốt nhất để buy`);
    }
    if (percentB >= 55 && percentB <= 70) {
      return layerA(4, 1, `%B=${percentB.toFixed(0)} Ranging nửa trên — cẩn thận resistance`);
    }
    if (percentB >= 20 && percentB < 35) {
      return layerA(4, 1, `%B=${percentB.toFixed(0)} Ranging gần band dưới — potential bounce`);
    }
    return layerA(4, 0, `%B=${percentB.toFixed(0)} Không thuận Long Ranging`);
  }

  if (direction === 'SHORT') {
    if (marketMode === 'TRENDING') {
      if (percentB >= 10 && percentB <= 40) {
        return layerA(4, 2, `%B=${percentB.toFixed(0)} Trending nửa dưới — ride band`);
      }
      if (percentB > 40 && percentB <= 60) {
        return layerA(4, 1.5, `%B=${percentB.toFixed(0)} Hồi về giữa trong downtrend`);
      }
      if (percentB > 70) {
        return layerA(4, 0, `%B=${percentB.toFixed(0)} Quá cao — không thuận Short Trending`);
      }
      return layerA(4, 0, `%B=${percentB.toFixed(0)} Không thuận Short Trending`);
    }

    if (percentB < 30) {
      return layerA(4, 0, `%B=${percentB.toFixed(0)} Giá đáy dải — không Short Ranging`);
    }
    if (percentB > 80) {
      return layerA(4, 0, `%B=${percentB.toFixed(0)} Overbought — không Short Ranging`);
    }
    if (percentB >= 45 && percentB <= 65) {
      return layerA(4, 2, `%B=${percentB.toFixed(0)} Ranging vùng giữa — tốt nhất để sell`);
    }
    if ((percentB >= 30 && percentB < 45) || (percentB > 65 && percentB <= 80)) {
      return layerA(4, 1, `%B=${percentB.toFixed(0)} Ranging nửa dải — potential short`);
    }
    return layerA(4, 0, `%B=${percentB.toFixed(0)} Không thuận Short Ranging`);
  }

  return layerA(4, 0, `%B=${percentB.toFixed(0)} Không xác định`);
}

// ─────────────────────────────────────────
// L5a — CVD Strength (BẮT BUỘC raw ≥ 1)
// ─────────────────────────────────────────

export function scoreL5aV4(
  direction: Direction,
  cvdPoints: CVDPoint[],
  longHardBlockContext?: { currentPrice: number; ema20: number },
): { layerResult: LayerResultV4; hardBlock: string | null; warning: string | null } {
  const currentCvd =
    cvdPoints.length > 0 ? cvdPoints[cvdPoints.length - 1].cvd : 0;
  const cvdAnalysis = analyzeCVD(cvdPoints, direction);
  const cvdDelta = cvdDeltaOverLookback(cvdPoints);
  const steepNegative = cvdDelta <= -HARD_BLOCK_RULES_V4.CVD_STEEP_SLOPE_DELTA;
  const steepPositive = cvdDelta >= HARD_BLOCK_RULES_V4.CVD_STEEP_SLOPE_DELTA;
  const divergenceAgainst = cvdDivergenceAgainstDirection(cvdPoints, direction);

  if (direction === 'LONG' && longHardBlockContext) {
    const longCvdHardBlock = evaluateLongCvdHardBlock({
      currentCvd,
      cvdMomentum24h: cvdAnalysis.cvdMomentum24h,
      currentPrice: longHardBlockContext.currentPrice,
      ema20: longHardBlockContext.ema20,
    });
    if (longCvdHardBlock) {
      return {
        layerResult: layerB(
          5,
          0,
          2,
          `CVD ${(currentCvd / 1_000_000).toFixed(2)}M — HARD BLOCK Long`,
        ),
        hardBlock: longCvdHardBlock,
        warning: null,
      };
    }
  }

  if (direction === 'SHORT' && currentCvd > HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK) {
    return {
      layerResult: layerB(
        5,
        0,
        2,
        `CVD +${(currentCvd / 1_000_000).toFixed(2)}M — HARD BLOCK Short`,
      ),
      hardBlock: `CVD +${(currentCvd / 1_000_000).toFixed(2)}M > +2M — chặn Short hoàn toàn`,
      warning: null,
    };
  }

  let score = 0;
  let reason = '';
  let warning: string | null = null;

  if (direction === 'LONG') {
    if (currentCvd > 0 && cvdAnalysis.slope === 'up') {
      score = 2;
      reason = `CVD +${(currentCvd / 1_000).toFixed(0)}K dương & slope tăng rõ trên 1H`;
    } else if (
      currentCvd >= HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE &&
      currentCvd <= 0 &&
      (cvdAnalysis.slope === 'up' || cvdDelta > 0)
    ) {
      score = 1;
      reason = `CVD âm nhẹ (${(currentCvd / 1_000).toFixed(0)}K) nhưng đang cải thiện`;
    } else if (
      currentCvd < HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE ||
      (cvdAnalysis.slope === 'down' && steepNegative)
    ) {
      score = 0;
      reason =
        currentCvd < HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE
          ? `CVD âm sâu ${(currentCvd / 1_000_000).toFixed(2)}M`
          : 'CVD slope âm dốc trên 1H';
    } else {
      score = 0;
      reason = `CVD ${(currentCvd / 1_000).toFixed(0)}K — chưa đủ tín hiệu Long`;
    }
  } else if (currentCvd < 0 && cvdAnalysis.slope === 'down') {
    score = 2;
    reason = `CVD ${(currentCvd / 1_000).toFixed(0)}K âm & slope giảm rõ trên 1H`;
  } else if (
    currentCvd >= 0 &&
    currentCvd <= HARD_BLOCK_RULES_V4.CVD_MILD_POSITIVE &&
    (cvdAnalysis.slope === 'down' || cvdDelta < 0)
  ) {
    score = 1;
    reason = `CVD dương nhẹ (+${(currentCvd / 1_000).toFixed(0)}K) nhưng đang yếu dần`;
  } else if (
    currentCvd > HARD_BLOCK_RULES_V4.CVD_MILD_POSITIVE ||
    (cvdAnalysis.slope === 'up' && steepPositive)
  ) {
    score = 0;
    reason =
      currentCvd > HARD_BLOCK_RULES_V4.CVD_MILD_POSITIVE
        ? `CVD dương sâu +${(currentCvd / 1_000_000).toFixed(2)}M`
        : 'CVD slope dương dốc trên 1H';
  } else {
    score = 0;
    reason = `CVD ${(currentCvd / 1_000).toFixed(0)}K — chưa đủ tín hiệu Short`;
  }

  if (divergenceAgainst) {
    warning =
      direction === 'LONG'
        ? '⚠️ CVD phân kỳ giảm — cảnh báo bull trap'
        : '⚠️ CVD phân kỳ tăng — cảnh báo bear trap / sắp bounce';
  }

  const recoveringAdj = applyRecoveringCvdLocalPenalty(
    score,
    currentCvd,
    cvdAnalysis.cvdMomentum24h,
  );
  score = recoveringAdj.score;
  if (recoveringAdj.warning) {
    warning = recoveringAdj.warning;
  }
  if (recoveringAdj.reason) {
    reason = `${reason} · ${recoveringAdj.reason}`;
  }

  return {
    layerResult: layerB(5, score, 2, reason),
    hardBlock: null,
    warning,
  };
}

// ─────────────────────────────────────────
// L5b — Volume / OI (không CVD)
// ─────────────────────────────────────────

export function scoreL5bV4(
  direction: Direction,
  klines1h: Kline[],
  oiCurrent: number,
  oiPrevious: number,
  priceChangePct: number,
): LayerResultV4 {
  let score = 0;
  const signals: string[] = [];

  const volRatio = getVolumeRatio(klines1h);
  if (volRatio >= 1.5) {
    score += 1;
    signals.push(`Vol ${volRatio.toFixed(1)}×`);
  } else if (volRatio >= 1.2) {
    score += 0.5;
    signals.push(`Vol ${volRatio.toFixed(1)}×`);
  }

  const oiChange = oiCurrent - oiPrevious;

  if (direction === 'LONG') {
    if (oiChange > 0 && priceChangePct > 0) {
      score += 1;
      signals.push('OI tăng+giá tăng');
    } else if (oiChange < 0 && priceChangePct > 0) {
      score += 0.3;
      signals.push('Short covering');
    } else if (oiChange > 0 && priceChangePct < 0) {
      score -= 0.5;
      signals.push('OI tăng nhưng giá giảm — phân kỳ, trừ điểm');
    }
  } else if (oiChange > 0 && priceChangePct < 0) {
    score += 1;
    signals.push('OI tăng+giá giảm');
  } else if (oiChange < 0 && priceChangePct < 0) {
    score += 0.3;
    signals.push('Long covering');
  } else if (oiChange > 0 && priceChangePct > 0) {
    score -= 0.5;
    signals.push('OI tăng nhưng giá tăng — phân kỳ, trừ điểm');
  }

  return layerB(
    LAYER_L5B_ID,
    Math.max(0, Math.min(2, score)),
    2,
    signals.join(', ') || 'Không có tín hiệu Volume/OI rõ',
  );
}

// ─────────────────────────────────────────
// L6 — Funding V4 (FundingState hoặc fallback legacy)
// ─────────────────────────────────────────

const L6_RAW_MAX = 2;

const LONG_L6_BY_STATE: Record<FundingState, number> = {
  [FundingState.SHORT_SQUEEZE_BUILDING]: 2,
  [FundingState.SHORT_EUPHORIA_FADING]: 1.5,
  [FundingState.NEUTRAL]: 1,
  [FundingState.LONG_EUPHORIA_FADING]: 0.5,
  [FundingState.LONG_FUNDING_ELEVATED]: 0.5,
  [FundingState.EXTREME_LONG_EUPHORIA]: 0,
};

const SHORT_L6_BY_STATE: Record<FundingState, number> = {
  [FundingState.EXTREME_LONG_EUPHORIA]: 2,
  [FundingState.LONG_EUPHORIA_FADING]: 1.5,
  [FundingState.LONG_FUNDING_ELEVATED]: 1.5,
  [FundingState.NEUTRAL]: 1,
  [FundingState.SHORT_EUPHORIA_FADING]: 0.5,
  [FundingState.SHORT_SQUEEZE_BUILDING]: 0,
};

export function emptyL6DetailV4(fundingCurrent = 0): L6DetailV4 {
  return {
    fundingCurrent,
    fundingAvg8: fundingCurrent,
    fundingVelocity: 0,
    fundingAcceleration: 0,
    fundingState: FundingState.NEUTRAL,
    isFallback: true,
  };
}

export function resolveL6DetailV4(
  funding: FundingAnalysisV3,
  fundingMetrics?: FundingMetricsPct | null,
): L6DetailV4 {
  if (!fundingMetrics) {
    return emptyL6DetailV4(funding.currentRate);
  }

  const fundingState = classifyFundingState(
    fundingMetrics.fundingCurrent,
    fundingMetrics.fundingVelocity,
    fundingMetrics.fundingAcceleration,
  );

  return {
    fundingCurrent: fundingMetrics.fundingCurrent,
    fundingAvg8: fundingMetrics.fundingAvg8,
    fundingVelocity: fundingMetrics.fundingVelocity,
    fundingAcceleration: fundingMetrics.fundingAcceleration,
    fundingState,
    isFallback: false,
  };
}

export function l6RawScoreFromDirectional(d: DirectionalScoreV4): number {
  return d.rawLayerScores[6] ?? d.layers.find((l) => l.layerNumber === 6)?.score ?? 0;
}

export function fundingMetricsPctFromRecords(
  records: { fundingRate: number; fundingTime: number }[],
): FundingMetricsPct | null {
  if (records.length === 0) return null;
  const ratesDecimal = [...records]
    .sort((a, b) => b.fundingTime - a.fundingTime)
    .map((r) => r.fundingRate);
  const metrics = calculateFundingMetrics(ratesDecimal);
  if (!metrics) return null;
  return {
    fundingCurrent: metrics.fundingCurrent * 100,
    fundingAvg8: metrics.fundingAvg8 * 100,
    fundingAvg16: metrics.fundingAvg16 * 100,
    fundingVelocity: metrics.fundingVelocity * 100,
    fundingAcceleration: metrics.fundingAcceleration * 100,
  };
}

function scoreL6V4Legacy(
  direction: Direction,
  funding: FundingAnalysisV3,
): LayerResultV4 {
  const { currentRate, trend } = funding;

  let score = 0;
  let reason = `Funding ${currentRate.toFixed(4)}% (fallback)`;

  if (direction === 'LONG') {
    if (currentRate < 0 && trend === 'FALLING') {
      score = 1;
      reason += ' âm & giảm — lý tưởng Long';
    } else if (currentRate < 0) {
      score = 0.75;
      reason += ' âm — tốt cho Long';
    } else if (currentRate <= 0.005 && trend === 'FALLING') {
      score = 0.75;
      reason += ' thấp & giảm — tốt';
    } else if (currentRate <= 0.005) {
      score = 0.5;
      reason += ' chấp nhận được';
    } else if (currentRate <= 0.01 && trend !== 'RISING') {
      score = 0.25;
      reason += ' hơi cao — cẩn thận';
    } else {
      score = 0;
      reason += ' cao — không thuận Long';
    }
  } else if (currentRate > 0 && trend === 'RISING') {
    score = 1;
    reason += ' dương & tăng — lý tưởng Short';
  } else if (currentRate > 0) {
    score = 0.75;
    reason += ' dương — tốt cho Short';
  } else if (currentRate >= -0.005 && trend === 'RISING') {
    score = 0.75;
    reason += ' gần 0 & tăng — tốt';
  } else if (currentRate >= -0.005) {
    score = 0.5;
    reason += ' chấp nhận được';
  } else if (currentRate >= -0.01 && trend !== 'FALLING') {
    score = 0.25;
    reason += ' hơi thấp — cẩn thận';
  } else {
    score = 0;
    reason += ' thấp — không thuận Short';
  }

  return layerB(6, score, 1, reason);
}

export function scoreL6V4(
  direction: Direction,
  funding: FundingAnalysisV3,
  fundingMetrics?: FundingMetricsPct | null,
): { layerResult: LayerResultV4; hardBlock: string | null } {
  const { currentRate, extremeRisk } = funding;

  if (direction === 'LONG' && extremeRisk === 'LONG_SQUEEZE') {
    return {
      layerResult: layerB(
        6,
        0,
        L6_RAW_MAX,
        `Funding ${currentRate.toFixed(4)}% — LONG SQUEEZE RISK`,
      ),
      hardBlock: `Funding ${currentRate.toFixed(4)}% quá cao — chặn Long`,
    };
  }
  if (direction === 'SHORT' && extremeRisk === 'SHORT_SQUEEZE') {
    return {
      layerResult: layerB(
        6,
        0,
        L6_RAW_MAX,
        `Funding ${currentRate.toFixed(4)}% — SHORT SQUEEZE RISK`,
      ),
      hardBlock: `Funding ${currentRate.toFixed(4)}% quá thấp — chặn Short`,
    };
  }

  if (!fundingMetrics) {
    return { layerResult: scoreL6V4Legacy(direction, funding), hardBlock: null };
  }

  const state = classifyFundingState(
    fundingMetrics.fundingCurrent,
    fundingMetrics.fundingVelocity,
    fundingMetrics.fundingAcceleration,
  );
  const scoreMap = direction === 'LONG' ? LONG_L6_BY_STATE : SHORT_L6_BY_STATE;
  const score = scoreMap[state];
  const label = getFundingStateLabel(state);
  const reason =
    `Funding ${fundingMetrics.fundingCurrent.toFixed(4)}% · ` +
    `${label.icon} ${label.text}`;

  return { layerResult: layerB(6, score, L6_RAW_MAX, reason), hardBlock: null };
}

// ─────────────────────────────────────────
// L7 — L/S Ratio + Whale Wall
// ─────────────────────────────────────────

export function scoreL7V4(
  direction: Direction,
  topRatios: number[],
  _globalRatios: number[],
  whaleWalls: EntryWhaleWalls,
  currentPrice: number,
  atr: number,
  symbol?: AppTradeSymbol,
): { layerResult: LayerResultV4; warning: string | null } {
  void _globalRatios;
  const topSlope = getRatioSlope(topRatios);
  const currentRatio = topRatios[topRatios.length - 1] ?? 1;
  let warning: string | null = null;

  if (currentRatio > HARD_BLOCK_RULES_V4.LS_RATIO_EXTREME_HIGH) {
    warning = `⚠️ L/S ratio ${currentRatio.toFixed(2)} quá cao — đám đông đang Long cực đoan, risk long squeeze`;
  } else if (currentRatio < HARD_BLOCK_RULES_V4.LS_RATIO_EXTREME_LOW) {
    warning = `⚠️ L/S ratio ${currentRatio.toFixed(2)} quá thấp — đám đông Short cực đoan, risk short squeeze`;
  }

  const flow = scoreL7FlowWithWhaleConfirmation(
    direction,
    topSlope,
    whaleWalls,
    currentPrice,
    atr,
    symbol,
  );

  return {
    layerResult: layerB(7, flow.score, 2, flow.reason),
    warning,
  };
}

// ─────────────────────────────────────────
// L8–L10 — giữ nguyên logic V3
// ─────────────────────────────────────────

export function scoreL8V4(
  direction: Direction,
  btc: BTCAnalysisV3,
): { layerResult: LayerResultV4; hardBlock: string | null; warning: string | null } {
  const { change24h, change1h, momentum } = btc;
  let hardBlock: string | null = null;
  let warning: string | null = null;

  const blockReasons: string[] = [];

  if (Math.abs(change24h) > HARD_BLOCK_RULES_V4.BTC_EXTREME_PCT) {
    blockReasons.push(
      `BTC biến động ${change24h.toFixed(2)}% — quá rủi ro, chặn cả 2 chiều`,
    );
  }
  if (direction === 'LONG' && change24h <= HARD_BLOCK_RULES_V4.BTC_LONG_BLOCK_PCT) {
    blockReasons.push(`BTC ${change24h.toFixed(2)}% ≤ -2% — chặn Long alt`);
  }
  if (direction === 'SHORT' && change24h >= HARD_BLOCK_RULES_V4.BTC_SHORT_BLOCK_PCT) {
    blockReasons.push(`BTC ${change24h.toFixed(2)}% ≥ +2% — chặn Short alt`);
  }

  if (blockReasons.length > 0) {
    hardBlock = blockReasons.join(' | ');
  }

  let score = 0;
  let reason = `BTC 24h ${change24h.toFixed(2)}%, 1h ${change1h.toFixed(2)}%`;

  if (direction === 'LONG') {
    if (change24h > 0 && change1h > 0) {
      score = momentum === 'ACCELERATING' ? 2 : 1.5;
      reason += ' — cùng chiều tăng';
    } else if (change24h > 0 && Math.abs(change1h) <= 0.3) {
      score = 1.5;
      reason += ' — 24h xanh, 1h flat';
    } else if (change24h > 0 && change1h < 0) {
      score = 1;
      warning = '⚠️ BTC 24h xanh nhưng 1H đang quay đầu — theo dõi thêm';
      reason += ' — đang pullback ngắn hạn';
    } else if (change24h >= -0.5) {
      score = 1;
      reason += ' — trung tính';
    } else if (change1h > 0.3) {
      score = 0.5;
      reason += ' — 24h đỏ nhưng 1H đang phục hồi';
    } else {
      score = 0;
      reason += ' — đỏ cả 2 khung';
    }
  } else if (change24h < 0 && change1h < 0) {
    score = momentum === 'ACCELERATING' ? 2 : 1.5;
    reason += ' — cùng chiều giảm';
  } else if (change24h < 0 && Math.abs(change1h) <= 0.3) {
    score = 1.5;
    reason += ' — 24h đỏ, 1h flat';
  } else if (change24h < 0 && change1h > 0) {
    score = 1;
    warning = '⚠️ BTC 24h đỏ nhưng 1H đang hồi — cẩn thận bounce';
    reason += ' — đang hồi ngắn hạn';
  } else if (change24h <= 0.5) {
    score = 1;
    reason += ' — trung tính';
  } else if (change1h < -0.3) {
    score = 0.5;
    reason += ' — 24h xanh nhưng 1H đang quay đầu';
  } else {
    score = 0;
    reason += ' — xanh cả 2 khung — không thuận Short';
  }

  return {
    layerResult: layerC(8, score, reason),
    hardBlock,
    warning,
  };
}

export function scoreL9V4(): LayerResultV4 {
  const { score, sessionName, reason } = getSessionScoreV3();
  return layerC(9, score, `${sessionName}: ${reason}`);
}

function psychologyChecklistForV4(input: AnalysisInputV4): PsychologyChecklistV3 {
  if (input.psychologyChecklistV3) return input.psychologyChecklistV3;
  const c = input.psychologyChecklist;
  return {
    alert: c.alert,
    chartStudied: false,
    noFomo: c.noFomo,
    slTpReady: c.slTpReady,
    riskAccepted: c.dailyLossOk && c.noLossStreak,
  };
}

/** Reason copy for L10 checklist count — display text only, no score impact. */
function psychologyChecklistReasonText(checked: number): string {
  switch (checked) {
    case 5:
      return '5/5 mục — đạt tối đa';
    case 4:
      return '4/5 mục — đạt';
    case 3:
      return '3/5 mục — đạt tối thiểu';
    case 2:
      return '2/5 mục — chưa đủ, tâm lý chưa sẵn sàng';
    case 1:
      return '1/5 mục — không đạt';
    default:
      return '0/5 mục — không đạt';
  }
}

export function scoreL10V4(
  checklist: PsychologyChecklistV3,
  todayStats: TodayStats,
  journal: Array<{ outcome: { status: string } }>,
): { layerResult: LayerResultV4; hardBlock: string | null; warning: string | null } {
  // TODO: BẬT LẠI KHI PRODUCTION
  // if (todayStats.lossStreakLocked) {
  //   const cooldown = lossStreakCooldownL10(todayStats);
  //   if (cooldown) {
  //     return {
  //       layerResult: layerC(10, 0, cooldown.layerReason),
  //       hardBlock: cooldown.hardBlock,
  //       warning: null,
  //     };
  //   }
  // }
  // if (todayStats.dailyLossUSDT >= HARD_BLOCK_RULES_V4.MAX_DAILY_LOSS_USDT) {
  //   return {
  //     layerResult: layerC(
  //       10,
  //       0,
  //       `Lỗ ngày ${todayStats.dailyLossUSDT.toFixed(2)} USDT — dừng hôm nay`,
  //     ),
  //     hardBlock: 'Lỗ ngày ≥ 3 USDT — chặn giao dịch',
  //     warning: null,
  //   };
  // }

  const checked = Object.values(checklist).filter(Boolean).length;
  const total = Object.keys(checklist).length;

  let score = 0;
  if (checked === total) score = 2;
  else if (checked >= total - 1) score = 1.5;
  else if (checked >= 3) score = 1;
  else if (checked >= 2) score = 0.5;

  const streakCheck = checkWinStreakV3(journal);
  let warning: string | null = null;
  if (streakCheck.hasWarning) {
    warning = streakCheck.message;
    score = Math.max(0, score - 0.5);
  }

  // Reason text only — PASS/block thresholds & score unchanged.
  const reason = psychologyChecklistReasonText(checked);

  return {
    layerResult: layerC(10, score, reason),
    hardBlock: null,
    warning,
  };
}

function resolveDecision(referenceTotal: number): DecisionTypeV4 {
  if (referenceTotal >= 11.5) return 'SETUP_NGON';
  if (referenceTotal >= 10) return 'VAO_TU_TIN';
  if (referenceTotal >= 9) return 'CO_THE_VAO';
  if (referenceTotal >= 8) return 'CHO_THEM';
  return 'KHONG_VAO';
}

function isOnlyL9SessionBlock(hardBlocks: string[]): boolean {
  return (
    hardBlocks.length === 1 &&
    hardBlocks[0].startsWith('L9 Phiên xấu')
  );
}

function wouldPassWithoutL9(
  groupBlocks: string[],
  hardBlocks: string[],
  referenceTotal: number,
  blockReasons: string[] = [],
): boolean {
  const otherBlocks = hardBlocks.filter((b) => !b.startsWith('L9 Phiên xấu'));
  if (otherBlocks.length > 0 || groupBlocks.length > 0 || blockReasons.length > 0) return false;
  const decision = resolveDecision(referenceTotal);
  return decision !== 'KHONG_VAO' && decision !== 'CHO_THEM';
}

function priceChangePctFromKlines(klines: Kline[], bars = 1): number {
  if (klines.length <= bars) return 0;
  const prev = klines[klines.length - 1 - bars].close;
  const last = klines[klines.length - 1].close;
  if (prev <= 0) return 0;
  return ((last - prev) / prev) * 100;
}

export function computeOiPctChangeFromHistory(
  history: OpenInterestHistPoint[],
  hoursAgo: number,
): number {
  if (history.length === 0) return 0;
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const current = sorted[sorted.length - 1].sumOpenInterest;
  if (current <= 0) return 0;
  const targetTs = sorted[sorted.length - 1].timestamp - hoursAgo * 3_600_000;
  let ref = sorted[0];
  for (const point of sorted) {
    if (point.timestamp <= targetTs) ref = point;
    else break;
  }
  if (ref.sumOpenInterest <= 0) return 0;
  return ((current - ref.sumOpenInterest) / ref.sumOpenInterest) * 100;
}

function resolveSqueezeWhaleWall(
  whaleWalls: EntryWhaleWalls,
  fundingCurrent: number,
): Pick<SqueezeRiskInput, 'whaleWallDirection' | 'whaleWallDistancePercent'> {
  const nearestAsk = whaleWalls.askWalls[0];
  const nearestBid = whaleWalls.bidWalls[0];
  const askDist = nearestAsk ? Math.abs(nearestAsk.distancePct) : null;
  const bidDist = nearestBid ? Math.abs(nearestBid.distancePct) : null;

  if (fundingCurrent > 0.005 && nearestAsk && askDist != null) {
    return { whaleWallDirection: 'ASK', whaleWallDistancePercent: askDist };
  }
  if (fundingCurrent < -0.005 && nearestBid && bidDist != null) {
    return { whaleWallDirection: 'BID', whaleWallDistancePercent: bidDist };
  }

  if (askDist == null && bidDist == null) {
    return { whaleWallDirection: 'NONE', whaleWallDistancePercent: 100 };
  }
  if (askDist != null && (bidDist == null || askDist <= bidDist)) {
    return { whaleWallDirection: 'ASK', whaleWallDistancePercent: askDist };
  }
  return { whaleWallDirection: 'BID', whaleWallDistancePercent: bidDist! };
}

export function buildSqueezeRiskInputFromV4(
  input: AnalysisInputV4,
  l6Detail: L6DetailV4,
  whaleWalls: EntryWhaleWalls,
): SqueezeRiskInput {
  const longShortRatio =
    input.topLongShortRatios[input.topLongShortRatios.length - 1] ?? 1;
  const wall = resolveSqueezeWhaleWall(whaleWalls, l6Detail.fundingCurrent);

  return {
    fundingCurrent: l6Detail.fundingCurrent,
    fundingVelocity: l6Detail.fundingVelocity,
    fundingAcceleration: l6Detail.fundingAcceleration,
    currentOI: input.oiCurrent,
    oiChange1h: input.oiChange1h ?? 0,
    oiChange4h: input.oiChange4h ?? 0,
    priceChange1h: input.priceChangePct1h,
    priceChange4h: input.priceChange4h ?? priceChangePctFromKlines(input.klines4h, 1),
    longShortRatio,
    whaleWallDirection: wall.whaleWallDirection,
    whaleWallDistancePercent: wall.whaleWallDistancePercent,
  };
}

export function neutralSqueezeRiskResult(): SqueezeRiskResult {
  return calculateSqueezeRisk({
    fundingCurrent: 0,
    fundingVelocity: 0,
    fundingAcceleration: 0,
    currentOI: 0,
    oiChange1h: 0,
    oiChange4h: 0,
    priceChange1h: 0,
    priceChange4h: 0,
    longShortRatio: 1,
    whaleWallDirection: 'NONE',
    whaleWallDistancePercent: 100,
  });
}

// ─────────────────────────────────────────
// HÀM TỔNG HỢP: scoreAnalysisV4()
// ─────────────────────────────────────────

export function scoreAnalysisV4(
  input: AnalysisInputV4,
  todayStats: TodayStats,
): ScoringResultV4 {
  const ema1h = getEMAAnalysisV3(input.klines1h);
  const ema4h = getEMAAnalysisV3(input.klines4h);
  const bb1h = getBollingerAnalysisV3(input.klines1h);
  const macd1h = getMACDAnalysisV3(input.klines1h);
  const macd4h = getMACDAnalysisV3(input.klines4h);
  const btc = getBTCAnalysisV3(input.btcKlines1h ?? [], input.btc24hChangePct);
  const funding = getFundingAnalysisV3(input.fundingHistory ?? []);
  const l6Detail = resolveL6DetailV4(funding, input.fundingMetrics);
  const whaleWalls = input.whaleWalls ?? { bidWalls: [], askWalls: [] };
  const whaleWallsForL7 = resolveWhaleWallsForConfirmation(bb1h.marketMode, whaleWalls);
  const journal = input.recentJournal ?? [];
  const checklist = psychologyChecklistForV4(input);

  const buildDirectional = (direction: Direction): DirectionalScoreV4 => {
    const warnings: string[] = [];
    const hardBlocks: string[] = [];
    const blockReasons: string[] = [];

    const l1 = scoreL1V4(direction, ema1h, ema4h);
    const l2 = scoreL2V4(direction, input.klines1h, input.klines4h);
    const l3 = scoreL3V4(direction, macd1h, macd4h);
    const l4 = scoreL4V4(direction, bb1h);
    const rawA = l1.score + l2.score + l3.score + l4.score;
    const groupA = convertToGroupScoreV4(rawA, 'GROUP_A_TREND');

    if (l1.score < 2) {
      warnings.push(`L1 chưa đủ 2đ (${l1.score}đ) — ${l1.reason}`);
    }
    if (l3.score < 1) {
      hardBlocks.push(`L3 MACD vi phạm — ${l3.reason}`);
    }
    // S1/S3 NEAR-only SHORT — post-score; không sửa scoreL3V4.
    const nearShortL3 = resolveNearShortL3Gate(input.symbol, direction, l3.score);
    if (nearShortL3.hardBlockReason) {
      hardBlocks.push(nearShortL3.hardBlockReason);
    }
    const signalTags = nearShortL3.signalTags;

    const l5aRes = scoreL5aV4(direction, input.cvdPoints, {
      currentPrice: input.currentPrice,
      ema20: ema1h.ema20,
    });
    const l5b = scoreL5bV4(
      direction,
      input.klines1h,
      input.oiCurrent,
      input.oiPrevious,
      input.priceChangePct1h,
    );
    const l6Res = scoreL6V4(direction, funding, input.fundingMetrics);
    const l7Res = scoreL7V4(
      direction,
      input.topLongShortRatios,
      input.globalLongShortRatios,
      whaleWallsForL7,
      input.currentPrice,
      input.atr1h,
      input.symbol as AppTradeSymbol,
    );

    if (l5aRes.hardBlock) hardBlocks.push(l5aRes.hardBlock);
    if (l5aRes.warning) warnings.push(l5aRes.warning);
    if (l5aRes.layerResult.score < 1 && !l5aRes.hardBlock) {
      blockReasons.push(`L5a CVD chưa đủ 1đ — ${l5aRes.layerResult.reason}`);
    }
    if (l6Res.hardBlock) hardBlocks.push(l6Res.hardBlock);
    if (l7Res.warning) warnings.push(l7Res.warning);

    const rawB =
      l5aRes.layerResult.score +
      l5b.score +
      l6Res.layerResult.score +
      l7Res.layerResult.score;
    const groupB = convertToGroupScoreV4(rawB, 'GROUP_B_FLOW');

    const l8Res = scoreL8V4(direction, btc);
    const l9 = scoreL9V4();
    const l10Res = scoreL10V4(checklist, todayStats, journal);

    if (l8Res.hardBlock) hardBlocks.push(l8Res.hardBlock);
    if (l8Res.warning) warnings.push(l8Res.warning);
    if (l10Res.hardBlock) hardBlocks.push(l10Res.hardBlock);
    if (l10Res.warning) warnings.push(l10Res.warning);

    const l9Bad = l9.score < 0.5;
    if (l9Bad) {
      hardBlocks.push(`L9 Phiên xấu — ${l9.reason}`);
    }
    if (l10Res.layerResult.score < 1 && !l10Res.hardBlock) {
      hardBlocks.push('L10 Tâm lý chưa sẵn sàng');
    }

    const rawC = l8Res.layerResult.score + l9.score + l10Res.layerResult.score;
    const groupC = convertToGroupScoreV4(rawC, 'GROUP_C_CONTEXT');

    const groupBlocks: string[] = [];
    if (groupA < SCORING_GROUPS_V4.GROUP_A_TREND.minRequired) {
      groupBlocks.push(
        `Nhóm A (Xu hướng) ${groupA.toFixed(1)}/5đ < ${SCORING_GROUPS_V4.GROUP_A_TREND.minRequired}đ`,
      );
    }
    if (groupB < SCORING_GROUPS_V4.GROUP_B_FLOW.minRequired) {
      groupBlocks.push(
        `Nhóm B (Dòng tiền) ${groupB.toFixed(1)}/5đ < ${SCORING_GROUPS_V4.GROUP_B_FLOW.minRequired}đ`,
      );
    }
    if (groupC < SCORING_GROUPS_V4.GROUP_C_CONTEXT.minRequired) {
      groupBlocks.push(
        `Nhóm C (Bối cảnh) ${groupC.toFixed(1)}/5đ < ${SCORING_GROUPS_V4.GROUP_C_CONTEXT.minRequired}đ`,
      );
    }

    const referenceTotalScore = +(groupA + groupB + groupC).toFixed(2);
    const isBlocked =
      hardBlocks.length > 0 || blockReasons.length > 0 || groupBlocks.length > 0;

    let awaitingRescore = false;
    let decision: DecisionTypeV4 = 'KHONG_VAO';
    let decisionLabel: string;
    let officialTotalScore: number | null = null;

    if (
      l9Bad &&
      isOnlyL9SessionBlock(hardBlocks) &&
      wouldPassWithoutL9(groupBlocks, hardBlocks, referenceTotalScore, blockReasons)
    ) {
      awaitingRescore = true;
      decision = 'CHO_TAI_CHAM';
      decisionLabel =
        'CHỜ TÁI CHẤM — KHÔNG HIỂN THỊ ĐIỂM SỐ TẠM TÍNH CHO QUYẾT ĐỊNH CUỐI';
      officialTotalScore = null;
    } else if (!isBlocked) {
      decision = resolveDecision(referenceTotalScore);
      officialTotalScore = referenceTotalScore;
      const info = DECISION_LABELS_V4[decision];
      decisionLabel = info.label;
    } else {
      const info = DECISION_LABELS_V4.KHONG_VAO;
      decisionLabel = info.label;
    }

    const info = DECISION_LABELS_V4[decision];

    const rawLayerScores: Record<number, number> = {
      1: l1.score,
      2: l2.score,
      3: l3.score,
      4: l4.score,
      5: l5aRes.layerResult.score,
      [LAYER_L5B_ID]: l5b.score,
      6: l6Res.layerResult.score,
      7: l7Res.layerResult.score,
      8: l8Res.layerResult.score,
      9: l9.score,
      10: l10Res.layerResult.score,
    };

    return {
      direction,
      layers: [
        l1,
        l2,
        l3,
        l4,
        l5aRes.layerResult,
        l5b,
        l6Res.layerResult,
        l7Res.layerResult,
        l8Res.layerResult,
        l9,
        l10Res.layerResult,
      ],
      rawLayerScores,
      groupScores: { A: groupA, B: groupB, C: groupC },
      referenceTotalScore,
      officialTotalScore,
      hardBlocks,
      blockReasons,
      groupBlocks,
      warnings,
      decision,
      decisionLabel: awaitingRescore ? decisionLabel! : info.label,
      decisionColor: info.color,
      winrate: awaitingRescore ? '—' : info.winrate,
      awaitingRescore,
      ...(signalTags.length > 0 ? { signalTags } : {}),
    };
  };

  const squeezeRisk = calculateSqueezeRisk(
    buildSqueezeRiskInputFromV4(input, l6Detail, whaleWalls),
  );

  return {
    long: buildDirectional('LONG'),
    short: buildDirectional('SHORT'),
    marketMode: bb1h.marketMode,
    warnings: [],
    atr1h: input.atr1h,
    l6Detail,
    squeezeRisk,
  };
}

export function canEnterV4(active: DirectionalScoreV4): boolean {
  return (
    !active.awaitingRescore &&
    active.hardBlocks.length === 0 &&
    active.blockReasons.length === 0 &&
    active.groupBlocks.length === 0 &&
    active.decision !== 'KHONG_VAO' &&
    active.decision !== 'CHO_THEM' &&
    active.decision !== 'CHO_TAI_CHAM'
  );
}

export function suggestDirectionV4(result: ScoringResultV4): Direction {
  const { long, short } = result;
  if (long.hardBlocks.length > 0 && short.hardBlocks.length === 0) return 'SHORT';
  if (short.hardBlocks.length > 0 && long.hardBlocks.length === 0) return 'LONG';
  if (long.awaitingRescore && !short.awaitingRescore) return 'SHORT';
  if (short.awaitingRescore && !long.awaitingRescore) return 'LONG';
  if (long.decision === 'KHONG_VAO' && short.decision !== 'KHONG_VAO') return 'SHORT';
  if (short.decision === 'KHONG_VAO' && long.decision !== 'KHONG_VAO') return 'LONG';
  const longScore = long.officialTotalScore ?? long.referenceTotalScore;
  const shortScore = short.officialTotalScore ?? short.referenceTotalScore;
  return longScore >= shortScore ? 'LONG' : 'SHORT';
}

export { DECISION_LABELS_V4 };

const WEIGHT_PER_RAW_V4 = LAYER_MAX_POINTS / 2;

export function buildAnalysisInputV4FromMarket(params: {
  symbol: string;
  currentPrice: number;
  market: AllMarketData;
  psychologyChecklist: PsychologyChecklistV2;
  btc24hChangePct: number;
  btcKlines1h?: Kline[];
  liquidityPools?: LiquidityPool[];
  recentJournal?: AnalysisInputV4['recentJournal'];
}): AnalysisInputV4 | null {
  const base = buildAnalysisInputFromMarket(params);
  if (!base) return null;

  const fundingHistory = (params.market.fundingHistory?.records ?? []).map((r) => ({
    rate: r.fundingRate * 100,
    timestamp: r.fundingTime,
  }));

  const fundingMetrics = fundingMetricsPctFromRecords(
    params.market.fundingHistory?.records ?? [],
  );

  const radarSnap = getWhaleRadarSnapshotsSync()[params.symbol as AppTradeSymbol];
  const whaleWalls = buildWhaleEntryWalls(
    params.symbol as AppTradeSymbol,
    params.currentPrice,
    base.atr1h,
    params.liquidityPools ?? [],
    radarSnap?.scannedAt,
  );

  const oiHist = params.market.oiEngine?.history ?? [];

  return {
    ...base,
    btcKlines1h:
      params.btcKlines1h ??
      (params.symbol === 'BTCUSDT' ? base.klines1h : undefined),
    fundingHistory,
    fundingMetrics,
    whaleWalls,
    recentJournal: params.recentJournal,
    oiChange1h: computeOiPctChangeFromHistory(oiHist, 1),
    oiChange4h: computeOiPctChangeFromHistory(oiHist, 4),
    priceChange4h: priceChangePctFromKlines(base.klines4h, 1),
  };
}

export function buildTodayStatsFromJournalV4(
  consecutiveLosses: number,
  dailyLossUSDT: number,
  lock?: TodayStatsLockExtras,
): TodayStats {
  return buildTodayStatsFromJournal(consecutiveLosses, dailyLossUSDT, lock);
}

export function scoringLayersToDisplayV4(layers: LayerResultV4[]): LayerResult[] {
  return layers.map((layer) => {
    const weighted =
      Math.round((layer.score / layer.maxScore) * LAYER_MAX_POINTS * 100) / 100;
    return {
      layer: layer.layerNumber as ScorerLayerId,
      name: LAYER_NAMES_V4[layer.layerNumber] ?? `L${layer.layerNumber}`,
      score: weighted,
      maxScore: LAYER_MAX_POINTS,
      passed: layer.score > 0,
      isMandatory: layer.layerNumber === 5,
      isMandatoryViolation: layer.layerNumber === 5 && layer.score < 1,
      reason: layer.reason,
    };
  });
}

/** Adapter cho tradePlanV3 — cùng shape quyết định/nhóm điểm */
export function toTradePlanScoringV4(result: ScoringResultV4): {
  long: {
    decision: string;
    groupScores: GroupScores;
    totalScore: number;
  };
  short: {
    decision: string;
    groupScores: GroupScores;
    totalScore: number;
  };
  marketMode: ScoringResultV4['marketMode'];
} {
  const mapDir = (d: DirectionalScoreV4) => ({
    decision: d.awaitingRescore ? 'CHO_THEM' : d.decision,
    groupScores: d.groupScores,
    totalScore: d.officialTotalScore ?? d.referenceTotalScore,
  });
  return {
    long: mapDir(result.long),
    short: mapDir(result.short),
    marketMode: result.marketMode,
  };
}
