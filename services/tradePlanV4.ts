import type { Kline } from './binanceApi';
import type { EntryWhaleWalls } from './indicators';
import {
  TRADE_PLAN_V3_CONFIG as CFG,
  TRADE_PLAN_V4_CONFIG as CFG_V4,
  convertToGroupScoreV4,
  SCORING_GROUPS_V4,
  type TradePlan,
  type TradePlanV3,
  type DecisionTypeV2,
} from '../constants/scoring';
import {
  atrFromKlines,
  applyTierMaxLossCap,
  calculateOptimalEntry,
  calculateOptimalSL,
  calculateOptimalTPs,
  tradePlanV3ToLegacyPlan,
} from './tradePlanV3';
import { getKeyLevelsCached, estimateWinProbability, getEMAAnalysisV3 } from './indicators';
import {
  calculateCapitalTier,
  RR_TARGETS,
} from './capitalManagement';
import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import { resolveWhaleWallsForEntry } from './whaleConfirmation';
import {
  computeTradePlanExpectedValue,
  resolveTradePlanValid,
} from './tradePlanPresentation';
import { resolvePlanExpiryOutput } from './tradePlanExpiry';

export { calculatePlanExpiry, PLAN_EXPIRY_CONFIG } from './tradePlanExpiry';
import type { DirectionalScoreV4, ScoringResultV4 } from './scorerV4';
import type { DirectionalScoreV3, ScoringResultV3 } from './scorerV3';

/** Map V4 → shape V3 cho position advisor (logic không đổi) */
export function directionalScoreV4ToLegacyV3(d: DirectionalScoreV4): DirectionalScoreV3 {
  const decision: DecisionTypeV2 =
    d.awaitingRescore || d.decision === 'CHO_TAI_CHAM'
      ? 'CHO_THEM'
      : (d.decision as DecisionTypeV2);
  return {
    direction: d.direction,
    layers: d.layers.map((l) => ({
      layerNumber: l.layerNumber,
      score: l.score,
      maxScore: 2,
      reason: l.reason,
      group: l.group,
    })),
    rawLayerScores: d.rawLayerScores,
    groupScores: d.groupScores,
    totalScore: d.officialTotalScore ?? d.referenceTotalScore,
    hardBlocks: d.hardBlocks,
    groupBlocks: d.groupBlocks,
    warnings: d.warnings,
    decision,
    decisionLabel: d.decisionLabel,
    decisionColor: d.decisionColor,
    winrate: d.winrate,
  };
}

export function scoringResultV4ToLegacyV3(result: ScoringResultV4): ScoringResultV3 {
  return {
    long: directionalScoreV4ToLegacyV3(result.long),
    short: directionalScoreV4ToLegacyV3(result.short),
    marketMode: result.marketMode,
    warnings: result.warnings,
    atr1h: result.atr1h,
  };
}

export interface TradePlanV4MarketData {
  symbol: string;
  currentPrice: number;
  klines1h: Kline[];
  klines4h: Kline[];
  whaleWalls: EntryWhaleWalls;
  accountSize?: number;
  initialCapital?: number;
}

export type V4SlProfile = 'CVD_DOMINANT' | 'TREND_DOMINANT' | 'BALANCED';

export interface V4SlMultiplierResult {
  profile: V4SlProfile;
  baseMultiplier: number;
  adjustedMultiplier: number;
  adjustmentApplied: boolean;
  slMultiplierNote: string | null;
  groupAContribution: number;
  cvdContribution: number;
}

function planDecision(score: DirectionalScoreV4): string {
  if (score.awaitingRescore || score.decision === 'CHO_TAI_CHAM') return 'CHO_THEM';
  return score.decision;
}

function baseAtrMultiplier(decision: string): number {
  const key = decision as keyof typeof CFG.ATR_SL_MULTIPLIER;
  return CFG.ATR_SL_MULTIPLIER[key] ?? CFG.ATR_SL_MULTIPLIER.CO_THE_VAO;
}

/**
 * Phân loại nguồn điểm mạnh V4 — quyết định có thu hẹp SL multiplier hay không.
 * Chỉ thu hẹp khi setup đạt VÀO TỰ TIN/SETUP NGON chủ yếu nhờ CVD (L5a)
 * trong khi Group A chỉ vừa đủ ngưỡng tối thiểu.
 */
export function resolveV4SlMultiplier(score: DirectionalScoreV4): V4SlMultiplierResult {
  const decision = score.decision;
  const total = score.officialTotalScore ?? score.referenceTotalScore;
  const groupA = score.groupScores.A;
  const l5aRaw = score.rawLayerScores[5] ?? 0;
  const l5aConverted = convertToGroupScoreV4(l5aRaw, 'GROUP_B_FLOW');

  const groupAContribution = total > 0 ? groupA / total : 0;
  const cvdContribution = total > 0 ? l5aConverted / total : 0;

  const planDec = planDecision(score);
  const baseMultiplier = baseAtrMultiplier(planDec);

  const bothStrong =
    groupA >= CFG_V4.GROUP_A_STRONG_MIN && l5aRaw >= CFG_V4.L5A_STRONG_RAW_MIN;

  const trendDominant =
    groupA >= CFG_V4.GROUP_A_STRONG_MIN && l5aRaw <= CFG_V4.L5A_WEAK_RAW_MAX;

  const cvdDominant =
    (decision === 'VAO_TU_TIN' || decision === 'SETUP_NGON') &&
    groupA <= CFG_V4.GROUP_A_NEAR_MIN_MAX &&
    l5aRaw >= CFG_V4.L5A_STRONG_RAW_MIN;

  if (bothStrong || trendDominant || !cvdDominant) {
    const profile: V4SlProfile = bothStrong
      ? 'BALANCED'
      : trendDominant
        ? 'TREND_DOMINANT'
        : 'BALANCED';
    return {
      profile,
      baseMultiplier,
      adjustedMultiplier: baseMultiplier,
      adjustmentApplied: false,
      slMultiplierNote: null,
      groupAContribution,
      cvdContribution,
    };
  }

  const adjustedMultiplier = Math.max(
    1.0,
    +(baseMultiplier - CFG_V4.CVD_SL_TIGHTEN).toFixed(2),
  );

  return {
    profile: 'CVD_DOMINANT',
    baseMultiplier,
    adjustedMultiplier,
    adjustmentApplied: adjustedMultiplier < baseMultiplier,
    slMultiplierNote:
      `SL ${adjustedMultiplier.toFixed(1)}×ATR (điều chỉnh: setup mạnh nhờ CVD, ` +
      `trend kỹ thuật vừa đủ ngưỡng — Group A ${groupA.toFixed(1)}/${SCORING_GROUPS_V4.GROUP_A_TREND.groupMax}đ)`,
    groupAContribution,
    cvdContribution,
  };
}

/** Trade Plan V4 native — SL phản ứng theo cấu trúc điểm L5a vs Group A. */
export function calculateTradePlanV4Native(
  scoringResult: ScoringResultV4,
  marketData: TradePlanV4MarketData,
  direction: 'LONG' | 'SHORT',
): TradePlanV3 {
  const {
    symbol,
    currentPrice,
    klines1h,
    klines4h,
    whaleWalls,
    accountSize = DEFAULT_INITIAL_CAPITAL,
    initialCapital = DEFAULT_INITIAL_CAPITAL,
  } = marketData;

  const capitalTier = calculateCapitalTier(accountSize, initialCapital);
  const leverage = capitalTier.notionalPerTrade / capitalTier.sizePerTrade || CFG.LEVERAGE;

  const score = direction === 'LONG' ? scoringResult.long : scoringResult.short;
  const scoreLegacy = directionalScoreV4ToLegacyV3(score);
  const marketMode = scoringResult.marketMode;
  const planDec = planDecision(score);
  const slProfile = resolveV4SlMultiplier(score);

  const warnings: string[] = [];
  const blockReasons: string[] = [];

  const atr = scoringResult.atr1h > 0 ? scoringResult.atr1h : atrFromKlines(klines1h, currentPrice, 14);
  const ema1h = getEMAAnalysisV3(klines1h);
  const ema4h = getEMAAnalysisV3(klines4h);

  const { supports, resistances } = getKeyLevelsCached(
    symbol,
    klines1h,
    klines4h,
    currentPrice,
    ema1h,
    ema4h,
    whaleWalls,
  );

  const baseSize = capitalTier.sizePerTrade;
  const notional = capitalTier.notionalPerTrade;

  const entryWhaleWalls = resolveWhaleWallsForEntry(
    {
      direction,
      currentPrice,
      ema20: ema1h.ema20,
      supports,
      resistances,
    },
    whaleWalls,
  );

  const entryZone = calculateOptimalEntry(
    direction,
    currentPrice,
    ema1h,
    atr,
    scoreLegacy,
    supports,
    resistances,
    entryWhaleWalls,
  );
  const entry = entryZone.optimal;

  const stopLossRaw = calculateOptimalSL(
    direction,
    entry,
    atr,
    planDec,
    marketMode,
    supports,
    resistances,
    whaleWalls,
    notional,
    slProfile.adjustmentApplied
      ? {
          atrMultOverride: slProfile.adjustedMultiplier,
          targetAtrMultiplier: slProfile.adjustedMultiplier,
          slMultiplierNote: slProfile.slMultiplierNote ?? undefined,
        }
      : {
          targetAtrMultiplier: slProfile.baseMultiplier,
        },
  );
  const { stopLoss, warning: slTierWarning } = applyTierMaxLossCap({
    stopLoss: stopLossRaw,
    direction,
    entry,
    notional,
    atr,
    tierMaxLossPerTrade: capitalTier.maxLossPerTrade,
    tierName: capitalTier.tierName,
  });
  if (slTierWarning) warnings.push(slTierWarning);

  const winProb = estimateWinProbability(
    scoreLegacy.totalScore,
    marketMode,
    direction,
    score.groupScores,
    2.0,
  );

  const { tp1, tp2, tp3 } = calculateOptimalTPs(
    direction,
    entry,
    stopLoss,
    planDec,
    marketMode,
    score.groupScores,
    resistances,
    supports,
    baseSize,
    leverage,
    winProb,
    {
      fixedRrTargets: RR_TARGETS,
    },
  );

  const primaryRR = tp1.rrRatio;
  if (primaryRR < CFG.MIN_RR_TO_ENTER) {
    blockReasons.push(`R:R ${primaryRR.toFixed(2)}:1 < tối thiểu 2:1 — không vào`);
  }
  if (winProb < CFG.MIN_WIN_PROBABILITY_TO_ENTER) {
    warnings.push(
      `Xác suất thắng ước tính ${(winProb * 100).toFixed(0)}% < mục tiêu 65%`,
    );
  }
  if (entryZone.quality === 'RISKY') {
    warnings.push('Vùng entry xa tối ưu — cân nhắc chờ thêm');
  }
  if (entryZone.quality === 'MISS') {
    blockReasons.push('Giá đã bỏ lỡ vùng entry tối ưu');
  }
  if (stopLoss.quality === 'TIGHT') {
    warnings.push(
      `SL ${stopLoss.atrDistance.toFixed(1)}×ATR = rất chặt — nguy cơ bị quét râu nến`,
    );
  }

  const { tradePlanValid, tp1LowProbabilityWarning } = resolveTradePlanValid({
    tp1,
    primaryRr: primaryRR,
    maxLossUSDT: stopLoss.maxLossUSDT,
    tierMaxLossPerTrade: capitalTier.maxLossPerTrade,
    minRrToEnter: CFG.MIN_RR_TO_ENTER,
  });
  const ev = computeTradePlanExpectedValue(
    [tp1, tp2, tp3],
    winProb,
    stopLoss.maxLossUSDT,
  );
  const rrScore = Math.min(
    100,
    Math.round((primaryRR / 3) * 40 + (winProb / 0.8) * 40 + (ev > 0 ? 20 : 0)),
  );

  const isBlockedDecision =
    score.decision === 'KHONG_VAO' ||
    score.decision === 'CHO_THEM' ||
    score.decision === 'CHO_TAI_CHAM' ||
    score.awaitingRescore;

  const generatedAt = Date.now();
  const planValid =
    blockReasons.length === 0 && !isBlockedDecision;
  const expiryFields = resolvePlanExpiryOutput(
    scoreLegacy.totalScore,
    planValid,
    generatedAt,
  );

  return {
    symbol,
    direction,
    generatedAt,
    totalScore: scoreLegacy.totalScore,
    decision: planDec,
    marketMode,
    groupScores: score.groupScores,
    entryZone,
    recommendedEntry: entry,
    entryBufferUsed: entryZone.entryBufferUsed,
    entryBufferSource: entryZone.entryBufferSource,
    entryBufferPct: entryZone.entryBufferPct,
    stopLoss,
    tp1,
    tp2,
    tp3,
    positionSize: baseSize,
    positionSizeAdjusted: +baseSize.toFixed(2),
    notionalValue: +notional.toFixed(2),
    primaryRR: +primaryRR.toFixed(2),
    expectedValueUSDT: +ev.toFixed(2),
    winProbabilityEstimate: +winProb.toFixed(2),
    riskRewardScore: rrScore,
    isValid: planValid,
    tradePlanValid,
    tp1LowProbabilityWarning,
    warnings,
    blockReasons,
    capitalTierName: capitalTier.tierName,
    ...expiryFields,
  };
}

/** Trade Plan V4 — wrapper giữ chữ ký call site cũ. */
export function calculateTradePlanV4(
  symbol: string,
  currentPrice: number,
  klines1h: Kline[],
  klines4h: Kline[],
  scoringResult: ScoringResultV4,
  direction: 'LONG' | 'SHORT',
  whaleWalls: EntryWhaleWalls,
  accountSize = DEFAULT_INITIAL_CAPITAL,
  initialCapital = DEFAULT_INITIAL_CAPITAL,
): TradePlanV3 {
  return calculateTradePlanV4Native(
    scoringResult,
    { symbol, currentPrice, klines1h, klines4h, whaleWalls, accountSize, initialCapital },
    direction,
  );
}

export { tradePlanV3ToLegacyPlan as tradePlanV4ToLegacyPlan };
export type { TradePlan, TradePlanV3 };
