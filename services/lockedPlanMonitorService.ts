import type { AnalysisTimeframe, AppTradeSymbol, PsychologyChecklistV2 } from '../constants/scoring';
import type { CvdTrend } from '../constants/aiJournal';
import { analyzeCVD } from './indicators';
import { buildAnalysisInputFromMarket, type AnalysisInput } from './analysisInput';
import { getEntryZonePriceStatus } from './lockedPlanScoring';
import { fetchTickerPrice, type AllMarketData } from './binanceApi';
import type { SignalRow } from './signalBoardScan';
import {
  getFreshScanMarketSnapshot,
  getLastPublishedBtcChange24h,
} from './scanMarketSnapshotStore';

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

/** Pure — build monitor context from an already-fetched market bundle. */
export function buildLockedPlanMonitorContextFromMarket(
  symbol: AppTradeSymbol,
  market: AllMarketData,
  price: number,
  psychologyChecklist: PsychologyChecklistV2,
  btcChange24h: number,
): { price: number; analysisInput: AnalysisInput } | null {
  const analysisInput = buildAnalysisInputFromMarket({
    symbol,
    currentPrice: price,
    market,
    psychologyChecklist,
    btc24hChangePct: btcChange24h,
  });
  if (!analysisInput) return null;
  return { price, analysisInput };
}

/**
 * Prefer Unified scan snapshot. Ticker-only when refreshing price between scans.
 * Does **not** call fetchAllMarketData.
 */
export async function refreshLockedPlanMonitorContext(
  symbol: AppTradeSymbol,
  _timeframe: AnalysisTimeframe,
  psychologyChecklist: PsychologyChecklistV2,
  btcChange24h: number,
  options?: {
    /** When true, always hit ticker API (30s monitor). Default true. */
    fetchTicker?: boolean;
  },
): Promise<{ price: number; analysisInput: AnalysisInput } | null> {
  try {
    const snap = getFreshScanMarketSnapshot(symbol);
    if (snap == null) {
      return null;
    }

    const btc = Number.isFinite(btcChange24h)
      ? btcChange24h
      : snap.btcChange24h || getLastPublishedBtcChange24h();

    const fetchTicker = options?.fetchTicker !== false;
    let price = snap.tickerPrice;
    if (fetchTicker) {
      try {
        const ticker = await fetchTickerPrice(symbol);
        if (ticker.price > 0) price = ticker.price;
      } catch {
        // keep snapshot price
      }
    }

    return buildLockedPlanMonitorContextFromMarket(
      symbol,
      snap.market,
      price,
      psychologyChecklist,
      btc,
    );
  } catch {
    return null;
  }
}

export { getEntryZonePriceStatus };
