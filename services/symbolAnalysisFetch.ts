import type { AnalysisTimeframe, AppTradeSymbol, PsychologyChecklistV2 } from '../constants/scoring';
import type { AllMarketData } from './binanceApi';
import type { ScoringResultV4 } from './scorerV4';
import type { ScoringResultV3 } from './scorerV3';
import { fetchMarketAnalysisBundle } from './marketAnalysisFetch';
import { computeMtfChain, computeTradeAnalysis } from '../hooks/useMarketAnalysis';
import {
  buildAnalysisInputV3FromMarket,
  buildTodayStatsFromJournal,
  scoreAnalysisV3,
} from './scorerV3';
import {
  buildAnalysisInputV4FromMarket,
  buildTodayStatsFromJournalV4,
  scoreAnalysisV4,
} from './scorerV4';

export interface SymbolAnalysisResult {
  symbol: AppTradeSymbol;
  currentPrice: number;
  btcChange24h: number;
  market: AllMarketData;
  scoringResultV4: ScoringResultV4;
  scoringResultV3: ScoringResultV3;
  /** @deprecated Dùng scoringResultV4 */
  scoringResult: ScoringResultV4;
}

/** Fetch đủ klines/funding/OI/CVD/whale walls cho 1 symbol — chấm cả V3 và V4. */
export async function fetchAnalysisDataForSymbol(
  symbol: AppTradeSymbol,
  timeframe: AnalysisTimeframe,
  psychologyChecklist: PsychologyChecklistV2,
  todayStats: {
    consecutiveLosses: number;
    dailyLossUSDT: number;
    consecutiveLossesIn24h: number;
    lossStreakLocked: boolean;
    lossStreakLockUntil: number | null;
  },
  recentJournal?: Array<{ outcome: { status: string } }>,
): Promise<SymbolAnalysisResult | null> {
  try {
    const { market, ticker, btcChange24h } = await fetchMarketAnalysisBundle(symbol, timeframe);

    const mtfChain = computeMtfChain(market);
    const analysis = computeTradeAnalysis(market, timeframe, mtfChain);
    if (!analysis) return null;

    const v4Input = buildAnalysisInputV4FromMarket({
      symbol,
      currentPrice: ticker.price,
      market,
      psychologyChecklist,
      btc24hChangePct: btcChange24h,
      liquidityPools: analysis.heatmap.pools,
      recentJournal,
    });
    const v3Input = buildAnalysisInputV3FromMarket({
      symbol,
      currentPrice: ticker.price,
      market,
      psychologyChecklist,
      btc24hChangePct: btcChange24h,
      liquidityPools: analysis.heatmap.pools,
      recentJournal,
    });
    if (!v4Input || !v3Input) return null;

    const lock = {
      consecutiveLossesIn24h: todayStats.consecutiveLossesIn24h,
      lossStreakLocked: todayStats.lossStreakLocked,
      lossStreakLockUntil: todayStats.lossStreakLockUntil,
    };
    const statsV4 = buildTodayStatsFromJournalV4(
      todayStats.consecutiveLosses,
      todayStats.dailyLossUSDT,
      lock,
    );
    const statsV3 = buildTodayStatsFromJournal(
      todayStats.consecutiveLosses,
      todayStats.dailyLossUSDT,
      lock,
    );
    const scoringResultV4 = scoreAnalysisV4(v4Input, statsV4);
    const scoringResultV3 = scoreAnalysisV3(v3Input, statsV3);

    return {
      symbol,
      currentPrice: ticker.price,
      btcChange24h,
      market,
      scoringResultV4,
      scoringResultV3,
      scoringResult: scoringResultV4,
    };
  } catch (error) {
    console.error(`[fetchAnalysisDataForSymbol] ${symbol}:`, error);
    return null;
  }
}
