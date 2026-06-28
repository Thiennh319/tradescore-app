import type { Kline } from './binanceApi';
import {
  type WhaleWall,
  type EMAAnalysisV3,
  type KeyLevel,
  getKeyLevelsCached,
  estimateWinProbability,
  getEMAAnalysisV3,
  isWallProtectingSL,
} from './indicators';
import { computeAtr1hFromKlines } from './atr1h';

import {
  TRADE_PLAN_V3_CONFIG as CFG,
  type EntryZoneV3,
  type StopLossV3,
  type TakeProfitLevel,
  type TradePlan,
  type TradePlanV3,
  type EntryQuality,
} from '../constants/scoring';
import type { EntryZoneType } from './indicators';

import type { DirectionalScoreV3, ScoringResultV3 } from './scorerV3';
import {
  calculateCapitalTier,
  RR_TARGETS,
} from './capitalManagement';
import { resolveWhaleWallsForStopProtection } from './whaleMarketBehavior';
import { appendWhaleConfirmationToEntryReasoning } from './whaleConfirmation';
import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import {
  computeTradePlanExpectedValue,
  resolveTradePlanValid,
} from './tradePlanPresentation';
import { srEntryFromLevel } from './tradePlanEntryBuffer';
import { resolvePlanExpiryOutput } from './tradePlanExpiry';

export interface TpCalculationOptions {
  slDistanceOverride?: number;
  fixedRrTargets?: { tp1: number; tp2: number; tp3: number };
}

export const SL_ADJUSTED_TIER_WARNING = 'SL_ADJUSTED: maxLoss exceeded tier limit';

/** Lỗ tối đa nếu chạm SL: notional × |entry − SL| / entry */
export function computeTradeMaxLossUSDT(
  notional: number,
  entry: number,
  slPrice: number,
): number {
  if (entry <= 0 || notional <= 0) return 0;
  return +(notional * (Math.abs(entry - slPrice) / entry)).toFixed(2);
}

/** SL price sao cho maxLoss = giới hạn tier. */
export function slPriceForTierMaxLoss(
  direction: 'LONG' | 'SHORT',
  entry: number,
  notional: number,
  maxLossUSDT: number,
): number {
  if (entry <= 0 || notional <= 0) return entry;
  const dist = (maxLossUSDT * entry) / notional;
  return direction === 'LONG' ? entry - dist : entry + dist;
}

export interface ApplyTierMaxLossInput {
  stopLoss: StopLossV3;
  direction: 'LONG' | 'SHORT';
  entry: number;
  notional: number;
  atr: number;
  tierMaxLossPerTrade: number;
  tierName: string;
}

/** Áp giới hạn tier: thu hẹp SL nếu vượt ngưỡng, giữ maxLoss thực tế nếu dưới ngưỡng. */
export function applyTierMaxLossCap(input: ApplyTierMaxLossInput): {
  stopLoss: StopLossV3;
  warning?: string;
} {
  const { stopLoss, notional, entry, tierMaxLossPerTrade, tierName } = input;
  const actual = computeTradeMaxLossUSDT(notional, entry, stopLoss.price);
  const tierFields = { tierMaxLossPerTrade, tierName };

  // Giữ nguyên SL kỹ thuật (theo structure/whale wall) — KHÔNG dời SL
  // về gần entry hơn dù maxLoss thực tế vượt giới hạn tier. Dời SL sẽ
  // phá vỡ ý nghĩa kỹ thuật của SL (mất liên kết với support/resistance
  // đã tính). Thay vào đó, chỉ cảnh báo để người dùng tự quyết định
  // (ví dụ: bỏ qua setup này nếu thấy rủi ro quá cao so với vốn).
  if (actual > tierMaxLossPerTrade + 0.005) {
    return {
      stopLoss: {
        ...stopLoss,
        ...tierFields,
        maxLossUSDT: actual,
        slAdjustedForTier: false,
      },
      warning:
        `SL theo cấu trúc kỹ thuật cho maxLoss thực tế ${actual.toFixed(2)} USDT, ` +
        `cao hơn giới hạn ${tierName} (${tierMaxLossPerTrade.toFixed(2)} USDT) — ` +
        `cân nhắc bỏ qua setup này nếu không chấp nhận rủi ro cao hơn bình thường`,
    };
  }

  return {
    stopLoss: {
      ...stopLoss,
      ...tierFields,
      maxLossUSDT: actual,
      slAdjustedForTier: false,
    },
  };
}

export function atrFromKlines(klines: Kline[], currentPrice: number, period = 14): number {
  return computeAtr1hFromKlines(klines, currentPrice, period);
}

function findWallProtectingSL(
  walls: WhaleWall[],
  slCandidate: number,
  direction: 'LONG' | 'SHORT',
): { isSafe: boolean; wall?: WhaleWall } {
  const wall = walls.find((w) => isWallProtectingSL(w.price, slCandidate, direction));
  if (!wall) return { isSafe: false };
  return { isSafe: true, wall };
}

// ─────────────────────────────────────────
// STEP 1: TÍNH ENTRY ZONE TỐI ƯU
// ─────────────────────────────────────────

function finalizeEntryZone(
  zone: EntryZoneV3,
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  ema20: number,
  atr: number,
  supports: KeyLevel[],
  resistances: KeyLevel[],
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
): EntryZoneV3 {
  return {
    ...zone,
    reasoning: appendWhaleConfirmationToEntryReasoning(
      zone.reasoning,
      direction,
      { direction, currentPrice, ema20, supports, resistances },
      whaleWalls,
      atr,
    ),
  };
}

export function calculateOptimalEntry(
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  ema1h: EMAAnalysisV3,
  atr: number,
  score: DirectionalScoreV3,
  supports: KeyLevel[],
  resistances: KeyLevel[],
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
): EntryZoneV3 {
  const decision = score.decision;
  const patience =
    CFG.ENTRY_PATIENCE[decision as keyof typeof CFG.ENTRY_PATIENCE] ??
    CFG.ENTRY_PATIENCE.CO_THE_VAO;
  const ema20 = ema1h.ema20;

  const finalize = (zone: EntryZoneV3) =>
    finalizeEntryZone(
      zone,
      direction,
      currentPrice,
      ema20,
      atr,
      supports,
      resistances,
      whaleWalls,
    );

  // --- LONG Entry ---
  if (direction === 'LONG') {
    const distToEMA = ((currentPrice - ema20) / currentPrice) * 100;

    if (distToEMA > 0.5 && distToEMA < 5) {
      const optimal = ema20 + atr * 0.2;
      const dist = ((optimal - currentPrice) / currentPrice) * 100;
      const quality: EntryQuality =
        Math.abs(dist) < 1 ? 'GOOD' : Math.abs(dist) < 2 ? 'ACCEPTABLE' : 'RISKY';

      return finalize({
        optimal,
        aggressive: currentPrice - atr * 0.1,
        conservative: ema20 - atr * 0.1,
        rangeLow: ema20 - atr * 0.2,
        rangeHigh: ema20 + atr * 0.5,
        quality,
        distanceFromCurrentPct: dist,
        reasoning:
          `Pullback về EMA20 1H (${ema20.toFixed(4)}) hiện cách ${distToEMA.toFixed(2)}%`,
        entryType: Math.abs(dist) < 0.5 ? 'LIMIT_NEAR' : 'LIMIT_WAIT',
      });
    }

    const nearSupport = supports.find(
      (s) => s.distancePct >= -2 && s.distancePct < 0 && s.strength !== 'WEAK',
    );
    if (nearSupport) {
      const {
        entry: optimal,
        entryBufferUsed,
        entryBufferSource,
        entryBufferPct,
      } = srEntryFromLevel('LONG', nearSupport.price, currentPrice, atr);
      const dist = ((optimal - currentPrice) / currentPrice) * 100;
      return finalize({
        optimal,
        aggressive: currentPrice - atr * 0.05,
        conservative: nearSupport.price + atr * 0.02,
        rangeLow: nearSupport.price,
        rangeHigh: nearSupport.price + atr * 0.3,
        quality: Math.abs(dist) < 1.5 ? 'GOOD' : 'ACCEPTABLE',
        distanceFromCurrentPct: dist,
        reasoning: `Gần support ${nearSupport.source} tại ${nearSupport.price.toFixed(4)}`,
        entryType: 'LIMIT_WAIT',
        entryBufferUsed,
        entryBufferSource,
        entryBufferPct,
      });
    }

    const pullback = currentPrice * (1 - patience / 100);
    return finalize({
      optimal: pullback,
      aggressive: currentPrice,
      conservative: currentPrice * (1 - (patience * 1.5) / 100),
      rangeLow: currentPrice * (1 - (patience * 1.5) / 100),
      rangeHigh: currentPrice,
      quality: decision === 'SETUP_NGON' ? 'GOOD' : 'ACCEPTABLE',
      distanceFromCurrentPct: -patience,
      reasoning: `Không có key level gần — chờ pullback nhẹ ${patience}%`,
      entryType: patience < 0.3 ? 'MARKET_OK' : 'LIMIT_NEAR',
    });
  }

  // --- SHORT Entry ---
  const distToEMA = ((ema20 - currentPrice) / currentPrice) * 100;
  if (distToEMA > 0.5 && distToEMA < 5) {
    const optimal = ema20 - atr * 0.2;
    const dist = ((optimal - currentPrice) / currentPrice) * 100;
    return finalize({
      optimal,
      aggressive: currentPrice + atr * 0.1,
      conservative: ema20 + atr * 0.1,
      rangeLow: ema20 - atr * 0.5,
      rangeHigh: ema20 + atr * 0.2,
      quality: Math.abs(dist) < 1 ? 'GOOD' : 'ACCEPTABLE',
      distanceFromCurrentPct: dist,
      reasoning: `Hồi về EMA20 1H để Short tại ${ema20.toFixed(4)}`,
      entryType: Math.abs(dist) < 0.5 ? 'LIMIT_NEAR' : 'LIMIT_WAIT',
    });
  }

  const nearResistance = resistances.find(
    (r) => r.distancePct <= 2 && r.distancePct > 0 && r.strength !== 'WEAK',
  );
  if (nearResistance) {
    const {
      entry: optimal,
      entryBufferUsed,
      entryBufferSource,
      entryBufferPct,
    } = srEntryFromLevel('SHORT', nearResistance.price, currentPrice, atr);
    const dist = ((optimal - currentPrice) / currentPrice) * 100;
    return finalize({
      optimal,
      aggressive: currentPrice + atr * 0.05,
      conservative: nearResistance.price - atr * 0.02,
      rangeLow: nearResistance.price - atr * 0.3,
      rangeHigh: nearResistance.price,
      quality: Math.abs(dist) < 1.5 ? 'GOOD' : 'ACCEPTABLE',
      distanceFromCurrentPct: dist,
      reasoning: `Gần resistance ${nearResistance.source} tại ${nearResistance.price.toFixed(4)}`,
      entryType: 'LIMIT_WAIT',
      entryBufferUsed,
      entryBufferSource,
      entryBufferPct,
    });
  }

  const bounce = currentPrice * (1 + patience / 100);
  return finalize({
    optimal: bounce,
    aggressive: currentPrice,
    conservative: currentPrice * (1 + (patience * 1.5) / 100),
    rangeLow: currentPrice,
    rangeHigh: currentPrice * (1 + (patience * 1.5) / 100),
    quality: decision === 'SETUP_NGON' ? 'GOOD' : 'ACCEPTABLE',
    distanceFromCurrentPct: patience,
    reasoning: `Chờ hồi lên ${patience}% để Short`,
    entryType: patience < 0.3 ? 'MARKET_OK' : 'LIMIT_NEAR',
  });
}

// ─────────────────────────────────────────
// STEP 2: TÍNH STOP LOSS TỐI ƯU
// ─────────────────────────────────────────

export function calculateOptimalSL(
  direction: 'LONG' | 'SHORT',
  entry: number,
  atr: number,
  decision: string,
  marketMode: 'TRENDING' | 'RANGING',
  supports: KeyLevel[],
  resistances: KeyLevel[],
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
  notional: number,
  slOptions?: {
    atrMultOverride?: number;
    targetAtrMultiplier?: number;
    slMultiplierNote?: string;
  },
): StopLossV3 {

  const baseMult =
    CFG.ATR_SL_MULTIPLIER[decision as keyof typeof CFG.ATR_SL_MULTIPLIER] ??
    CFG.ATR_SL_MULTIPLIER.CO_THE_VAO;
  const atrMult = slOptions?.atrMultOverride ?? baseMult;
  const targetAtrMultiplier = slOptions?.targetAtrMultiplier ?? atrMult;
  const slMultiplierNote = slOptions?.slMultiplierNote;

  const modeFactor = CFG.MARKET_MODE_FACTOR[marketMode].slFactor;
  const atrDistance = atr * atrMult * modeFactor;
  const slWhaleWalls = resolveWhaleWallsForStopProtection(marketMode, whaleWalls);

  let slPrice: number;
  let slType: StopLossV3['type'] = 'ATR_BASED';
  let reasoning = '';
  let protectingWall: WhaleWall | undefined;

  if (direction === 'LONG') {
    let slCandidate = entry - atrDistance;

    const supportBelow = supports.find(
      (s) =>
        s.price < slCandidate &&
        s.price > slCandidate - atr * 0.5 &&
        s.strength === 'STRONG',
    );
    if (supportBelow) {
      slCandidate = supportBelow.price - atr * 0.3;
      slType = 'STRUCTURE_BASED';
      reasoning =
        `SL dưới support ${supportBelow.source} ${supportBelow.price.toFixed(4)} thêm 0.3×ATR`;
    }

    const wallCheck = findWallProtectingSL(slWhaleWalls.bidWalls, slCandidate, 'LONG');
    if (wallCheck.isSafe && wallCheck.wall) {
      protectingWall = wallCheck.wall;
      slCandidate = wallCheck.wall.price - atr * 0.2;
      slType = 'WHALE_PROTECTED';
      reasoning =
        `SL sau Whale Bid Wall ${wallCheck.wall.price.toFixed(4)} ` +
        `(${wallCheck.wall.multiplier.toFixed(1)}×)`;
    }

    if (entry - slCandidate > atr * 4) {
      slCandidate = entry - atr * 4;
      reasoning += ' (capped tại 4×ATR)';
    }

    slPrice = slCandidate;
    if (!reasoning) {
      reasoning = `SL = Entry − ${atrMult.toFixed(1)}×ATR (${marketMode} mode)`;
    }
  } else {
    let slCandidate = entry + atrDistance;

    const resistanceAbove = resistances.find(
      (r) =>
        r.price > slCandidate &&
        r.price < slCandidate + atr * 0.5 &&
        r.strength === 'STRONG',
    );
    if (resistanceAbove) {
      slCandidate = resistanceAbove.price + atr * 0.3;
      slType = 'STRUCTURE_BASED';
      reasoning =
        `SL trên resistance ${resistanceAbove.source} ${resistanceAbove.price.toFixed(4)}`;
    }

    const wallCheck = findWallProtectingSL(slWhaleWalls.askWalls, slCandidate, 'SHORT');
    if (wallCheck.isSafe && wallCheck.wall) {
      protectingWall = wallCheck.wall;
      slCandidate = wallCheck.wall.price + atr * 0.2;
      slType = 'WHALE_PROTECTED';
      reasoning = `SL sau Whale Ask Wall ${wallCheck.wall.price.toFixed(4)}`;
    }

    if (slCandidate - entry > atr * 4) {
      slCandidate = entry + atr * 4;
      reasoning += ' (capped tại 4×ATR)';
    }

    slPrice = slCandidate;
    if (!reasoning) {
      reasoning = `SL = Entry + ${atrMult.toFixed(1)}×ATR (${marketMode} mode)`;
    }
  }

  const distancePct = Math.abs((slPrice - entry) / entry) * 100;
  const actualAtrDistance = Math.abs(slPrice - entry) / atr;
  const actualLoss = computeTradeMaxLossUSDT(notional, entry, slPrice);

  const quality: StopLossV3['quality'] =
    actualAtrDistance < 1.2 ? 'TIGHT' : actualAtrDistance > 3 ? 'WIDE' : 'NORMAL';

  return {
    price: +slPrice.toFixed(6),
    type: slType,
    atrDistance: +actualAtrDistance.toFixed(2),
    distancePct: +distancePct.toFixed(3),
    maxLossUSDT: +actualLoss.toFixed(2),
    isProtectedByWall: slType === 'WHALE_PROTECTED',
    wallPrice: protectingWall?.price,
    reasoning,
    quality,
    targetAtrMultiplier: +targetAtrMultiplier.toFixed(2),
    slMultiplierNote,
  };
}

// ─────────────────────────────────────────
// STEP 3: TÍNH TAKE PROFIT 3 LEVELS
// ─────────────────────────────────────────

export function calculateOptimalTPs(
  direction: 'LONG' | 'SHORT',
  entry: number,
  sl: StopLossV3,
  decision: string,
  marketMode: 'TRENDING' | 'RANGING',
  groupScores: { A: number; B: number; C: number },
  resistances: KeyLevel[],
  supports: KeyLevel[],
  positionSize: number,
  leverage: number,
  winProbability: number,
  tpOptions?: TpCalculationOptions,
): { tp1: TakeProfitLevel; tp2: TakeProfitLevel; tp3: TakeProfitLevel } {
  const slDistance =
    tpOptions?.slDistanceOverride ?? Math.abs(entry - sl.price);

  const useCapitalRr = tpOptions?.fixedRrTargets != null;
  const baseRR =
    tpOptions?.fixedRrTargets ??
    (CFG.RR_TARGETS[decision as keyof typeof CFG.RR_TARGETS] ?? CFG.RR_TARGETS.CO_THE_VAO);

  const modeFactor = useCapitalRr ? 1 : CFG.MARKET_MODE_FACTOR[marketMode].tpFactor;

  const flowBonus =
    useCapitalRr || groupScores.B < CFG.GROUP_B_FLOW_BOOST_THRESHOLD
      ? 0
      : CFG.GROUP_B_FLOW_TP_BONUS;

  const rr1 = baseRR.tp1;
  const rr2 = (baseRR.tp2 + flowBonus) * modeFactor;
  const rr3 = (baseRR.tp3 + flowBonus * 1.5) * modeFactor;

  const makeTP = (
    rrTarget: number,
    sizeToClose: number,
    nearLevels: typeof resistances,
    index: number,
  ): TakeProfitLevel => {
    let tpPrice =
      direction === 'LONG'
        ? entry + slDistance * rrTarget
        : entry - slDistance * rrTarget;

    let tpType: TakeProfitLevel['type'] = 'RR_BASED';
    let reasoning = `R:R ${rrTarget.toFixed(1)}:1`;

    const nearLevel = nearLevels.find((l) => {
      const dist = Math.abs((l.price - tpPrice) / tpPrice) * 100;
      return dist < 0.5 && l.strength !== 'WEAK';
    });

    if (nearLevel) {
      const buffer = direction === 'LONG' ? -0.001 : 0.001;
      tpPrice = nearLevel.price + buffer;
      tpType = 'STRUCTURE_TARGET';
      reasoning =
        `${nearLevel.source} level ${nearLevel.price.toFixed(4)} ` +
        `(R:R thực tế ${(Math.abs(tpPrice - entry) / slDistance).toFixed(1)}:1)`;
    }

    const actualRR = Math.abs(tpPrice - entry) / slDistance;
    const units = (positionSize * leverage) / entry;
    const pnl = Math.abs(tpPrice - entry) * units * sizeToClose;

    const probTP =
      index === 1 ? winProbability : index === 2 ? winProbability * 0.75 : winProbability * 0.5;

    return {
      price: +tpPrice.toFixed(6),
      rrRatio: +actualRR.toFixed(2),
      type: tpType,
      sizeToClose,
      expectedPnlUSDT: +pnl.toFixed(2),
      reasoning,
      probability: +probTP.toFixed(2),
    };
  };

  const tpLevels = direction === 'LONG' ? resistances : supports;

  const tp1 = makeTP(rr1, 0.5, tpLevels, 1);
  const tp2 = makeTP(rr2, 0.3, tpLevels, 2);
  const tp3 = makeTP(rr3, 0.2, tpLevels, 3);

  return { tp1, tp2, tp3 };
}

// ─────────────────────────────────────────
// MAIN: calculateTradePlanV3()
// ─────────────────────────────────────────

export function calculateTradePlanV3(
  symbol: string,
  currentPrice: number,
  klines1h: Kline[],
  klines4h: Kline[],
  scoringResult: ScoringResultV3,
  direction: 'LONG' | 'SHORT',
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
  accountSize: number = DEFAULT_INITIAL_CAPITAL,
  initialCapital: number = DEFAULT_INITIAL_CAPITAL,
): TradePlanV3 {
  const score = direction === 'LONG' ? scoringResult.long : scoringResult.short;
  const marketMode = scoringResult.marketMode;
  const warnings: string[] = [];
  const blockReasons: string[] = [];

  const capitalTier = calculateCapitalTier(accountSize, initialCapital);
  const leverage = capitalTier.notionalPerTrade / capitalTier.sizePerTrade || CFG.LEVERAGE;

  const atr = atrFromKlines(klines1h, currentPrice, 14);
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

  const entryZone = calculateOptimalEntry(
    direction,
    currentPrice,
    ema1h,
    atr,
    score,
    supports,
    resistances,
    whaleWalls,
  );
  const entry = entryZone.optimal;

  const stopLossRaw = calculateOptimalSL(
    direction,
    entry,
    atr,
    score.decision,
    marketMode,
    supports,
    resistances,
    whaleWalls,
    notional,
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
    score.totalScore,
    marketMode,
    direction,
    score.groupScores,
    2.0,
  );

  const { tp1, tp2, tp3 } = calculateOptimalTPs(
    direction,
    entry,
    stopLoss,
    score.decision,
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

  const generatedAt = Date.now();
  const planValid =
    blockReasons.length === 0 &&
    score.decision !== 'KHONG_VAO' &&
    score.decision !== 'CHO_THEM';
  const expiryFields = resolvePlanExpiryOutput(score.totalScore, planValid, generatedAt);

  return {
    symbol,
    direction,
    generatedAt,
    totalScore: score.totalScore,
    decision: score.decision,
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

function entryZoneTypeFromV3(zone: EntryZoneV3): EntryZoneType {
  const r = zone.reasoning.toLowerCase();
  if (r.includes('ema')) return 'PULLBACK_EMA';
  if (r.includes('support') || r.includes('resist') || r.includes('retest')) {
    return 'BREAKOUT_RETEST';
  }
  if (zone.entryType === 'MARKET_OK') return 'MARKET_NEAR';
  return 'MARKET_NEAR';
}

/** Chuyển TradePlanV3 sang TradePlan legacy — journal snapshot / locked plan. */
export function tradePlanV3ToLegacyPlan(plan: TradePlanV3): TradePlan {
  return {
    direction: plan.direction,
    entryPrice: plan.recommendedEntry,
    stopLoss: plan.stopLoss.price,
    takeProfit1: plan.tp1.price,
    takeProfit2: plan.tp2.price,
    takeProfit3: plan.tp3.price,
    positionSize: plan.positionSize,
    marginRequired: plan.positionSizeAdjusted,
    notional: plan.notionalValue,
    riskAmount: plan.stopLoss.maxLossUSDT,
    atrMultiplier: plan.stopLoss.atrDistance,
    rrRatios: [plan.tp1.rrRatio, plan.tp2.rrRatio, plan.tp3.rrRatio],
    notes: plan.entryZone.reasoning,
    entryReason: plan.entryZone.entryType,
    entryZone: {
      optimal: plan.entryZone.optimal,
      rangeLow: plan.entryZone.rangeLow,
      rangeHigh: plan.entryZone.rangeHigh,
      type: entryZoneTypeFromV3(plan.entryZone),
      reasoning: plan.entryZone.reasoning,
      distanceFromCurrentPct: plan.entryZone.distanceFromCurrentPct,
    },
    isSafeSL: plan.stopLoss.isProtectedByWall,
    safeSLReason: plan.stopLoss.reasoning,
    rrRatio: plan.primaryRR,
    tradePlanValid: plan.tradePlanValid,
  };
}
