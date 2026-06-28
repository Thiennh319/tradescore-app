import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import {
  DEFAULT_SETTINGS,
  TIMEFRAMES,
  type AnalysisTimeframe,
  type AppTradeSymbol,
  type EntryQualityScore,
  type FullAnalysisResult,
  type IndicatorPsychology,
  type MarketTrend,
  type PsychologyChecklistV2,
  type StructureType,
  type Timeframe,
  type TradeDirection,
  type TradePlanV3,
} from '../constants/scoring';
import { fetchBookTicker, fetchTickerPrice, type AllMarketData, type BookTickerResult } from '../services/binanceApi';
import { fetchMarketAnalysisBundle } from '../services/marketAnalysisFetch';
import {
  analyzeOrderFlow,
  calculateLiquidityHeatmap,
  classifyMarketRegime,
  detectSMCStructure,
  klinesToOHLCV,
  type LiquidityHeatmapResult,
  type OrderFlowAnalysis,
  type RegimeClassification,
  type SMCStructureResult,
} from '../services/indicators';
import { computeAtr1hFromKlines } from '../services/atr1h';
import { buildWhaleEntryWalls } from '../services/whaleEntryWalls';
import {
  buildIndicatorSet,
  buildScorerContext,
  calculateEntryQuality,
  computeAIScore,
  runFullAnalysis,
  type AIScoreResult,
  type TradeSide,
} from '../services/scorer';
import {
  buildAnalysisInputV4FromMarket,
  buildTodayStatsFromJournalV4,
  scoreAnalysisV4,
  suggestDirectionV4,
  type ScoringResultV4,
} from '../services/scorerV4';
import { calculateTradePlanV4 } from '../services/tradePlanV4';

export interface MarketAnalysisScoringContext {
  consecutiveLosses: number;
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
  dailyLossUSDT: number;
  recentJournal: Array<{ outcome: { status: string } }>;
  currentCapital?: number;
  initialCapital?: number;
}

export interface MtfTimeframeState {
  timeframe: Timeframe;
  loaded: boolean;
  trend: MarketTrend;
  closePrice?: number;
  lastSignalType: StructureType | null;
  swingHighs: number;
  swingLows: number;
}

export interface TradeAnalysis {
  smc: SMCStructureResult;
  heatmap: LiquidityHeatmapResult;
  orderFlow: OrderFlowAnalysis;
  regime: RegimeClassification;
  aiScore: AIScoreResult;
  entryQuality: EntryQualityScore;
}

export interface FullAnalysisBundle {
  long: FullAnalysisResult;
  short: FullAnalysisResult;
  suggestedDirection: TradeDirection;
}

function sessionHourUtcPlus7(): number {
  return (new Date().getUTCHours() + 7) % 24;
}

export function computeFullAnalysisBundle(
  market: AllMarketData,
  analysis: TradeAnalysis,
  timeframe: AnalysisTimeframe,
  btcChange24h: number,
  currentPrice: number | null,
  psychology?: Partial<IndicatorPsychology>,
): FullAnalysisBundle | null {
  const klines = market.klines[timeframe]?.klines;
  const klines4h = market.klines['4h']?.klines;
  if (!klines?.length) return null;

  const ohlcv = klinesToOHLCV(klines);
  const ohlcv4h = klines4h?.length ? klinesToOHLCV(klines4h) : undefined;

  const oiHist = market.oiEngine?.history;
  let oiDelta = 0;
  if (oiHist && oiHist.length >= 2) {
    oiDelta =
      oiHist[oiHist.length - 1].sumOpenInterest - oiHist[oiHist.length - 2].sumOpenInterest;
  }

  const fundingRate = market.fundingHistory?.records.at(-1)?.fundingRate ?? 0;
  const longShortRatio = market.longShortRatio?.ratio ?? 1;

  const indicators = buildIndicatorSet({
    ohlcv,
    ohlcv4h,
    oiDelta,
    fundingRate,
    longShortRatio,
    btcChange24h,
    sessionHour: sessionHourUtcPlus7(),
    cvdSeries: analysis.orderFlow.cvd,
    psychology,
  });

  const price = currentPrice ?? indicators.price;
  const whaleWalls = analysis.heatmap.pools;
  const settings = DEFAULT_SETTINGS;

  const long = runFullAnalysis({
    indicators,
    direction: 'LONG',
    settings,
    whaleWalls,
    currentPrice: price,
  });

  const short = runFullAnalysis({
    indicators,
    direction: 'SHORT',
    settings,
    whaleWalls,
    currentPrice: price,
  });

  const suggestedDirection: TradeDirection =
    analysis.smc.trend === 'BEARISH'
      ? 'SHORT'
      : analysis.smc.trend === 'BULLISH'
        ? 'LONG'
        : long.totalScore >= short.totalScore
          ? 'LONG'
          : 'SHORT';

  return { long, short, suggestedDirection };
}

function orderBookImbalance(market: AllMarketData): number {
  const bids = market.orderBook?.bids ?? [];
  const asks = market.orderBook?.asks ?? [];
  let bidVol = 0;
  let askVol = 0;
  for (let i = 0; i < bids.length; i++) bidVol += bids[i].quantity;
  for (let i = 0; i < asks.length; i++) askVol += asks[i].quantity;
  const total = bidVol + askVol;
  if (total <= 0) return 0;
  return (bidVol - askVol) / total;
}

export function computeMtfChain(market: AllMarketData | null): MtfTimeframeState[] {
  return TIMEFRAMES.map((timeframe) => {
    const klines = market?.klines[timeframe]?.klines;
    if (!klines?.length) {
      return {
        timeframe,
        loaded: false,
        trend: 'SIDEWAYS' as const,
        lastSignalType: null,
        swingHighs: 0,
        swingLows: 0,
      };
    }
    const ohlcv = klinesToOHLCV(klines);
    const smc = detectSMCStructure(ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.timestamp);
    const lastSignal = smc.signals[smc.signals.length - 1];
    const n = ohlcv.close.length;
    return {
      timeframe,
      loaded: true,
      trend: smc.trend,
      closePrice: ohlcv.close[n - 1],
      lastSignalType: lastSignal?.type ?? null,
      swingHighs: smc.swings.filter((s) => s.type === 'HIGH').length,
      swingLows: smc.swings.filter((s) => s.type === 'LOW').length,
    };
  });
}

function mtfConfluenceScore(chain: MtfTimeframeState[]): number {
  let bull = 0;
  let bear = 0;
  let total = 0;
  for (const { loaded, trend } of chain) {
    if (!loaded) continue;
    total += 1;
    if (trend === 'BULLISH') bull += 1;
    else if (trend === 'BEARISH') bear += 1;
  }
  if (total === 0) return 50;
  return 50 + ((bull - bear) / total) * 40;
}

function inferEntrySide(smc: SMCStructureResult): TradeSide {
  if (smc.trend === 'BEARISH') return 'SHORT';
  return 'LONG';
}

export function computeTradeAnalysis(
  market: AllMarketData,
  timeframe: Timeframe,
  mtfChain: MtfTimeframeState[],
): TradeAnalysis | null {
  const klines = market.klines[timeframe]?.klines;
  if (!klines?.length) return null;

  const ohlcv = klinesToOHLCV(klines);
  const smc = detectSMCStructure(ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.timestamp);
  const heatmap = calculateLiquidityHeatmap(
    market.orderBook,
    market.forceOrders?.orders ?? null,
  );
  const orderFlow = analyzeOrderFlow(
    ohlcv,
    market.oiEngine?.history ?? null,
    market.fundingHistory?.records ?? null,
  );
  const regime = classifyMarketRegime(ohlcv.close, ohlcv.high, ohlcv.low, ohlcv.timestamp);

  const n = ohlcv.close.length;
  const entryPrice = ohlcv.close[n - 1];
  const side = inferEntrySide(smc);
  const postBars: { high: number; low: number }[] = [];
  for (let i = Math.max(0, n - 6); i < n; i++) {
    postBars.push({ high: ohlcv.high[i], low: ohlcv.low[i] });
  }
  const entryQuality = calculateEntryQuality({
    entryPrice,
    side,
    postEntryBars: postBars,
    pools: heatmap.pools,
  });

  const aiScore = computeAIScore(
    buildScorerContext(regime.regime, ohlcv, smc, orderFlow, heatmap, regime, {
      entryQuality,
      orderBookImbalance: orderBookImbalance(market),
      mtfConfluenceScore: mtfConfluenceScore(mtfChain),
    }),
  );

  return { smc, heatmap, orderFlow, regime, aiScore, entryQuality };
}

export function useMarketAnalysis(
  symbol: AppTradeSymbol = 'BTCUSDT',
  analysisTimeframe: AnalysisTimeframe = '1h',
  psychology?: Partial<IndicatorPsychology>,
  scoringPsychology?: PsychologyChecklistV2,
  scoringContext?: MarketAnalysisScoringContext,
) {
  const [market, setMarket] = useState<AllMarketData | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [book, setBook] = useState<BookTickerResult | null>(null);
  const [priceDir, setPriceDir] = useState<'up' | 'down' | 'flat'>('flat');
  const [priceUpdatedAt, setPriceUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [btcChange24h, setBtcChange24h] = useState(0);
  const prevPrice = useRef<number | null>(null);

  const loadMarket = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { market: result, btcChange24h: btcCh } = await fetchMarketAnalysisBundle(
        symbol,
        analysisTimeframe,
      );
      setMarket(result);
      setBtcChange24h(btcCh);
    } catch (e) {
      setError(String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [symbol, analysisTimeframe]);

  const loadPrice = useCallback(async () => {
    try {
      const [ticker, bookTicker] = await Promise.all([
        fetchTickerPrice(symbol),
        fetchBookTicker(symbol),
      ]);
      if (prevPrice.current != null) {
        if (ticker.price > prevPrice.current) setPriceDir('up');
        else if (ticker.price < prevPrice.current) setPriceDir('down');
        else setPriceDir('flat');
      }
      prevPrice.current = ticker.price;
      setPrice(ticker.price);
      setBook(bookTicker);
      setPriceUpdatedAt(Date.now());
    } catch {
      // keep last tick
    }
  }, [symbol]);

  useEffect(() => {
    loadMarket();
    loadPrice();
  }, [loadMarket, loadPrice]);

  useEffect(() => {
    const id = setInterval(loadPrice, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadPrice]);

  useEffect(() => {
    const id = setInterval(
      () => loadMarket(true),
      SCAN_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [loadMarket]);

  const mtfChain = useMemo(() => computeMtfChain(market), [market]);

  const analysis = useMemo(() => {
    if (!market) return null;
    return computeTradeAnalysis(market, analysisTimeframe, mtfChain);
  }, [market, analysisTimeframe, mtfChain]);

  const fullAnalysis = useMemo(() => {
    if (!market || !analysis) return null;
    return computeFullAnalysisBundle(
      market,
      analysis,
      analysisTimeframe,
      btcChange24h,
      price,
      psychology,
    );
  }, [market, analysis, analysisTimeframe, btcChange24h, price, psychology]);

  const scoringResultV4 = useMemo((): ScoringResultV4 | null => {
    if (!market || price == null || !scoringPsychology) return null;
    const input = buildAnalysisInputV4FromMarket({
      symbol,
      currentPrice: price,
      market,
      psychologyChecklist: scoringPsychology,
      btc24hChangePct: btcChange24h,
      liquidityPools: analysis?.heatmap.pools,
      recentJournal: scoringContext?.recentJournal,
    });
    if (!input) return null;
    const todayStats = buildTodayStatsFromJournalV4(
      scoringContext?.consecutiveLosses ?? 0,
      scoringContext?.dailyLossUSDT ?? 0,
      scoringContext
        ? {
            consecutiveLossesIn24h: scoringContext.consecutiveLossesIn24h,
            lossStreakLocked: scoringContext.lossStreakLocked,
            lossStreakLockUntil: scoringContext.lossStreakLockUntil,
          }
        : undefined,
    );
    return scoreAnalysisV4(input, todayStats);
  }, [
    market,
    price,
    scoringPsychology,
    btcChange24h,
    symbol,
    analysis?.heatmap.pools,
    scoringContext?.consecutiveLosses,
    scoringContext?.consecutiveLossesIn24h,
    scoringContext?.lossStreakLocked,
    scoringContext?.lossStreakLockUntil,
    scoringContext?.dailyLossUSDT,
    scoringContext?.recentJournal,
  ]);

  const suggestedDirection = useMemo((): TradeDirection | null => {
    return scoringResultV4 ? suggestDirectionV4(scoringResultV4) : null;
  }, [scoringResultV4]);

  const tradePlanV3 = useMemo((): TradePlanV3 | null => {
    if (!market || price == null || !scoringResultV4 || !analysis) return null;
    const klines1h = market.klines[analysisTimeframe]?.klines ?? market.klines['1h']?.klines;
    const klines4h = market.klines['4h']?.klines;
    if (!klines1h?.length || !klines4h?.length) return null;
    const direction = suggestDirectionV4(scoringResultV4) ?? 'LONG';
    const whaleWalls = buildWhaleEntryWalls(
      symbol,
      price,
      computeAtr1hFromKlines(klines1h, price),
      analysis.heatmap.pools,
    );
    const currentCapital = scoringContext?.currentCapital ?? DEFAULT_SETTINGS.accountSize;
    const initialCapital = scoringContext?.initialCapital ?? DEFAULT_SETTINGS.initialCapital;
    return calculateTradePlanV4(
      symbol,
      price,
      klines1h,
      klines4h,
      scoringResultV4,
      direction,
      whaleWalls,
      currentCapital,
      initialCapital,
    );
  }, [market, price, scoringResultV4, analysis, analysisTimeframe, symbol, scoringContext]);

  const refresh = useCallback(() => {
    loadMarket();
    loadPrice();
  }, [loadMarket, loadPrice]);

  const tfLoaded = useMemo(
    () => mtfChain.filter((s) => s.loaded).length,
    [mtfChain],
  );

  return {
    symbol,
    market,
    analysis,
    fullAnalysis,
    scoringResultV4,
    suggestedDirection,
    tradePlanV3,
    btcChange24h,
    price,
    book,
    priceDir,
    priceUpdatedAt,
    loading,
    error,
    tfLoaded,
    mtfChain,
    refresh,
    analysisTimeframe,
  };
}
