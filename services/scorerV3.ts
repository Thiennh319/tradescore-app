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
  convertToGroupScore,
  DECISION_LABELS_V2,
  HARD_BLOCK_RULES_V3,
  LAYER_MAX_POINTS,
  LAYER_NAMES_V3,
  SCORING_GROUPS_V3,
  type DecisionTypeV2,
  type LayerResult,
  type LiquidityPool,
  type PsychologyChecklistV2,
  type PsychologyChecklistV3,
  type ScorerLayerId,
} from '../constants/scoring';

import type { AllMarketData } from './binanceApi';
import { buildAnalysisInputFromMarket } from './analysisInput';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import type { AppTradeSymbol } from '../constants/scoring';
import { getWhaleRadarSnapshotsSync } from './whaleRadarPersist';

import type { AnalysisInput } from './analysisInput';

export type { AnalysisInput };

/** Stats hôm nay cho L10 / hard block V3 */
export interface TodayStats {
  consecutiveLosses: number;
  dailyLossUSDT: number;
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
}

export interface TodayStatsLockExtras {
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
}

export function lossStreakCooldownL10(
  todayStats: TodayStats,
  now = Date.now(),
): { layerReason: string; hardBlock: string } | null {
  if (!todayStats.lossStreakLocked || todayStats.lossStreakLockUntil == null) return null;
  const minsLeft = Math.max(
    1,
    Math.ceil((todayStats.lossStreakLockUntil - now) / 60_000),
  );
  const count = todayStats.consecutiveLossesIn24h;
  return {
    layerReason: `Thua ${count} lệnh liên tiếp trong 24h — nghỉ còn ${minsLeft} phút`,
    hardBlock: `Thua 3 lệnh liên tiếp trong 24h — cooldown ${HARD_BLOCK_RULES_V3.LOSS_STREAK_LOCK_MINUTES} phút (còn ~${minsLeft} phút)`,
  };
}

export interface AnalysisInputV3 extends AnalysisInput {
  btcKlines1h?: Kline[];
  fundingHistory?: { rate: number; timestamp: number }[];
  whaleWalls?: EntryWhaleWalls;
  recentJournal?: Array<{ outcome: { status: string } }>;
  psychologyChecklistV3?: PsychologyChecklistV3;
}

// ─────────────────────────────────────────
// TYPES V3
// ─────────────────────────────────────────

export type Direction = 'LONG' | 'SHORT';

export interface LayerResultV3 {
  layerNumber: number;
  score: number; // raw 0-2
  maxScore: 2;
  reason: string;
  group: 'A' | 'B' | 'C';
}

export interface GroupScores {
  A: number; // 0-5 sau quy đổi
  B: number;
  C: number;
}

export interface DirectionalScoreV3 {
  direction: Direction;
  layers: LayerResultV3[];
  rawLayerScores: Record<number, number>;
  groupScores: GroupScores;
  totalScore: number;
  hardBlocks: string[];
  groupBlocks: string[];
  warnings: string[];
  decision: DecisionTypeV2;
  decisionLabel: string;
  decisionColor: string;
  winrate: string;
}

export interface ScoringResultV3 {
  long: DirectionalScoreV3;
  short: DirectionalScoreV3;
  marketMode: 'TRENDING' | 'RANGING';
  warnings: string[];
  atr1h: number;
}

// ─────────────────────────────────────────
// HELPER: LayerResult builder
// ─────────────────────────────────────────

function layer(
  num: number,
  score: number,
  reason: string,
  group: 'A' | 'B' | 'C',
): LayerResultV3 {
  return {
    layerNumber: num,
    score: Math.max(0, Math.min(2, score)),
    maxScore: 2,
    reason,
    group,
  };
}

// ─────────────────────────────────────────
// L1 — Giá & EMA V3
// ─────────────────────────────────────────

export function scoreL1V3(
  direction: Direction,
  ema1h: EMAAnalysisV3,
  ema4h: EMAAnalysisV3,
): LayerResultV3 {
  if (direction === 'LONG') {
    const both1h = ema1h.priceAboveEma20 && ema1h.priceAboveEma50;
    const both4h = ema4h.priceAboveEma20 && ema4h.priceAboveEma50;
    const slopeUp = ema1h.slope20 === 'UP' || ema4h.slope20 === 'UP';
    const nearEma1h = Math.abs(ema1h.priceVsEma20Pct) < 2;
    const nearEma4h = Math.abs(ema4h.priceVsEma20Pct) < 2;

    if (both1h && both4h && slopeUp) {
      return layer(1, 2, 'Giá trên EMA20/50 cả 2 khung, EMA dốc lên', 'A');
    }
    if (both1h && both4h) {
      return layer(1, 1.5, 'Giá trên EMA nhưng slope phẳng', 'A');
    }
    if ((both1h || both4h) && (nearEma1h || nearEma4h)) {
      return layer(1, 1, 'Đang pullback về EMA — vùng entry hợp lý', 'A');
    }
    if (both1h || both4h) {
      return layer(1, 1, 'Mâu thuẫn 1H vs 4H', 'A');
    }
    return layer(1, 0, 'Giá dưới tất cả EMA cả 2 khung', 'A');
  }

  const both1h = !ema1h.priceAboveEma20 && !ema1h.priceAboveEma50;
  const both4h = !ema4h.priceAboveEma20 && !ema4h.priceAboveEma50;
  const slopeDown = ema1h.slope20 === 'DOWN' || ema4h.slope20 === 'DOWN';

  if (both1h && both4h && slopeDown) {
    return layer(1, 2, 'Giá dưới EMA20/50 cả 2 khung, EMA dốc xuống', 'A');
  }
  if (both1h && both4h) {
    return layer(1, 1.5, 'Giá dưới EMA, slope chưa dốc rõ', 'A');
  }
  if (both1h || both4h) {
    return layer(1, 1, 'Mâu thuẫn 1H vs 4H', 'A');
  }
  return layer(1, 0, 'Giá trên tất cả EMA — không vào Short', 'A');
}

// ─────────────────────────────────────────
// L2 — RSI V3 + Divergence
// ─────────────────────────────────────────

export function scoreL2V3(
  direction: Direction,
  klines1h: Kline[],
  klines4h: Kline[],
): LayerResultV3 {
  const rsi1h = getRSI(klines1h);
  const rsi4h = getRSI(klines4h);
  const div1h = detectRSIDivergenceV3(klines1h);

  if (Number.isNaN(rsi1h) || Number.isNaN(rsi4h)) {
    return layer(2, 1, 'Không đủ data RSI', 'A');
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

    return layer(2, score, reason, 'A');
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

  return layer(2, score, reason, 'A');
}

// ─────────────────────────────────────────
// L3 — MACD V3 + Histogram Momentum
// ─────────────────────────────────────────

export function scoreL3V3(
  direction: Direction,
  macd1h: MACDAnalysisV3,
  macd4h: MACDAnalysisV3,
): LayerResultV3 {
  const h1 = macd1h.histogram ?? 0;
  const h4 = macd4h.histogram ?? 0;

  if (direction === 'LONG') {
    if (h1 > 0 && h4 > 0) {
      return layer(3, 2, 'Histogram dương cả 1H & 4H', 'A');
    }
    if (macd1h.crossedZeroRecentlyUp || macd4h.crossedZeroRecentlyUp) {
      return layer(3, 1.5, 'MACD vừa cắt lên 0 — tín hiệu mạnh', 'A');
    }
    if (h1 > 0 && macd1h.isTurningUp) {
      return layer(3, 1.5, '1H dương & đang bẻ góc lên', 'A');
    }
    if (macd1h.isTurningUp && macd4h.isTurningUp) {
      return layer(3, 1.5, 'Cả 2 khung đang bẻ góc lên', 'A');
    }
    if (h1 > 0 || macd1h.isTurningUp) {
      return layer(3, 1, '1 khung thuận Long', 'A');
    }
    return layer(3, 0, 'Histogram âm cả 2 khung — VI PHẠM', 'A');
  }

  if (h1 < 0 && h4 < 0) {
    return layer(3, 2, 'Histogram âm cả 1H & 4H', 'A');
  }
  if (macd1h.crossedZeroRecentlyDown || macd4h.crossedZeroRecentlyDown) {
    return layer(3, 1.5, 'MACD vừa cắt xuống 0 — tín hiệu mạnh', 'A');
  }
  if (h1 < 0 && macd1h.isTurningDown) {
    return layer(3, 1.5, '1H âm & đang bẻ góc xuống', 'A');
  }
  if (macd1h.isTurningDown && macd4h.isTurningDown) {
    return layer(3, 1.5, 'Cả 2 khung đang bẻ góc xuống', 'A');
  }
  if (h1 < 0 || macd1h.isTurningDown) {
    return layer(3, 1, '1 khung thuận Short', 'A');
  }
  return layer(3, 0, 'Histogram dương cả 2 khung — VI PHẠM Short', 'A');
}

// ─────────────────────────────────────────
// L4 — Bollinger V3 + Market Mode
// ─────────────────────────────────────────

export function scoreL4V3(
  direction: Direction,
  bb: BollingerAnalysisV3,
): LayerResultV3 {
  const { percentB, marketMode } = bb;

  if (direction === 'LONG') {
    if (marketMode === 'TRENDING') {
      if (percentB >= 60 && percentB <= 90) {
        return layer(4, 2, `%B=${percentB.toFixed(0)} Trending nửa trên — ride band`, 'A');
      }
      if (percentB >= 40 && percentB < 60) {
        return layer(4, 1.5, `%B=${percentB.toFixed(0)} Pullback về giữa trong uptrend`, 'A');
      }
      if (percentB >= 20 && percentB < 40) {
        return layer(4, 0.5, `%B=${percentB.toFixed(0)} Đã pullback sâu`, 'A');
      }
      return layer(4, 0, `%B=${percentB.toFixed(0)} Không thuận Long Trending`, 'A');
    }
    if (percentB >= 35 && percentB <= 55) {
      return layer(4, 2, `%B=${percentB.toFixed(0)} Ranging vùng giữa — tốt nhất để buy`, 'A');
    }
    if (percentB >= 55 && percentB <= 70) {
      return layer(4, 1, `%B=${percentB.toFixed(0)} Ranging nửa trên — cẩn thận resistance`, 'A');
    }
    if (percentB >= 20 && percentB < 35) {
      return layer(4, 1, `%B=${percentB.toFixed(0)} Ranging gần band dưới — potential bounce`, 'A');
    }
    return layer(4, 0, `%B=${percentB.toFixed(0)} Không thuận Long Ranging`, 'A');
  }

  if (marketMode === 'TRENDING') {
    if (percentB >= 10 && percentB <= 40) {
      return layer(4, 2, `%B=${percentB.toFixed(0)} Trending nửa dưới — ride band`, 'A');
    }
    if (percentB > 40 && percentB <= 60) {
      return layer(4, 1.5, `%B=${percentB.toFixed(0)} Hồi về giữa trong downtrend`, 'A');
    }
    return layer(4, 0, `%B=${percentB.toFixed(0)} Không thuận Short Trending`, 'A');
  }
  if (percentB >= 45 && percentB <= 65) {
    return layer(4, 2, `%B=${percentB.toFixed(0)} Ranging vùng giữa — tốt nhất để sell`, 'A');
  }
  if (percentB > 65 && percentB <= 80) {
    return layer(4, 1, `%B=${percentB.toFixed(0)} Ranging nửa trên — potential short`, 'A');
  }
  return layer(4, 0, `%B=${percentB.toFixed(0)} Không thuận Short Ranging`, 'A');
}

// ─────────────────────────────────────────
// L5 — Volume/OI/CVD V3
// ─────────────────────────────────────────

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

export function scoreL5V3(
  direction: Direction,
  klines1h: Kline[],
  cvdPoints: CVDPoint[],
  oiCurrent: number,
  oiPrevious: number,
  priceChangePct: number,
): { layerResult: LayerResultV3; warning: string | null } {
  let score = 0;
  const signals: string[] = [];
  let warning: string | null = null;

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

  const cvdAnalysis = analyzeCVD(cvdPoints, direction);
  const cvdAligned =
    direction === 'LONG' ? cvdAnalysis.slope === 'up' : cvdAnalysis.slope === 'down';
  const cvdDivergenceAgainst =
    cvdAnalysis.divergence && cvdDivergenceAgainstDirection(cvdPoints, direction);

  if (cvdDivergenceAgainst) {
    score = 0;
    signals.length = 0;
    signals.push('CVD phân kỳ ngược hướng');
    warning =
      direction === 'LONG'
        ? '⚠️ CVD phân kỳ giảm — cảnh báo bull trap'
        : '⚠️ CVD phân kỳ tăng — cảnh báo bear trap / sắp bounce';
  } else if (cvdAligned) {
    score += 1;
    signals.push(`CVD ${cvdAnalysis.slope.toUpperCase()}`);
  } else {
    signals.push('CVD trung tính');
  }

  const finalScore = Math.max(0, Math.min(2, score));
  return {
    layerResult: layer(5, finalScore, signals.join(', ') || 'Không có tín hiệu rõ', 'B'),
    warning,
  };
}

function psychologyChecklistForV3(input: AnalysisInputV3): PsychologyChecklistV3 {
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

// ─────────────────────────────────────────
// L6 — Funding V3 + Trend
// ─────────────────────────────────────────

export function scoreL6V3(
  direction: Direction,
  funding: FundingAnalysisV3,
): { layerResult: LayerResultV3; hardBlock: string | null } {
  const { currentRate, trend, extremeRisk } = funding;

  if (direction === 'LONG' && extremeRisk === 'LONG_SQUEEZE') {
    return {
      layerResult: layer(
        6,
        0,
        `Funding ${currentRate.toFixed(4)}% — LONG SQUEEZE RISK`,
        'B',
      ),
      hardBlock: `Funding ${currentRate.toFixed(4)}% quá cao — chặn Long`,
    };
  }
  if (direction === 'SHORT' && extremeRisk === 'SHORT_SQUEEZE') {
    return {
      layerResult: layer(
        6,
        0,
        `Funding ${currentRate.toFixed(4)}% — SHORT SQUEEZE RISK`,
        'B',
      ),
      hardBlock: `Funding ${currentRate.toFixed(4)}% quá thấp — chặn Short`,
    };
  }

  let score = 0;
  let reason = `Funding ${currentRate.toFixed(4)}%`;

  if (direction === 'LONG') {
    if (currentRate < 0 && trend === 'FALLING') {
      score = 2;
      reason += ' âm & giảm — lý tưởng Long';
    } else if (currentRate < 0) {
      score = 1.5;
      reason += ' âm — tốt cho Long';
    } else if (currentRate <= 0.005 && trend === 'FALLING') {
      score = 1.5;
      reason += ' thấp & giảm — tốt';
    } else if (currentRate <= 0.005) {
      score = 1;
      reason += ' chấp nhận được';
    } else if (currentRate <= 0.01 && trend !== 'RISING') {
      score = 0.5;
      reason += ' hơi cao — cẩn thận';
    } else {
      score = 0;
      reason += ' cao — không thuận Long';
    }
  } else if (currentRate > 0 && trend === 'RISING') {
    score = 2;
    reason += ' dương & tăng — lý tưởng Short';
  } else if (currentRate > 0) {
    score = 1.5;
    reason += ' dương — tốt cho Short';
  } else if (currentRate >= -0.005 && trend === 'RISING') {
    score = 1.5;
    reason += ' gần 0 & tăng — tốt';
  } else if (currentRate >= -0.005) {
    score = 1;
    reason += ' chấp nhận được';
  } else if (currentRate >= -0.01 && trend !== 'FALLING') {
    score = 0.5;
    reason += ' hơi thấp — cẩn thận';
  } else {
    score = 0;
    reason += ' thấp — không thuận Short';
  }

  return { layerResult: layer(6, score, reason, 'B'), hardBlock: null };
}

// ─────────────────────────────────────────
// L7 — L/S Ratio V3 + Whale Wall
// ─────────────────────────────────────────

export function scoreL7V3(
  direction: Direction,
  topRatios: number[],
  _globalRatios: number[],
  whaleWalls: EntryWhaleWalls,
  currentPrice: number,
  atr: number,
  symbol?: AppTradeSymbol,
): { layerResult: LayerResultV3; warning: string | null } {
  void _globalRatios;
  const topSlope = getRatioSlope(topRatios);
  const currentRatio = topRatios[topRatios.length - 1] ?? 1;
  let warning: string | null = null;

  if (currentRatio > HARD_BLOCK_RULES_V3.LS_RATIO_EXTREME_HIGH) {
    warning = `⚠️ L/S ratio ${currentRatio.toFixed(2)} quá cao — đám đông đang Long cực đoan, risk long squeeze`;
  } else if (currentRatio < HARD_BLOCK_RULES_V3.LS_RATIO_EXTREME_LOW) {
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
    layerResult: layer(7, flow.score, flow.reason, 'B'),
    warning,
  };
}

// ─────────────────────────────────────────
// L8 — BTC V3 (24h + 1H momentum)
// ─────────────────────────────────────────

export function scoreL8V3(
  direction: Direction,
  btc: BTCAnalysisV3,
): { layerResult: LayerResultV3; hardBlock: string | null; warning: string | null } {
  const { change24h, change1h, momentum } = btc;
  let hardBlock: string | null = null;
  let warning: string | null = null;

  const blockReasons: string[] = [];

  if (Math.abs(change24h) > HARD_BLOCK_RULES_V3.BTC_EXTREME_PCT) {
    blockReasons.push(
      `BTC biến động ${change24h.toFixed(2)}% — quá rủi ro, chặn cả 2 chiều`,
    );
  }
  if (direction === 'LONG' && change24h <= HARD_BLOCK_RULES_V3.BTC_LONG_BLOCK_PCT) {
    blockReasons.push(`BTC ${change24h.toFixed(2)}% ≤ -2% — chặn Long alt`);
  }
  if (direction === 'SHORT' && change24h >= HARD_BLOCK_RULES_V3.BTC_SHORT_BLOCK_PCT) {
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
    layerResult: layer(8, score, reason, 'C'),
    hardBlock,
    warning,
  };
}

// ─────────────────────────────────────────
// L9 — Session V3
// ─────────────────────────────────────────

export function scoreL9V3(): LayerResultV3 {
  const { score, sessionName, reason } = getSessionScoreV3();
  return layer(9, score, `${sessionName}: ${reason}`, 'C');
}

// ─────────────────────────────────────────
// L10 — Psychology V3 + Win Streak
// ─────────────────────────────────────────

export function scoreL10V3(
  checklist: PsychologyChecklistV3,
  todayStats: TodayStats,
  journal: Array<{ outcome: { status: string } }>,
): { layerResult: LayerResultV3; hardBlock: string | null; warning: string | null } {
  if (todayStats.lossStreakLocked) {
    const cooldown = lossStreakCooldownL10(todayStats);
    if (cooldown) {
      return {
        layerResult: layer(10, 0, cooldown.layerReason, 'C'),
        hardBlock: cooldown.hardBlock,
        warning: null,
      };
    }
  }
  if (todayStats.dailyLossUSDT >= HARD_BLOCK_RULES_V3.MAX_DAILY_LOSS_USDT) {
    return {
      layerResult: layer(
        10,
        0,
        `Lỗ ngày ${todayStats.dailyLossUSDT.toFixed(2)} USDT — dừng hôm nay`,
        'C',
      ),
      hardBlock: 'Lỗ ngày ≥ 3 USDT — chặn giao dịch',
      warning: null,
    };
  }

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

  const reason =
    checked === total
      ? `${checked}/${total} mục — sẵn sàng`
      : `${checked}/${total} mục — chưa đủ`;

  return {
    layerResult: layer(10, score, reason, 'C'),
    hardBlock: null,
    warning,
  };
}

// ─────────────────────────────────────────
// HÀM TỔNG HỢP: scoreAnalysisV3()
// ─────────────────────────────────────────

export function scoreAnalysisV3(
  input: AnalysisInputV3,
  todayStats: TodayStats,
): ScoringResultV3 {
  const ema1h = getEMAAnalysisV3(input.klines1h);
  const ema4h = getEMAAnalysisV3(input.klines4h);
  const bb1h = getBollingerAnalysisV3(input.klines1h);
  const macd1h = getMACDAnalysisV3(input.klines1h);
  const macd4h = getMACDAnalysisV3(input.klines4h);
  const btc = getBTCAnalysisV3(input.btcKlines1h ?? [], input.btc24hChangePct);
  const funding = getFundingAnalysisV3(input.fundingHistory ?? []);
  const whaleWalls = input.whaleWalls ?? { bidWalls: [], askWalls: [] };
  const whaleWallsForL7 = resolveWhaleWallsForConfirmation(bb1h.marketMode, whaleWalls);
  const journal = input.recentJournal ?? [];
  const checklist = psychologyChecklistForV3(input);

  const buildDirectional = (direction: Direction): DirectionalScoreV3 => {
    const warnings: string[] = [];
    const hardBlocks: string[] = [];

    const l1 = scoreL1V3(direction, ema1h, ema4h);
    const l2 = scoreL2V3(direction, input.klines1h, input.klines4h);
    const l3 = scoreL3V3(direction, macd1h, macd4h);
    const l4 = scoreL4V3(direction, bb1h);
    const rawA = l1.score + l2.score + l3.score + l4.score;
    const groupA = convertToGroupScore(rawA, 'GROUP_A_TREND');

    if (l1.score < 2) {
      warnings.push(`L1 chưa đủ 2đ (${l1.score}đ) — ${l1.reason}`);
    }
    if (l3.score < 1) {
      hardBlocks.push(`L3 MACD vi phạm — ${l3.reason}`);
    }

    const l5Res = scoreL5V3(
      direction,
      input.klines1h,
      input.cvdPoints,
      input.oiCurrent,
      input.oiPrevious,
      input.priceChangePct1h,
    );
    const l6Res = scoreL6V3(direction, funding);
    const l7Res = scoreL7V3(
      direction,
      input.topLongShortRatios,
      input.globalLongShortRatios,
      whaleWallsForL7,
      input.currentPrice,
      input.atr1h,
      input.symbol as AppTradeSymbol,
    );

    if (l5Res.warning) warnings.push(l5Res.warning);
    if (l6Res.hardBlock) hardBlocks.push(l6Res.hardBlock);
    if (l7Res.warning) warnings.push(l7Res.warning);

    const rawB = l5Res.layerResult.score + l6Res.layerResult.score + l7Res.layerResult.score;
    const groupB = convertToGroupScore(rawB, 'GROUP_B_FLOW');

    const l8Res = scoreL8V3(direction, btc);
    const l9 = scoreL9V3();
    const l10Res = scoreL10V3(checklist, todayStats, journal);

    if (l8Res.hardBlock) hardBlocks.push(l8Res.hardBlock);
    if (l8Res.warning) warnings.push(l8Res.warning);
    if (l10Res.hardBlock) hardBlocks.push(l10Res.hardBlock);
    if (l10Res.warning) warnings.push(l10Res.warning);

    if (l9.score < 0.5) {
      hardBlocks.push(`L9 Phiên xấu — ${l9.reason}`);
    }
    if (l10Res.layerResult.score < 1 && !l10Res.hardBlock) {
      hardBlocks.push('L10 Tâm lý chưa sẵn sàng');
    }

    const rawC = l8Res.layerResult.score + l9.score + l10Res.layerResult.score;
    const groupC = convertToGroupScore(rawC, 'GROUP_C_CONTEXT');

    const groupBlocks: string[] = [];
    if (groupA < SCORING_GROUPS_V3.GROUP_A_TREND.minRequired) {
      groupBlocks.push(
        `Nhóm A (Xu hướng) ${groupA.toFixed(1)}/5đ < ${SCORING_GROUPS_V3.GROUP_A_TREND.minRequired}đ`,
      );
    }
    if (groupB < SCORING_GROUPS_V3.GROUP_B_FLOW.minRequired) {
      groupBlocks.push(
        `Nhóm B (Dòng tiền) ${groupB.toFixed(1)}/5đ < ${SCORING_GROUPS_V3.GROUP_B_FLOW.minRequired}đ`,
      );
    }
    if (groupC < SCORING_GROUPS_V3.GROUP_C_CONTEXT.minRequired) {
      groupBlocks.push(
        `Nhóm C (Bối cảnh) ${groupC.toFixed(1)}/5đ < ${SCORING_GROUPS_V3.GROUP_C_CONTEXT.minRequired}đ`,
      );
    }

    const totalScore = +(groupA + groupB + groupC).toFixed(2);
    const isBlocked = hardBlocks.length > 0 || groupBlocks.length > 0;

    let decision: DecisionTypeV2 = 'KHONG_VAO';
    if (!isBlocked) {
      if (totalScore >= 11.5) decision = 'SETUP_NGON';
      else if (totalScore >= 10) decision = 'VAO_TU_TIN';
      else if (totalScore >= 9) decision = 'CO_THE_VAO';
      else if (totalScore >= 8) decision = 'CHO_THEM';
    }

    const info = DECISION_LABELS_V2[decision];
    const rawLayerScores: Record<number, number> = {
      1: l1.score,
      2: l2.score,
      3: l3.score,
      4: l4.score,
      5: l5Res.layerResult.score,
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
        l5Res.layerResult,
        l6Res.layerResult,
        l7Res.layerResult,
        l8Res.layerResult,
        l9,
        l10Res.layerResult,
      ],
      rawLayerScores,
      groupScores: { A: groupA, B: groupB, C: groupC },
      totalScore,
      hardBlocks,
      groupBlocks,
      warnings,
      decision,
      decisionLabel: info.label,
      decisionColor: info.color,
      winrate: info.winrate,
    };
  };

  return {
    long: buildDirectional('LONG'),
    short: buildDirectional('SHORT'),
    marketMode: bb1h.marketMode,
    warnings: [],
    atr1h: input.atr1h,
  };
}

export function canEnterV3(active: DirectionalScoreV3): boolean {
  return (
    active.hardBlocks.length === 0 &&
    active.groupBlocks.length === 0 &&
    active.decision !== 'KHONG_VAO' &&
    active.decision !== 'CHO_THEM'
  );
}

export function suggestDirectionV3(result: ScoringResultV3): Direction {
  const { long, short } = result;
  if (long.hardBlocks.length > 0 && short.hardBlocks.length === 0) return 'SHORT';
  if (short.hardBlocks.length > 0 && long.hardBlocks.length === 0) return 'LONG';
  if (long.decision === 'KHONG_VAO' && short.decision !== 'KHONG_VAO') return 'SHORT';
  if (short.decision === 'KHONG_VAO' && long.decision !== 'KHONG_VAO') return 'LONG';
  return long.totalScore >= short.totalScore ? 'LONG' : 'SHORT';
}

export { DECISION_LABELS_V2 };

const RAW_LAYER_MAX_V3 = 2;
const WEIGHT_PER_RAW_V3 = LAYER_MAX_POINTS / RAW_LAYER_MAX_V3;

export function buildAnalysisInputV3FromMarket(params: {
  symbol: string;
  currentPrice: number;
  market: AllMarketData;
  psychologyChecklist: PsychologyChecklistV2;
  btc24hChangePct: number;
  btcKlines1h?: Kline[];
  liquidityPools?: LiquidityPool[];
  recentJournal?: AnalysisInputV3['recentJournal'];
}): AnalysisInputV3 | null {
  const base = buildAnalysisInputFromMarket(params);
  if (!base) return null;

  const fundingHistory = (params.market.fundingHistory?.records ?? []).map((r) => ({
    rate: r.fundingRate * 100,
    timestamp: r.fundingTime,
  }));

  const radarSnap = getWhaleRadarSnapshotsSync()[params.symbol as AppTradeSymbol];
  const whaleWalls = buildWhaleEntryWalls(
    params.symbol as AppTradeSymbol,
    params.currentPrice,
    base.atr1h,
    params.liquidityPools ?? [],
    radarSnap?.scannedAt,
  );

  return {
    ...base,
    btcKlines1h:
      params.btcKlines1h ??
      (params.symbol === 'BTCUSDT' ? base.klines1h : undefined),
    fundingHistory,
    whaleWalls,
    recentJournal: params.recentJournal,
  };
}

export function buildTodayStatsFromJournal(
  consecutiveLosses: number,
  dailyLossUSDT: number,
  lock?: TodayStatsLockExtras,
): TodayStats {
  return {
    consecutiveLosses,
    dailyLossUSDT,
    consecutiveLossesIn24h: lock?.consecutiveLossesIn24h ?? 0,
    lossStreakLocked: lock?.lossStreakLocked ?? false,
    lossStreakLockUntil: lock?.lossStreakLockUntil ?? null,
  };
}

export function scoringLayersToDisplayV3(layers: LayerResultV3[]): LayerResult[] {
  return layers.map((layer) => {
    const id = layer.layerNumber as ScorerLayerId;
    const weighted = Math.round(layer.score * WEIGHT_PER_RAW_V3 * 100) / 100;
    return {
      layer: id,
      name: LAYER_NAMES_V3[layer.layerNumber] ?? `L${layer.layerNumber}`,
      score: weighted,
      maxScore: LAYER_MAX_POINTS,
      passed: layer.score > 0,
      isMandatory: false,
      isMandatoryViolation: false,
      reason: layer.reason,
    };
  });
}
