import type { AnalysisTimeframe, AppTradeSymbol, PsychologyChecklistV2 } from '../constants/scoring';
import type { CvdTrend } from '../constants/aiJournal';
import { analyzeCVD } from './indicators';
import { buildAnalysisInputFromMarket, type AnalysisInput } from './analysisInput';
import { getEntryZonePriceStatus } from './lockedPlanScoring';
import { fetchAllMarketData, fetchTickerPrice, statsPeriodFor } from './binanceApi';
import type { SignalRow } from './signalBoardScan';

const KLINE_LIMIT = 220;

export function cvdTrendFromAnalysis(
  cvdPoints: AnalysisInput['cvdPoints'],
  direction: 'LONG' | 'SHORT',
): CvdTrend {
  const slope = analyzeCVD(cvdPoints, direction).slope;
  if (slope === 'up') return 'UP';
  if (slope === 'down') return 'DOWN';
  return 'FLAT';
}

export function latestCvdValue(cvdPoints: AnalysisInput['cvdPoints']): number {
  if (cvdPoints.length === 0) return 0;
  return cvdPoints[cvdPoints.length - 1].cvd;
}

export function pickSignalRowForSymbol(rows: SignalRow[], symbol: string): SignalRow | undefined {
  return rows.find((r) => r.symbol === symbol && !r.error);
}

export function rebalanceAnalysisInputPrice(
  input: AnalysisInput,
  currentPrice: number,
): AnalysisInput {
  return { ...input, currentPrice };
}

export async function refreshLockedPlanMonitorContext(
  symbol: AppTradeSymbol,
  timeframe: AnalysisTimeframe,
  psychologyChecklist: PsychologyChecklistV2,
  btcChange24h: number,
): Promise<{ price: number; analysisInput: AnalysisInput } | null> {
  try {
    const [market, ticker] = await Promise.all([
      fetchAllMarketData(symbol, KLINE_LIMIT, 12, statsPeriodFor(timeframe), '1h', 80),
      fetchTickerPrice(symbol),
    ]);
    const analysisInput = buildAnalysisInputFromMarket({
      symbol,
      currentPrice: ticker.price,
      market,
      psychologyChecklist,
      btc24hChangePct: btcChange24h,
    });
    if (!analysisInput) return null;
    return { price: ticker.price, analysisInput };
  } catch {
    return null;
  }
}

export { getEntryZonePriceStatus };
