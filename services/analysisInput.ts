import type { PsychologyChecklistV2 } from '../constants/scoring';
import type { AllMarketData, Kline } from './binanceApi';
import { buildCVDPointsFromKlines, getADXAnalysis } from './indicators';
import type { ADXAnalysis, CVDPoint } from './indicators';
import { computeAtr1hFromKlines } from './atr1h';
import { calculateVWAP, type VWAPResult } from './vwapService';

export interface AnalysisInput {
  symbol: string;
  currentPrice: number;
  klines1h: Kline[];
  klines4h: Kline[];
  /** Funding rate theo % (vd. 0.01 = 0.01%) */
  fundingRate: number;
  oiCurrent: number;
  oiPrevious: number;
  /** Mảng ratio top trader, cũ → mới */
  topLongShortRatios: number[];
  globalLongShortRatios: number[];
  btc24hChangePct: number;
  cvdPoints: CVDPoint[];
  psychologyChecklist: PsychologyChecklistV2;
  /** % thay đổi giá trong khung phân tích */
  priceChangePct1h: number;
  /** ATR(14) tuyệt đối trên khung 1H — dùng Trade Plan, Grace Period */
  atr1h: number;
  /** ADX 1H + 4H — optional để không break caller cũ */
  adxData?: ADXAnalysis;
  /** VWAP session — optional */
  vwapData?: VWAPResult;
}

function priceChangePct(klines: Kline[], bars = 1): number {
  if (klines.length <= bars) return 0;
  const prev = klines[klines.length - 1 - bars].close;
  const last = klines[klines.length - 1].close;
  if (prev <= 0) return 0;
  return ((last - prev) / prev) * 100;
}

export function buildAnalysisInputFromMarket(params: {
  symbol: string;
  currentPrice: number;
  market: AllMarketData;
  psychologyChecklist: PsychologyChecklistV2;
  btc24hChangePct: number;
}): AnalysisInput | null {
  const klines1h = params.market.klines['1h']?.klines;
  const klines4h = params.market.klines['4h']?.klines;
  if (!klines1h?.length || !klines4h?.length) return null;

  const oiHist = params.market.oiEngine?.history ?? [];
  const oiCurrent =
    oiHist.length > 0 ? oiHist[oiHist.length - 1].sumOpenInterest : 0;
  const oiPrevious =
    oiHist.length > 1 ? oiHist[oiHist.length - 2].sumOpenInterest : oiCurrent;

  const fundingRaw = params.market.fundingHistory?.records.at(-1)?.fundingRate ?? 0;
  const fundingRatePct = fundingRaw * 100;

  const lsHistory = params.market.longShortRatio?.history ?? [];
  const topLongShortRatios = lsHistory.map((p) => p.longShortRatio);

  let adxData: ADXAnalysis | undefined;
  try {
    adxData = getADXAnalysis(klines1h, klines4h);
  } catch {
    adxData = undefined;
  }

  const klines15m = params.market.klines['15m']?.klines;
  const klinesForVwap =
    klines15m != null && klines15m.length > 0 ? klines15m : klines1h;

  let vwapData: VWAPResult | undefined;
  try {
    vwapData = calculateVWAP(klinesForVwap, params.currentPrice) ?? undefined;
  } catch {
    vwapData = undefined;
  }

  return {
    symbol: params.symbol,
    currentPrice: params.currentPrice,
    klines1h,
    klines4h,
    fundingRate: fundingRatePct,
    oiCurrent,
    oiPrevious,
    topLongShortRatios,
    globalLongShortRatios: topLongShortRatios,
    btc24hChangePct: params.btc24hChangePct,
    cvdPoints: buildCVDPointsFromKlines(klines1h),
    psychologyChecklist: params.psychologyChecklist,
    priceChangePct1h: priceChangePct(klines1h, 1),
    atr1h: computeAtr1hFromKlines(klines1h, params.currentPrice),
    adxData,
    vwapData,
  };
}
