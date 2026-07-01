import {
  TRADE_SYMBOLS,
  type AnalysisTimeframe,
  type AppTradeSymbol,
  type LayerResult,
  type MarketTrend,
  type PsychologyChecklistV2,
  type TradeDecisionLabel,
  type TradeDirection,
  type TradePlan,
  type TradePlanV3,
  DEFAULT_SETTINGS,
} from '../constants/scoring';
import type { CvdTrend } from '../constants/aiJournal';
import {
  fetch24hTickerChange,
  fetchAllMarketData,
  fetchTickerPrice,
  statsPeriodFor,
} from './binanceApi';
import {
  fetchBtcChange24hPct,
  MARKET_KLINE_LIMIT,
  MARKET_KLINE_LIMIT_MTF,
  MARKET_LS_DEPTH,
} from './marketAnalysisFetch';
import {
  computeFullAnalysisBundle,
  computeMtfChain,
  computeTradeAnalysis,
} from '../hooks/useMarketAnalysis';
import {
  buildAnalysisInputV3FromMarket,
  buildTodayStatsFromJournal,
  canEnterV3,
  scoreAnalysisV3,
  scoringLayersToDisplayV3,
  suggestDirectionV3,
  type DirectionalScoreV3,
  type ScoringResultV3,
} from './scorerV3';
import {
  buildAnalysisInputV4FromMarket,
  buildTodayStatsFromJournalV4,
  canEnterV4,
  scoreAnalysisV4,
  scoringLayersToDisplayV4,
  suggestDirectionV4,
  type DirectionalScoreV4,
  type L6DetailV4,
  type ScoringResultV4,
} from './scorerV4';
import { analyzeCVD, type CVDPoint } from './indicators';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import { computeAtr1hFromKlines } from './atr1h';
import { calculateTradePlanV3 } from './tradePlanV3';
import { calculateTradePlanV4 } from './tradePlanV4';
import { FinalEntryStatus } from '../types/scoring';
import { computeFinalEntryStatusForSide } from './finalEntryStatus';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import {
  resolveDirectionAmbiguity,
  type AmbiguityState,
} from './directionAmbiguity';

/** Per-symbol ambiguity hysteresis — truyền từ useSignalBoard (optional). */
export interface AmbiguityStateStores {
  v3?: Map<string, AmbiguityState>;
  v4?: Map<string, AmbiguityState>;
}

export interface SignalScanContext {
  consecutiveLosses: number;
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
  dailyLossUSDT: number;
  recentJournal: Array<{ outcome: { status: string } }>;
  /** Vốn hiện tại — trade plan dynamic capital */
  currentCapital?: number;
  /** Vốn gốc ban đầu */
  initialCapital?: number;
}

export interface SignalRowScorerSnapshot {
  score: number;
  longScore: number;
  shortScore: number;
  direction: TradeDirection;
  decisionLabel: TradeDecisionLabel;
  decisionDisplay: string;
  winrate: string;
  canEnter: boolean;
  /** Layers hướng V3 gợi ý lúc quét — UI chi tiết */
  layers: LayerResult[];
  mandatoryViolations: string[];
  hardBlocked: boolean;
  marketMode?: 'TRENDING' | 'RANGING';
  groupScores?: { A: number; B: number; C: number };
  groupBlocks?: string[];
  /** Layers / blocks / warnings riêng từng hướng — position advisor */
  longLayers?: LayerResult[];
  shortLayers?: LayerResult[];
  longGroupScores?: { A: number; B: number; C: number };
  shortGroupScores?: { A: number; B: number; C: number };
  longGroupBlocks?: string[];
  shortGroupBlocks?: string[];
  longHardBlocks?: string[];
  shortHardBlocks?: string[];
  longWarnings?: string[];
  shortWarnings?: string[];
  scoringWarnings?: string[];
  /** V4 — chỉ L9 chặn, chờ phiên tốt để tái chấm */
  awaitingRescore?: boolean;
  /** Scoring + tradePlanValid — hiển thị thẻ Signal Board */
  finalEntryStatus?: FinalEntryStatus;
  /** L11 EXTREME squeeze — cùng hướng setup, ENTRY_VALID */
  squeezeWarning?: string | null;
  /** Long vs Short quá sát — block vào lệnh (hysteresis 2-scan) */
  isAmbiguousDirection?: boolean;
  ambiguousMessage?: string;
}

function latestCvdValue(cvdPoints: CVDPoint[]): number {
  if (cvdPoints.length === 0) return 0;
  return cvdPoints[cvdPoints.length - 1].cvd;
}

function cvdTrendFromPoints(
  cvdPoints: CVDPoint[],
  direction: TradeDirection,
): CvdTrend {
  const slope = analyzeCVD(cvdPoints, direction).slope;
  if (slope === 'up') return 'UP';
  if (slope === 'down') return 'DOWN';
  return 'FLAT';
}

const KLINE_LIMIT = MARKET_KLINE_LIMIT;
const KLINE_LIMIT_MTF = MARKET_KLINE_LIMIT_MTF;

export interface SignalRow {
  symbol: AppTradeSymbol;
  price: number | null;
  change24h: number;
  trend: MarketTrend;
  regimeConfidence: number;
  score: number;
  longScore: number;
  shortScore: number;
  direction: TradeDirection;
  decisionLabel: TradeDecisionLabel;
  decisionDisplay: string;
  /** Winrate gợi ý từ Scorer V3 */
  winrate: string;
  canEnter: boolean;
  tradePlan: TradePlan | null;
  /** Kế hoạch V3 — entry/SL/TP tối ưu từ Scorer */
  tradePlanV3?: TradePlanV3 | null;
  /** Trade plan riêng theo engine (V3/V4) */
  tradePlansByScorer?: Partial<Record<'v3' | 'v4', TradePlanV3 | null>>;
  layers: LayerResult[];
  mandatoryViolations: string[];
  hardBlocked: boolean;
  fromCache: boolean;
  /** Kế hoạch LONG/SHORT từ bundle — dùng tối ưu SL/TP lệnh đang mở */
  tradePlans?: Partial<Record<TradeDirection, TradePlan>>;
  /** Snapshot market cho locked plan / journal */
  cvdValue?: number;
  cvdTrend?: CvdTrend;
  fundingRate?: number;
  topLSRatio?: number;
  /** Snapshot Scorer V4 */
  v4?: SignalRowScorerSnapshot;
  /** @deprecated Snapshot Scorer V3 — giữ cho hàng cache cũ */
  v3?: SignalRowScorerSnapshot;
  /** ATR(14) thật khung 1H từ Scorer */
  atr1h?: number;
  /** L6 FundingState — V4 layer detail UI */
  l6Detail?: L6DetailV4;
  error?: string;
  /** Trạng thái vào lệnh cuối (engine V4 mặc định trên row) */
  finalEntryStatus?: FinalEntryStatus;
  /** L11 squeeze warning — V4 only */
  squeezeWarning?: string | null;
  /** L11 Squeeze Risk snapshot — V4 only */
  squeezeRisk?: SqueezeRiskResult;
  isAmbiguousDirection?: boolean;
  ambiguousMessage?: string;
}

function errorRow(symbol: AppTradeSymbol, message: string): SignalRow {
  return {
    symbol,
    price: null,
    change24h: 0,
    trend: 'SIDEWAYS',
    regimeConfidence: 0,
    score: 0,
    longScore: 0,
    shortScore: 0,
    direction: 'LONG',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    tradePlan: null,
    tradePlanV3: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: true,
    fromCache: false,
    error: message,
  };
}

function snapshotFromV3(
  scoringV3: ScoringResultV3,
  direction: TradeDirection,
): SignalRowScorerSnapshot {
  const active = direction === 'LONG' ? scoringV3.long : scoringV3.short;
  const violations = [...active.hardBlocks, ...active.groupBlocks];
  return {
    score: active.totalScore,
    longScore: scoringV3.long.totalScore,
    shortScore: scoringV3.short.totalScore,
    direction,
    decisionLabel: active.decision as TradeDecisionLabel,
    decisionDisplay: active.decisionLabel,
    winrate: active.winrate,
    canEnter: canEnterV3(active),
    layers: scoringLayersToDisplayV3(active.layers),
    mandatoryViolations: violations,
    hardBlocked: active.hardBlocks.length > 0 || active.groupBlocks.length > 0,
    marketMode: scoringV3.marketMode,
    groupScores: active.groupScores,
    groupBlocks: active.groupBlocks,
    longLayers: scoringLayersToDisplayV3(scoringV3.long.layers),
    shortLayers: scoringLayersToDisplayV3(scoringV3.short.layers),
    longGroupScores: scoringV3.long.groupScores,
    shortGroupScores: scoringV3.short.groupScores,
    longGroupBlocks: scoringV3.long.groupBlocks,
    shortGroupBlocks: scoringV3.short.groupBlocks,
    longHardBlocks: scoringV3.long.hardBlocks,
    shortHardBlocks: scoringV3.short.hardBlocks,
    longWarnings: scoringV3.long.warnings,
    shortWarnings: scoringV3.short.warnings,
    scoringWarnings: scoringV3.warnings,
  };
}

function snapshotFromV4(
  scoringV4: ScoringResultV4,
  direction: TradeDirection,
): SignalRowScorerSnapshot {
  const active = direction === 'LONG' ? scoringV4.long : scoringV4.short;
  const displayScore = active.officialTotalScore ?? active.referenceTotalScore;
  const violations = [...active.hardBlocks, ...active.groupBlocks];
  return {
    score: displayScore,
    longScore: scoringV4.long.officialTotalScore ?? scoringV4.long.referenceTotalScore,
    shortScore: scoringV4.short.officialTotalScore ?? scoringV4.short.referenceTotalScore,
    direction,
    decisionLabel: active.decision as TradeDecisionLabel,
    decisionDisplay: active.decisionLabel,
    winrate: active.winrate,
    canEnter: canEnterV4(active),
    layers: scoringLayersToDisplayV4(active.layers),
    mandatoryViolations: violations,
    hardBlocked: active.hardBlocks.length > 0 || active.groupBlocks.length > 0,
    marketMode: scoringV4.marketMode,
    groupScores: active.groupScores,
    groupBlocks: active.groupBlocks,
    longLayers: scoringLayersToDisplayV4(scoringV4.long.layers),
    shortLayers: scoringLayersToDisplayV4(scoringV4.short.layers),
    longGroupScores: scoringV4.long.groupScores,
    shortGroupScores: scoringV4.short.groupScores,
    longGroupBlocks: scoringV4.long.groupBlocks,
    shortGroupBlocks: scoringV4.short.groupBlocks,
    longHardBlocks: scoringV4.long.hardBlocks,
    shortHardBlocks: scoringV4.short.hardBlocks,
    longWarnings: scoringV4.long.warnings,
    shortWarnings: scoringV4.short.warnings,
    scoringWarnings: scoringV4.warnings,
    awaitingRescore: active.awaitingRescore,
  };
}

function enrichSnapshotFinalStatus(
  snap: SignalRowScorerSnapshot,
  plan: TradePlanV3 | null,
  hardBlocks: string[],
  groupBlocks: string[],
  tradeSide: TradeDirection,
  squeezeRisk?: SqueezeRiskResult | null,
): SignalRowScorerSnapshot {
  const { finalEntryStatus, squeezeWarning } = computeFinalEntryStatusForSide(
    snap.decisionLabel,
    plan,
    { hardBlocks, groupBlocks },
    { tradeSide, squeezeRisk },
  );
  return {
    ...snap,
    finalEntryStatus,
    squeezeWarning,
  };
}

function applyAmbiguityToSnapshot(
  snap: SignalRowScorerSnapshot,
  ambiguity: AmbiguityState,
): SignalRowScorerSnapshot {
  if (ambiguity.status !== 'AMBIGUOUS') return snap;
  return {
    ...snap,
    isAmbiguousDirection: true,
    ambiguousMessage: ambiguity.message,
    canEnter: false,
  };
}

function applySnapshotToRow(row: SignalRow, snap: SignalRowScorerSnapshot): SignalRow {
  return {
    ...row,
    score: snap.score,
    longScore: snap.longScore,
    shortScore: snap.shortScore,
    direction: snap.direction,
    decisionLabel: snap.decisionLabel,
    decisionDisplay: snap.decisionDisplay,
    winrate: snap.winrate,
    canEnter: snap.canEnter,
    layers: snap.layers,
    mandatoryViolations: snap.mandatoryViolations,
    hardBlocked: snap.hardBlocked,
    finalEntryStatus: snap.finalEntryStatus,
    squeezeWarning: snap.squeezeWarning,
    isAmbiguousDirection: snap.isAmbiguousDirection,
    ambiguousMessage: snap.ambiguousMessage,
  };
}

export async function scanSignalSymbol(
  symbol: AppTradeSymbol,
  timeframe: AnalysisTimeframe,
  btcChange24h: number,
  psychologyChecklist: PsychologyChecklistV2,
  scanContext?: SignalScanContext,
  ambiguityStores?: AmbiguityStateStores,
): Promise<SignalRow> {
  try {
    const [market, ticker, change24h] = await Promise.all([
      fetchAllMarketData(
        symbol,
        KLINE_LIMIT,
        MARKET_LS_DEPTH,
        statsPeriodFor(timeframe),
        '1h',
        KLINE_LIMIT_MTF,
      ),
      fetchTickerPrice(symbol),
      symbol === 'BTCUSDT'
        ? Promise.resolve(btcChange24h)
        : fetch24hTickerChange(symbol).catch(() => 0),
    ]);

    const mtfChain = computeMtfChain(market);
    const analysis = computeTradeAnalysis(market, timeframe, mtfChain);
    if (!analysis) return errorRow(symbol, 'Thiếu dữ liệu phân tích');

    const analysisInputV4 = buildAnalysisInputV4FromMarket({
      symbol,
      currentPrice: ticker.price,
      market,
      psychologyChecklist,
      btc24hChangePct: btcChange24h,
      liquidityPools: analysis.heatmap.pools,
      recentJournal: scanContext?.recentJournal,
    });
    if (!analysisInputV4) return errorRow(symbol, 'Không đủ dữ liệu 1H/4H');

    const todayStatsV3 = buildTodayStatsFromJournal(
      scanContext?.consecutiveLosses ?? 0,
      scanContext?.dailyLossUSDT ?? 0,
      scanContext
        ? {
            consecutiveLossesIn24h: scanContext.consecutiveLossesIn24h,
            lossStreakLocked: scanContext.lossStreakLocked,
            lossStreakLockUntil: scanContext.lossStreakLockUntil,
          }
        : undefined,
    );
    const todayStatsV4 = buildTodayStatsFromJournalV4(
      scanContext?.consecutiveLosses ?? 0,
      scanContext?.dailyLossUSDT ?? 0,
      scanContext
        ? {
            consecutiveLossesIn24h: scanContext.consecutiveLossesIn24h,
            lossStreakLocked: scanContext.lossStreakLocked,
            lossStreakLockUntil: scanContext.lossStreakLockUntil,
          }
        : undefined,
    );

    const analysisInputV3 =
      buildAnalysisInputV3FromMarket({
        symbol,
        currentPrice: ticker.price,
        market,
        psychologyChecklist,
        btc24hChangePct: btcChange24h,
        liquidityPools: analysis.heatmap.pools,
        recentJournal: scanContext?.recentJournal,
      }) ?? analysisInputV4;

    const scoringV3 = scoreAnalysisV3(analysisInputV3, todayStatsV3);
    const scoringV4 = scoreAnalysisV4(analysisInputV4, todayStatsV4);

    const longScoreV4 =
      scoringV4.long.officialTotalScore ?? scoringV4.long.referenceTotalScore;
    const shortScoreV4 =
      scoringV4.short.officialTotalScore ?? scoringV4.short.referenceTotalScore;
    const prevStateV4 = ambiguityStores?.v4?.get(symbol) ?? null;
    const ambiguityV4 = resolveDirectionAmbiguity(
      longScoreV4,
      shortScoreV4,
      prevStateV4,
    );
    ambiguityStores?.v4?.set(symbol, ambiguityV4);

    const longScoreV3 = scoringV3.long.totalScore;
    const shortScoreV3 = scoringV3.short.totalScore;
    const prevStateV3 = ambiguityStores?.v3?.get(symbol) ?? null;
    const ambiguityV3 = resolveDirectionAmbiguity(
      longScoreV3,
      shortScoreV3,
      prevStateV3,
    );
    ambiguityStores?.v3?.set(symbol, ambiguityV3);

    const directionV3 = suggestDirectionV3(scoringV3);
    const directionV4 = suggestDirectionV4(scoringV4);
    let v3Base = snapshotFromV3(scoringV3, directionV3);
    let v4Base = snapshotFromV4(scoringV4, directionV4);
    v3Base = applyAmbiguityToSnapshot(v3Base, ambiguityV3);
    v4Base = applyAmbiguityToSnapshot(v4Base, ambiguityV4);

    const bundle = computeFullAnalysisBundle(
      market,
      analysis,
      timeframe,
      btcChange24h,
      ticker.price,
    );
    const longTradePlan = bundle?.long.tradePlan ?? null;
    const shortTradePlan = bundle?.short.tradePlan ?? null;
    const tradePlan = directionV4 === 'LONG' ? longTradePlan : shortTradePlan;

    const cvdPoints = analysisInputV4.cvdPoints ?? [];
    const cvdValue = latestCvdValue(cvdPoints);
    const cvdTrend = cvdTrendFromPoints(cvdPoints, directionV4);
    const topLSRatio =
      analysisInputV4.topLongShortRatios.length > 0
        ? analysisInputV4.topLongShortRatios[analysisInputV4.topLongShortRatios.length - 1]
        : 1;

    const klines1h = market.klines[timeframe]?.klines ?? market.klines['1h']?.klines ?? [];
    const klines4h = market.klines['4h']?.klines ?? [];
    const whaleWalls = buildWhaleEntryWalls(
      symbol,
      ticker.price,
      computeAtr1hFromKlines(klines1h, ticker.price),
      analysis.heatmap.pools,
    );

    let tradePlanV3Scorer: TradePlanV3 | null = null;
    let tradePlanV4Scorer: TradePlanV3 | null = null;
    if (klines1h.length > 0 && klines4h.length > 0) {
      const currentCapital = scanContext?.currentCapital ?? DEFAULT_SETTINGS.accountSize;
      const initialCapital = scanContext?.initialCapital ?? DEFAULT_SETTINGS.initialCapital;
      tradePlanV3Scorer = calculateTradePlanV3(
        symbol,
        ticker.price,
        klines1h,
        klines4h,
        scoringV3,
        directionV3,
        whaleWalls,
        currentCapital,
        initialCapital,
      );
      tradePlanV4Scorer = calculateTradePlanV4(
        symbol,
        ticker.price,
        klines1h,
        klines4h,
        scoringV4,
        directionV4,
        whaleWalls,
        currentCapital,
        initialCapital,
      );
    }

    const activeV3 = directionV3 === 'LONG' ? scoringV3.long : scoringV3.short;
    const activeV4 = directionV4 === 'LONG' ? scoringV4.long : scoringV4.short;
    const v3 = enrichSnapshotFinalStatus(
      v3Base,
      tradePlanV3Scorer,
      activeV3.hardBlocks,
      activeV3.groupBlocks,
      directionV3,
    );
    const v4 = enrichSnapshotFinalStatus(
      v4Base,
      tradePlanV4Scorer,
      activeV4.hardBlocks,
      activeV4.groupBlocks,
      directionV4,
      scoringV4.squeezeRisk,
    );

    const baseRow: SignalRow = {
      symbol,
      price: ticker.price,
      change24h,
      trend: analysis.smc.trend,
      regimeConfidence: analysis.regime.confidence,
      score: v4.score,
      longScore: v4.longScore,
      shortScore: v4.shortScore,
      direction: v4.direction,
      decisionLabel: v4.decisionLabel,
      decisionDisplay: v4.decisionDisplay,
      winrate: v4.winrate,
      canEnter: v4.canEnter,
      tradePlan,
      tradePlanV3: tradePlanV4Scorer,
      tradePlansByScorer: { v3: tradePlanV3Scorer, v4: tradePlanV4Scorer },
      layers: v4.layers,
      mandatoryViolations: v4.mandatoryViolations,
      hardBlocked: v4.hardBlocked,
      fromCache: market.fromCache,
      tradePlans: {
        LONG: longTradePlan ?? undefined,
        SHORT: shortTradePlan ?? undefined,
      },
      cvdValue,
      cvdTrend,
      fundingRate: analysisInputV4.fundingRate,
      topLSRatio,
      v3,
      v4,
      atr1h: scoringV4.atr1h,
      l6Detail: scoringV4.l6Detail,
      squeezeRisk: scoringV4.squeezeRisk,
      finalEntryStatus: v4.finalEntryStatus,
      squeezeWarning: v4.squeezeWarning,
    };

    return applySnapshotToRow(baseRow, v4);
  } catch (e) {
    return errorRow(symbol, String(e));
  }
}

/** Quét 4 cặp — Scorer V3 + Phase 4 cho trade plan. */
export async function scanAllSignalRows(
  timeframe: AnalysisTimeframe,
  psychologyChecklist: PsychologyChecklistV2,
  scanContext?: SignalScanContext,
  ambiguityStores?: AmbiguityStateStores,
): Promise<SignalRow[]> {
  const btcChange24h = await fetchBtcChange24hPct();
  const rows: SignalRow[] = [];
  for (const sym of TRADE_SYMBOLS) {
    rows.push(
      await scanSignalSymbol(
        sym,
        timeframe,
        btcChange24h,
        psychologyChecklist,
        scanContext,
        ambiguityStores,
      ),
    );
  }
  return rows;
}
