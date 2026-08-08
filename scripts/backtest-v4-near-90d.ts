/**
 * Backtest runner V4 — multi-symbol (BTC/SOL/BNB/NEAR), 1 script dùng chung.
 *
 * Entry/decision: scoreAnalysisV4 / canEnterV4 / suggestDirectionV4 (scorerV4.ts)
 * Ambiguity:      resolveDirectionAmbiguity (live) + threshold param cho sweep
 *                 (mirror hysteresis 2-scan; reject khi AMBIGUOUS ≈ applyAmbiguityToSnapshot)
 * SL/TP/plan:      calculateTradePlanV4 (tradePlanV4.ts)
 *
 * CẤM: services/v41/**, backtest-v41-*, runAdvancedBacktest (scorer.ts)
 * CẤM sửa production trong task sweep: không đổi scorerV4 / directionAmbiguity.
 *
 * Usage:
 *   npx tsx scripts/backtest-v4-near-90d.ts --symbol NEAR --days 180
 *   npx tsx scripts/backtest-v4-near-90d.ts --symbol BTC --days 180 --ambiguity-threshold 1.5
 *   npx tsx scripts/backtest-v4-near-90d.ts --days 180 --sweep-ambiguity --symbols BTC,SOL,BNB,NEAR
 *   npx vitest run scripts/backtest-v4-near-90d.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import {
  BINANCE_BASE_URL,
  DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
  LAYER_L5B_ID,
  TRADE_SYMBOLS,
  type AppTradeSymbol,
  type PsychologyChecklistV3,
} from '../constants/scoring';
import type { Kline } from '../services/binanceApi';
import { computeAtr1hFromKlines } from '../services/atr1h';
import {
  resolveDirectionAmbiguity,
  AMBIGUOUS_THRESHOLD,
  type AmbiguityState,
} from '../services/directionAmbiguity';
import { buildCVDPointsFromKlines, getADXAnalysis } from '../services/indicators';
import {
  MARKET_KLINE_LIMIT,
  MARKET_LS_DEPTH,
} from '../services/marketAnalysisFetch';
import {
  buildTodayStatsFromJournalV4,
  canEnterV4,
  fundingMetricsPctFromRecords,
  scoreAnalysisV4,
  suggestDirectionV4,
  type AnalysisInputV4,
  type DirectionalScoreV4,
} from '../services/scorerV4';
import { calculateTradePlanV4 } from '../services/tradePlanV4';

/** Khớp default `limit` của `fetchLongShortRatio` trong binanceApi (live). */
const LIVE_LS_HISTORY_LIMIT = 30;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SYMBOL: AppTradeSymbol = 'NEARUSDT';
const DEFAULT_DAYS = 90;
/** Khớp live `AMBIGUOUS_THRESHOLD` (shared V3+V4, Task 3 = 2.5). */
const DEFAULT_AMBIGUITY_THRESHOLD = AMBIGUOUS_THRESHOLD;
const SWEEP_THRESHOLDS = [1.0, 1.5, 2.0, 2.5, 3.0] as const;

const SYMBOL_ALIASES: Record<string, AppTradeSymbol> = {
  BTC: 'BTCUSDT',
  BTCUSDT: 'BTCUSDT',
  SOL: 'SOLUSDT',
  SOLUSDT: 'SOLUSDT',
  BNB: 'BNBUSDT',
  BNBUSDT: 'BNBUSDT',
  NEAR: 'NEARUSDT',
  NEARUSDT: 'NEARUSDT',
  XRP: 'XRPUSDT',
  XRPUSDT: 'XRPUSDT',
};

function parseSymbol(raw: string): AppTradeSymbol {
  const key = raw.trim().toUpperCase();
  const sym = SYMBOL_ALIASES[key];
  if (!sym) {
    throw new Error(
      `Unknown --symbol ${raw}. Use BTC|SOL|BNB|NEAR|XRP (or *USDT).`,
    );
  }
  return sym;
}

/**
 * Mirror `resolveDirectionAmbiguity` với threshold tùy chọn (sweep).
 * threshold === live AMBIGUOUS_THRESHOLD → gọi đúng production helper.
 * threshold khác → cùng hysteresis 2-scan, chỉ đổi ngưỡng `|Δ| < thr`
 * (không sửa `directionAmbiguity.ts` khi sweep).
 */
export function resolveAmbiguityAtThreshold(
  longScore: number,
  shortScore: number,
  previousState: AmbiguityState | null,
  threshold: number,
): AmbiguityState {
  if (threshold === DEFAULT_AMBIGUITY_THRESHOLD) {
    return resolveDirectionAmbiguity(longScore, shortScore, previousState);
  }
  const scoreDiff = Math.abs(longScore - shortScore);
  const isCurrentlyAmbiguous = scoreDiff < threshold;
  const leaningDirection: 'LONG' | 'SHORT' =
    longScore >= shortScore ? 'LONG' : 'SHORT';
  const msg = (diff: number, lean: 'LONG' | 'SHORT') =>
    `Xu hướng chưa rõ ràng — Long ${longScore.toFixed(1)}đ vs Short ${shortScore.toFixed(1)}đ, ` +
    `chênh lệch ${diff.toFixed(1)}đ, nghiêng nhẹ về ${lean === 'LONG' ? 'Long' : 'Short'}`;

  if (previousState === null) {
    if (isCurrentlyAmbiguous) {
      return {
        status: 'CLEAR',
        scoreDiff,
        leaningDirection,
        consecutiveAmbiguousCount: 1,
        consecutiveClearCount: 0,
        message: '',
      };
    }
    return {
      status: 'CLEAR',
      scoreDiff,
      leaningDirection,
      consecutiveAmbiguousCount: 0,
      consecutiveClearCount: 0,
      message: '',
    };
  }

  if (previousState.status === 'CLEAR') {
    if (isCurrentlyAmbiguous) {
      const consecutiveAmbiguousCount =
        previousState.consecutiveAmbiguousCount + 1;
      const status = consecutiveAmbiguousCount >= 2 ? 'AMBIGUOUS' : 'CLEAR';
      return {
        status,
        scoreDiff,
        leaningDirection,
        consecutiveAmbiguousCount,
        consecutiveClearCount: 0,
        message:
          status === 'AMBIGUOUS' ? msg(scoreDiff, leaningDirection) : '',
      };
    }
    return {
      status: 'CLEAR',
      scoreDiff,
      leaningDirection,
      consecutiveAmbiguousCount: 0,
      consecutiveClearCount: 0,
      message: '',
    };
  }

  if (isCurrentlyAmbiguous) {
    return {
      status: 'AMBIGUOUS',
      scoreDiff,
      leaningDirection,
      consecutiveAmbiguousCount: previousState.consecutiveAmbiguousCount,
      consecutiveClearCount: 0,
      message: msg(scoreDiff, leaningDirection),
    };
  }

  const consecutiveClearCount = previousState.consecutiveClearCount + 1;
  const status = consecutiveClearCount >= 2 ? 'CLEAR' : 'AMBIGUOUS';
  return {
    status,
    scoreDiff,
    leaningDirection,
    consecutiveAmbiguousCount: 0,
    consecutiveClearCount,
    message: status === 'AMBIGUOUS' ? msg(scoreDiff, leaningDirection) : '',
  };
}
const WARMUP_1H = 220;
const FETCH_GAP_MS = 400;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const MAX_HOLD_BARS_FALLBACK = 48;
/** OI/LS coi là "real" nếu điểm gần nhất trong khoảng này. */
const OI_LS_MAX_STALE_MS = 2 * MS_1H;

const FETCH_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'TradeScoreV4Backtest/1.0',
} as const;

async function fetchJson(url: string, retries = 6): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (res.ok) return res;
    if (res.status === 418 || res.status === 429) {
      let waitMs = Math.min(60_000, 5_000 * 2 ** attempt);
      try {
        const body = (await res.json()) as { msg?: string };
        const m = body.msg?.match(/banned until (\d+)/);
        if (m) {
          const until = Number(m[1]);
          if (Number.isFinite(until) && until > Date.now()) {
            waitMs = Math.min(until - Date.now() + 2_000, 15 * 60_000);
          }
        }
        console.warn(
          `[fetch] HTTP ${res.status} — wait ${Math.ceil(waitMs / 1000)}s (attempt ${attempt + 1}/${retries}): ${body.msg ?? ''}`,
        );
      } catch {
        console.warn(`[fetch] HTTP ${res.status} — wait ${Math.ceil(waitMs / 1000)}s`);
      }
      await sleep(waitMs);
      lastErr = new Error(`HTTP ${res.status}`);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw lastErr ?? new Error(`fetch failed for ${url}`);
}

/** Operator checklist giả định “sẵn sàng” cho backtest — documented. */
const PSYCH_V3_READY: PsychologyChecklistV3 = {
  alert: true,
  chartStudied: true,
  noFomo: true,
  slTpReady: true,
  riskAccepted: true,
};

type ExitReason = 'TP' | 'SL' | 'TIMEOUT';

type TradeRow = {
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryIso: string;
  exitIso: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  pnlPct: number;
  resultR: number;
  exitReason: ExitReason;
  decision: string;
  score: number;
  longScore: number;
  shortScore: number;
  scoreDiff: number;
  ambiguityStatus: 'AMBIGUOUS' | 'CLEAR';
  ambiguityThreshold: number;
  groupA: number;
  groupB: number;
  groupC: number;
  primaryRR: number;
  marketMode: string;
  hourVn: number;
  l1: number;
  l2: number;
  l3: number;
  l4: number;
  l5a: number;
  l5b: number;
  l6: number;
  l7: number;
  l8: number;
  l9: number;
  l10: number;
  tradePlanValid: 0 | 1;
  win: 0 | 1;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function adaptBinanceKline(raw: (string | number)[]): Kline {
  return {
    openTime: Number(raw[0]),
    open: parseFloat(String(raw[1])),
    high: parseFloat(String(raw[2])),
    low: parseFloat(String(raw[3])),
    close: parseFloat(String(raw[4])),
    volume: parseFloat(String(raw[5])),
    closeTime: Number(raw[6]),
    quoteVolume: parseFloat(String(raw[7])),
    trades: Number(raw[8]),
    takerBuyVolume: parseFloat(String(raw[9])),
    takerBuyQuoteVolume: parseFloat(String(raw[10])),
  };
}

function filterClosed(klines: Kline[]): Kline[] {
  const cutoff = Date.now() - 1000;
  return klines.filter((k) => k.closeTime < cutoff);
}

async function fetchKlinesPaged(
  symbol: string,
  interval: '1h' | '4h',
  startMs: number,
  endMs: number,
): Promise<Kline[]> {
  const out: Kline[] = [];
  let cursorEnd = endMs;
  while (cursorEnd > startMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    // Không set startTime khi paginate ngược — Binance trả ≤1500 nến trước endTime.
    const res = await fetchJson(url.toString());
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batchRaw = filterClosed(
      (json as (string | number)[][]).map((row) => adaptBinanceKline(row)),
    );
    if (batchRaw.length === 0) break;
    const earliest = Math.min(...batchRaw.map((k) => k.openTime));
    out.push(...batchRaw.filter((k) => k.openTime >= startMs));
    if (earliest <= startMs) break;
    cursorEnd = earliest - 1;
    if (batchRaw.length < 2) break;
  }
  const byOpen = new Map<number, Kline>();
  for (const k of out) byOpen.set(k.openTime, k);
  return [...byOpen.values()].sort((a, b) => a.openTime - b.openTime);
}

async function fetchFundingRecords(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<{ fundingRate: number; fundingTime: number }[]> {
  const out: { fundingRate: number; fundingTime: number }[] = [];
  let cursorStart = startMs;
  while (cursorStart < endMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/fundingRate`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('startTime', String(cursorStart));
    url.searchParams.set('endTime', String(endMs));
    url.searchParams.set('limit', '1000');
    const res = await fetchJson(url.toString());
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = (
      json as { fundingRate: string; fundingTime: number }[]
    ).map((r) => ({
      fundingRate: Number(r.fundingRate),
      fundingTime: Number(r.fundingTime),
    }));
    out.push(...batch);
    const last = batch[batch.length - 1].fundingTime;
    if (batch.length < 2 || last <= cursorStart) break;
    cursorStart = last + 1;
  }
  const byTs = new Map<number, { fundingRate: number; fundingTime: number }>();
  for (const r of out) byTs.set(r.fundingTime, r);
  return [...byTs.values()].sort((a, b) => a.fundingTime - b.fundingTime);
}

type OiPoint = { timestamp: number; sumOpenInterest: number };
type LsPoint = { timestamp: number; longShortRatio: number };

/**
 * Paginate OI hist via endTime until Binance ceiling (~720 pts / ~30d @ 1h).
 * startTime beyond lookback returns -1130 — do not use startTime here.
 */
async function fetchOiHist(symbol: string, limitPerPage = 500): Promise<OiPoint[]> {
  const byTs = new Map<number, OiPoint>();
  let cursorEnd = Date.now();
  for (let page = 0; page < 12; page++) {
    const url = new URL(`${BINANCE_BASE_URL}/futures/data/openInterestHist`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', '1h');
    url.searchParams.set('limit', String(limitPerPage));
    url.searchParams.set('endTime', String(cursorEnd));
    const res = await fetchJson(url.toString());
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = (json as { timestamp: number; sumOpenInterest: string }[])
      .map((p) => ({
        timestamp: Number(p.timestamp),
        sumOpenInterest: Number(p.sumOpenInterest),
      }))
      .filter((p) => Number.isFinite(p.sumOpenInterest));
    for (const p of batch) byTs.set(p.timestamp, p);
    const earliest = Math.min(...batch.map((p) => p.timestamp));
    if (earliest >= cursorEnd) break;
    cursorEnd = earliest - 1;
    if (batch.length < 2) break;
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** Paginate L/S hist — same ~30d Binance ceiling as OI. */
async function fetchLsHist(symbol: string, limitPerPage = 500): Promise<LsPoint[]> {
  const byTs = new Map<number, LsPoint>();
  let cursorEnd = Date.now();
  for (let page = 0; page < 12; page++) {
    const url = new URL(
      `${BINANCE_BASE_URL}/futures/data/topLongShortAccountRatio`,
    );
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', '1h');
    url.searchParams.set('limit', String(limitPerPage));
    url.searchParams.set('endTime', String(cursorEnd));
    const res = await fetchJson(url.toString());
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = (json as { timestamp: string; longShortRatio: string }[])
      .map((p) => ({
        timestamp: Number(p.timestamp),
        longShortRatio: Number(p.longShortRatio),
      }))
      .filter((p) => Number.isFinite(p.longShortRatio) && p.longShortRatio > 0);
    for (const p of batch) byTs.set(p.timestamp, p);
    const earliest = Math.min(...batch.map((p) => p.timestamp));
    if (earliest >= cursorEnd) break;
    cursorEnd = earliest - 1;
    if (batch.length < 2) break;
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function sliceUpTo(klines: Kline[], openTime: number): Kline[] {
  return klines.filter((k) => k.openTime <= openTime);
}

export function hourVnFromMs(ms: number): number {
  const d = new Date(ms);
  const utc = d.getUTCHours() + d.getUTCMinutes() / 60;
  let vn = utc + 7;
  if (vn >= 24) vn -= 24;
  if (vn < 0) vn += 24;
  return vn;
}

function lookupNearestBefore<T extends { timestamp: number }>(
  series: T[],
  ts: number,
): T | null {
  if (series.length === 0) return null;
  let best: T | null = null;
  for (const p of series) {
    if (p.timestamp <= ts) best = p;
    else break;
  }
  return best;
}

function fundingUpTo(
  records: { fundingRate: number; fundingTime: number }[],
  ts: number,
): { fundingRate: number; fundingTime: number }[] {
  return records.filter((r) => r.fundingTime <= ts);
}

/** Mock Date.now / new Date() theo simMs — để L9 + plan expiry dùng giờ lịch sử. */
export function withSimulatedNow<T>(simMs: number, fn: () => T): T {
  const OriginalDate = globalThis.Date;
  function MockDate(this: Date, ...args: unknown[]) {
    if (args.length === 0) {
      return new OriginalDate(simMs);
    }
    if (args.length === 1) {
      return new OriginalDate(args[0] as string | number | Date);
    }
    return new OriginalDate(
      args[0] as number,
      args[1] as number,
      args[2] as number | undefined,
      args[3] as number | undefined,
      args[4] as number | undefined,
      args[5] as number | undefined,
      args[6] as number | undefined,
    );
  }
  MockDate.now = () => simMs;
  MockDate.parse = OriginalDate.parse;
  MockDate.UTC = OriginalDate.UTC;
  MockDate.prototype = OriginalDate.prototype;
  const g = globalThis as { Date: DateConstructor };
  const prev = g.Date;
  g.Date = MockDate as unknown as DateConstructor;
  try {
    return fn();
  } finally {
    g.Date = prev;
  }
}

export function buildInput(params: {
  symbol: AppTradeSymbol;
  near1h: Kline[];
  near4h: Kline[];
  btc1h: Kline[];
  fundingRecords: { fundingRate: number; fundingTime: number }[];
  oiHist: OiPoint[];
  lsHist: LsPoint[];
  openTime: number;
}): AnalysisInputV4 {
  const {
    symbol,
    near1h,
    near4h,
    btc1h,
    fundingRecords,
    oiHist,
    lsHist,
    openTime,
  } = params;
  const price = near1h[near1h.length - 1].close;
  /** Live `fetchMarketAnalysisBundle` → fundingLimit = MARKET_LS_DEPTH. */
  const fundUpToAll = fundingUpTo(fundingRecords, openTime);
  const fundUpTo =
    fundUpToAll.length > MARKET_LS_DEPTH
      ? fundUpToAll.slice(-MARKET_LS_DEPTH)
      : fundUpToAll;
  const lastFund = fundUpTo[fundUpTo.length - 1];
  const fundingRatePct = lastFund ? lastFund.fundingRate * 100 : 0;

  const oiNow = lookupNearestBefore(oiHist, openTime);
  const oiPrev = oiNow
    ? lookupNearestBefore(oiHist, oiNow.timestamp - 1)
    : null;
  const lsUpToAll = lsHist.filter((p) => p.timestamp <= openTime);
  const lsUpTo =
    lsUpToAll.length > LIVE_LS_HISTORY_LIMIT
      ? lsUpToAll.slice(-LIVE_LS_HISTORY_LIMIT)
      : lsUpToAll;
  const ratios = lsUpTo.map((p) => p.longShortRatio);

  const btcSliceAll = sliceUpTo(btc1h, openTime);
  const btcSlice =
    btcSliceAll.length > MARKET_KLINE_LIMIT
      ? btcSliceAll.slice(-MARKET_KLINE_LIMIT)
      : btcSliceAll;
  let btc24h = 0;
  if (btcSliceAll.length > 24) {
    const a = btcSliceAll[btcSliceAll.length - 25].close;
    const b = btcSliceAll[btcSliceAll.length - 1].close;
    if (a > 0) btc24h = ((b - a) / a) * 100;
  }

  let adxData;
  try {
    adxData = getADXAnalysis(near1h, near4h);
  } catch {
    adxData = undefined;
  }

  const priceChangePct1h =
    near1h.length > 1
      ? ((near1h[near1h.length - 1].close - near1h[near1h.length - 2].close) /
          near1h[near1h.length - 2].close) *
        100
      : 0;
  const priceChange4h =
    near4h.length > 1
      ? ((near4h[near4h.length - 1].close - near4h[near4h.length - 2].close) /
          near4h[near4h.length - 2].close) *
        100
      : 0;

  const oiCurrent = oiNow?.sumOpenInterest ?? 0;
  const oiPrevious = oiPrev?.sumOpenInterest ?? oiCurrent;
  const oiChange1h =
    oiCurrent > 0 && oiPrevious > 0
      ? ((oiCurrent - oiPrevious) / oiPrevious) * 100
      : 0;
  const oi4hRef = lookupNearestBefore(oiHist, openTime - 4 * MS_1H);
  const oiChange4h =
    oiCurrent > 0 && oi4hRef && oi4hRef.sumOpenInterest > 0
      ? ((oiCurrent - oi4hRef.sumOpenInterest) / oi4hRef.sumOpenInterest) * 100
      : 0;

  // CVD: rolling window giống live (MARKET_KLINE_LIMIT). Không cắt near1h/near4h
  // dùng cho EMA/MACD/ADX — giữ full history tới bar hiện tại cho warmup.
  const cvdKlines1h =
    near1h.length > MARKET_KLINE_LIMIT
      ? near1h.slice(-MARKET_KLINE_LIMIT)
      : near1h;

  return {
    symbol,
    currentPrice: price,
    klines1h: near1h,
    klines4h: near4h,
    fundingRate: fundingRatePct,
    oiCurrent,
    oiPrevious,
    topLongShortRatios: ratios.length > 0 ? ratios : [1],
    globalLongShortRatios: ratios.length > 0 ? ratios : [1],
    btc24hChangePct: btc24h,
    cvdPoints: buildCVDPointsFromKlines(cvdKlines1h),
    psychologyChecklist: {
      ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
      alert: true,
      noLossStreak: true,
      dailyLossOk: true,
      noFomo: true,
      slTpReady: true,
    },
    psychologyChecklistV3: PSYCH_V3_READY,
    priceChangePct1h,
    atr1h: computeAtr1hFromKlines(near1h, price),
    adxData,
    btcKlines1h: btcSlice,
    fundingHistory: fundUpTo.map((r) => ({
      rate: r.fundingRate * 100,
      timestamp: r.fundingTime,
    })),
    fundingMetrics: fundingMetricsPctFromRecords(fundUpTo),
    whaleWalls: { bidWalls: [], askWalls: [] },
    recentJournal: [],
    oiChange1h,
    oiChange4h,
    priceChange4h,
  };
}

function layerScore(d: DirectionalScoreV4, n: number): number {
  return d.rawLayerScores[n] ?? 0;
}

export function simulateExit(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  sl: number;
  tp: number;
  bars: Kline[];
  maxHoldBars: number;
}): {
  exitPrice: number;
  exitTime: number;
  exitReason: ExitReason;
  barsHeld: number;
} {
  const { side, entryPrice, sl, tp, bars, maxHoldBars } = params;
  const n = Math.min(bars.length, maxHoldBars);
  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const hitSl =
      side === 'LONG' ? bar.low <= sl : bar.high >= sl;
    const hitTp =
      side === 'LONG' ? bar.high >= tp : bar.low <= tp;
    // Worst-case same bar → SL
    if (hitSl && hitTp) {
      return {
        exitPrice: sl,
        exitTime: bar.openTime,
        exitReason: 'SL',
        barsHeld: i + 1,
      };
    }
    if (hitSl) {
      return {
        exitPrice: sl,
        exitTime: bar.openTime,
        exitReason: 'SL',
        barsHeld: i + 1,
      };
    }
    if (hitTp) {
      return {
        exitPrice: tp,
        exitTime: bar.openTime,
        exitReason: 'TP',
        barsHeld: i + 1,
      };
    }
  }
  const last = bars[Math.min(n, bars.length) - 1] ?? bars[0];
  return {
    exitPrice: last.close,
    exitTime: last.openTime,
    exitReason: 'TIMEOUT',
    barsHeld: Math.min(n, bars.length),
  };
}

export function pnlPct(
  side: 'LONG' | 'SHORT',
  entry: number,
  exit: number,
): number {
  if (entry <= 0) return 0;
  return side === 'LONG'
    ? ((exit - entry) / entry) * 100
    : ((entry - exit) / entry) * 100;
}

export function resultR(
  side: 'LONG' | 'SHORT',
  entry: number,
  exit: number,
  sl: number,
): number {
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return 0;
  const move =
    side === 'LONG' ? exit - entry : entry - exit;
  return move / risk;
}

type Stats = {
  n: number;
  wins: number;
  losses: number;
  wr: number;
  avgR: number;
  sumR: number;
  pf: number;
  maxDdR: number;
  expectancyR: number;
};

function computeStats(rows: TradeRow[]): Stats {
  const n = rows.length;
  if (n === 0) {
    return {
      n: 0,
      wins: 0,
      losses: 0,
      wr: 0,
      avgR: 0,
      sumR: 0,
      pf: 0,
      maxDdR: 0,
      expectancyR: 0,
    };
  }
  const wins = rows.filter((r) => r.win === 1).length;
  const losses = n - wins;
  let sumWinR = 0;
  let sumLossR = 0;
  let sumR = 0;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const r of rows) {
    sumR += r.resultR;
    if (r.resultR >= 0) sumWinR += r.resultR;
    else sumLossR += Math.abs(r.resultR);
    equity += r.resultR;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  return {
    n,
    wins,
    losses,
    wr: (wins / n) * 100,
    avgR: sumR / n,
    sumR,
    pf: sumLossR > 0 ? sumWinR / sumLossR : sumWinR > 0 ? Infinity : 0,
    maxDdR: maxDd,
    expectancyR: sumR / n,
  };
}

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '∞';
  return n.toFixed(d);
}

function writeCsv(outPath: string, rows: TradeRow[]): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    'symbol',
    'entryTime',
    'exitTime',
    'entryIso',
    'exitIso',
    'side',
    'entryPrice',
    'exitPrice',
    'sl',
    'tp1',
    'tp2',
    'tp3',
    'pnlPct',
    'resultR',
    'exitReason',
    'decision',
    'score',
    'longScore',
    'shortScore',
    'scoreDiff',
    'ambiguityStatus',
    'ambiguityThreshold',
    'groupA',
    'groupB',
    'groupC',
    'primaryRR',
    'marketMode',
    'hourVn',
    'l1',
    'l2',
    'l3',
    'l4',
    'l5a',
    'l5b',
    'l6',
    'l7',
    'l8',
    'l9',
    'l10',
    'tradePlanValid',
    'win',
  ];
  const lines = rows.map((r) =>
    [
      r.symbol,
      r.entryTime,
      r.exitTime,
      r.entryIso,
      r.exitIso,
      r.side,
      r.entryPrice,
      r.exitPrice,
      r.sl,
      r.tp1,
      r.tp2,
      r.tp3,
      r.pnlPct,
      r.resultR,
      r.exitReason,
      r.decision,
      r.score,
      r.longScore,
      r.shortScore,
      r.scoreDiff,
      r.ambiguityStatus,
      r.ambiguityThreshold,
      r.groupA,
      r.groupB,
      r.groupC,
      r.primaryRR,
      r.marketMode,
      r.hourVn,
      r.l1,
      r.l2,
      r.l3,
      r.l4,
      r.l5a,
      r.l5b,
      r.l6,
      r.l7,
      r.l8,
      r.l9,
      r.l10,
      r.tradePlanValid,
      r.win,
    ].join(','),
  );
  fs.writeFileSync(outPath, [header.join(','), ...lines, ''].join('\n'), 'utf8');
}

function analyzeAndWriteMd(
  mdPath: string,
  rows: TradeRow[],
  meta: Record<string, string | number>,
): void {
  const baseline = computeStats(rows);
  const symbolLabel =
    rows[0]?.symbol ?? String(meta.symbol ?? DEFAULT_SYMBOL);

  type Proposal = {
    id: string;
    name: string;
    filter: (r: TradeRow) => boolean;
    note: string;
  };

  const proposals: Proposal[] = [
    {
      id: 'A',
      name: 'Baseline V4 (canEnter + tradePlanValid)',
      filter: () => true,
      note: 'Rule gốc — không thêm filter',
    },
    {
      id: 'B',
      name: 'Chỉ VAO_TU_TIN / SETUP_NGON (score≥10)',
      filter: (r) => r.decision === 'VAO_TU_TIN' || r.decision === 'SETUP_NGON',
      note: 'Siết ngưỡng decision (bỏ CO_THE_VAO)',
    },
    {
      id: 'C',
      name: 'Group B ≥ 3.5 (flow mạnh)',
      filter: (r) => r.groupB >= 3.5,
      note: 'Filter theo nhóm dòng tiền',
    },
    {
      id: 'D',
      name: 'Phiên VN 8h–16h (Asia/EU overlap sớm)',
      filter: (r) => r.hourVn >= 8 && r.hourVn < 16,
      note: 'Session filter theo hourVn tại entry',
    },
    {
      id: 'E',
      name: 'VAO_TU_TIN+ & GroupB≥3.5',
      filter: (r) =>
        (r.decision === 'VAO_TU_TIN' || r.decision === 'SETUP_NGON') &&
        r.groupB >= 3.5,
      note: 'Kết hợp ngưỡng score + flow',
    },
    {
      id: 'F',
      name: 'Chỉ LONG',
      filter: (r) => r.side === 'LONG',
      note: 'Lọc hướng',
    },
    {
      id: 'G',
      name: 'Chỉ SHORT',
      filter: (r) => r.side === 'SHORT',
      note: 'Lọc hướng',
    },
    {
      id: 'H',
      name: 'TRENDING marketMode',
      filter: (r) => r.marketMode === 'TRENDING',
      note: 'Chỉ khi Bollinger mode TRENDING',
    },
  ];

  // Auto-discover best single layer threshold for WR≥70 if possible
  const layerKeys = [
    'l1',
    'l2',
    'l3',
    'l4',
    'l5a',
    'l5b',
    'l6',
    'l7',
    'l8',
    'l9',
    'l10',
  ] as const;

  const extraRows: Array<{
    name: string;
    stats: Stats;
    note: string;
    overfit: string;
  }> = [];

  for (const prop of proposals) {
    const filtered = rows.filter(prop.filter);
    const stats = computeStats(filtered);
    const overfit =
      stats.n < 20
        ? 'CAO — n<20'
        : stats.n < 30
          ? 'TRUNG BÌNH — n<30'
          : 'THẤP HƠN (n≥30, vẫn chỉ 90d)';
    extraRows.push({
      name: `[${prop.id}] ${prop.name}`,
      stats,
      note: prop.note,
      overfit,
    });
  }

  // Greedy: try score >= thresholds
  for (const thr of [9, 9.5, 10, 10.5, 11, 11.5]) {
    const filtered = rows.filter((r) => r.score >= thr);
    const stats = computeStats(filtered);
    extraRows.push({
      name: `score ≥ ${thr}`,
      stats,
      note: 'Siết official/reference score',
      overfit:
        stats.n < 20 ? 'CAO — n<20' : stats.n < 30 ? 'TRUNG BÌNH — n<30' : 'THẤP HƠN',
    });
  }

  for (const lk of layerKeys) {
    for (const thr of [1, 1.5, 2]) {
      const filtered = rows.filter((r) => r[lk] >= thr);
      const stats = computeStats(filtered);
      if (stats.n >= 5 && stats.wr >= 70) {
        extraRows.push({
          name: `${lk} ≥ ${thr}`,
          stats,
          note: 'Filter layer auto (WR≥70 trên mẫu)',
          overfit:
            stats.n < 20
              ? 'CAO — n<20, nghi overfit'
              : stats.n < 30
                ? 'TRUNG BÌNH'
                : 'THẤP HƠN',
        });
      }
    }
  }

  const ge70 = extraRows.filter((r) => r.stats.wr >= 70 && r.stats.n > 0);
  ge70.sort((a, b) => b.stats.n - a.stats.n);

  const lines: string[] = [];
  lines.push(`# ${symbolLabel} V4 rule comparison — backtest`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Symbol:** ${symbolLabel}`);
  lines.push(`**Engine:** scorerV4 + tradePlanV4 only (no V3, no V4.1)`);
  lines.push(
    `**Timeframe:** clock=1h; inputs=1h+4h (bắt buộc bởi scorerV4/tradePlanV4)`,
  );
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('## Baseline');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| n | ${baseline.n} |`);
  lines.push(`| Wins / Losses | ${baseline.wins} / ${baseline.losses} |`);
  lines.push(`| Winrate | ${fmt(baseline.wr)}% |`);
  lines.push(`| Avg R | ${fmt(baseline.avgR)} |`);
  lines.push(`| Sum R | ${fmt(baseline.sumR)} |`);
  lines.push(`| Profit factor | ${fmt(baseline.pf)} |`);
  lines.push(`| Expectancy (R) | ${fmt(baseline.expectancyR)} |`);
  lines.push(`| Max DD (R) | ${fmt(baseline.maxDdR)} |`);
  lines.push('');
  lines.push('## Filter / rule proposals');
  lines.push('');
  lines.push(
    '| Proposal | n | WR% | PF | Expectancy R | MaxDD R | Overfit risk | Note |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---|---|');
  for (const row of extraRows) {
    const s = row.stats;
    lines.push(
      `| ${row.name} | ${s.n} | ${fmt(s.wr)} | ${fmt(s.pf)} | ${fmt(s.expectancyR)} | ${fmt(s.maxDdR)} | ${row.overfit} | ${row.note} |`,
    );
  }
  lines.push('');
  lines.push('## Kết luận ≥70% WR');
  lines.push('');
  if (ge70.length === 0) {
    lines.push(
      '- **Không có** phương án nào đạt WR ≥ 70% trên mẫu 90d này (hoặc chỉ đạt khi n=0).',
    );
    lines.push(
      '- Không khuyến nghị tối ưu thêm trên đúng 90d — dễ overfit; cần 180–365d nếu muốn xác nhận.',
    );
  } else {
    lines.push('Các phương án đạt WR ≥ 70% (sắp xếp theo n giảm dần):');
    lines.push('');
    for (const row of ge70.slice(0, 10)) {
      lines.push(
        `- **${row.name}**: n=${row.stats.n}, WR=${fmt(row.stats.wr)}%, PF=${fmt(row.stats.pf)}, overfit=${row.overfit}`,
      );
    }
    const bestReliable = ge70.find((r) => r.stats.n >= 30);
    if (bestReliable) {
      lines.push('');
      lines.push(
        `Phương án đáng tin hơn cả (n≥30): **${bestReliable.name}** — n=${bestReliable.stats.n}, WR=${fmt(bestReliable.stats.wr)}%.`,
      );
    } else {
      lines.push('');
      lines.push(
        '⚠️ Tất cả phương án ≥70% đều có **n < 30** — **không đủ tin cậy thống kê**; cần test 180–365 ngày trước khi dùng live.',
      );
    }
  }
  lines.push('');
  lines.push('## Assumptions / limitations');
  lines.push('');
  lines.push(
    '- Psychology L10: checklist 5/5 giả định operator ready (không mô phỏng tâm lý thật).',
  );
  lines.push(
    '- Whale walls rỗng (không có orderbook lịch sử) — L7 thiếu wall confirmation.',
  );
  lines.push(
    '- OI / L/S hist Binance ~30 ngày — phần đầu cửa sổ 90d thiếu OI/LS (fallback 0 / ratio=1).',
  );
  lines.push(
    '- Exit: TP1 vs SL trên nến 1h; same-bar → SL; timeout theo plan expiryHours (fallback 48 bars).',
  );
  lines.push(
    '- L9 session: Date mocked theo openTime nến (getSessionScoreV3 vốn đọc wall-clock).',
  );
  lines.push('- Không import / không đọc bất kỳ module v4.1.');
  lines.push('');

  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
}

export type V4BacktestOptions = {
  symbol: AppTradeSymbol;
  days: number;
  ambiguityThreshold?: number;
  /** Skip MD rule-comparison (sweep). */
  skipMd?: boolean;
  csvOut?: string;
  mdOut?: string;
};

export type MarketBundle = {
  symbol: AppTradeSymbol;
  days: number;
  endMs: number;
  windowStartMs: number;
  sym1h: Kline[];
  sym4h: Kline[];
  btc1h: Kline[];
  fundingRecords: { fundingRate: number; fundingTime: number }[];
  oiHist: OiPoint[];
  lsHist: LsPoint[];
};

export type BarEvalCache = {
  barIndex: number;
  openTime: number;
  direction: 'LONG' | 'SHORT';
  longScore: number;
  shortScore: number;
  canEnterRaw: boolean;
  active: DirectionalScoreV4;
  plan: ReturnType<typeof calculateTradePlanV4> | null;
};

function shortName(symbol: AppTradeSymbol): string {
  return symbol.replace(/USDT$/, '');
}

function thrTag(thr: number): string {
  return String(thr).replace('.', 'p');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let days = DEFAULT_DAYS;
  let csvOut = '';
  let mdOut = '';
  let symbol = DEFAULT_SYMBOL;
  let ambiguityThreshold = DEFAULT_AMBIGUITY_THRESHOLD;
  let sweep = false;
  let symbols: AppTradeSymbol[] = [];
  let outDir = '';
  let skipMd = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--days') days = Math.max(1, Number(args[++i] ?? DEFAULT_DAYS));
    else if (a === '--csv') csvOut = path.resolve(args[++i] ?? '');
    else if (a === '--md') mdOut = path.resolve(args[++i] ?? '');
    else if (a === '--symbol') symbol = parseSymbol(args[++i] ?? '');
    else if (a === '--ambiguity-threshold') {
      ambiguityThreshold = Number(args[++i] ?? DEFAULT_AMBIGUITY_THRESHOLD);
      if (!Number.isFinite(ambiguityThreshold) || ambiguityThreshold < 0) {
        throw new Error('Invalid --ambiguity-threshold');
      }
    } else if (a === '--sweep-ambiguity') sweep = true;
    else if (a === '--symbols') {
      const raw = args[++i] ?? '';
      symbols = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(parseSymbol);
    } else if (a === '--out-dir') outDir = path.resolve(args[++i] ?? '');
    else if (a === '--skip-md') skipMd = true;
  }

  if (sweep) {
    if (symbols.length === 0) {
      symbols = [...TRADE_SYMBOLS];
    }
    if (!outDir) {
      outDir = path.resolve(
        __dirname,
        `../docs/exports/ambiguity-sweep-${days}d`,
      );
    }
    await runAmbiguitySweep({
      symbols,
      days,
      outDir,
      thresholds: [...SWEEP_THRESHOLDS],
    });
    return;
  }

  if (!csvOut) {
    csvOut = path.resolve(
      __dirname,
      `../docs/exports/${shortName(symbol).toLowerCase()}_backtest_${days}d_amb${thrTag(ambiguityThreshold)}.csv`,
    );
  }
  if (!mdOut) {
    mdOut = path.resolve(
      __dirname,
      `../docs/exports/${shortName(symbol).toLowerCase()}_rule_comparison_${days}d_amb${thrTag(ambiguityThreshold)}.md`,
    );
  }

  const result = await runV4Backtest({
    symbol,
    days,
    ambiguityThreshold,
    skipMd,
    csvOut,
    mdOut,
  });
  writeCsv(csvOut, result.trades);
  const baseline = computeStats(result.trades);
  console.log('\n=== Baseline V4 ===');
  console.log(
    `symbol=${symbol} ambThr=${ambiguityThreshold} barsChecked=${result.meta.barsChecked} canEnterTicks=${result.meta.canEnterTicks} trades=${baseline.n}`,
  );
  console.log(
    `WR=${fmt(baseline.wr)}% wins=${baseline.wins} losses=${baseline.losses} PF=${fmt(baseline.pf)} avgR=${fmt(baseline.avgR)} EV=${fmt(baseline.expectancyR)} maxDdR=${fmt(baseline.maxDdR)}`,
  );
  console.log(
    `OI real bars: ${result.meta.oiRealBars}/${result.meta.barsChecked} (${fmt(result.meta.oiRealPct)}%) | LS real: ${result.meta.lsRealBars}/${result.meta.barsChecked} (${fmt(result.meta.lsRealPct)}%)`,
  );
  console.log(
    `Klines window: 1h=${result.meta.near1hBars} 4h=${result.meta.near4hBars} | spanDays≈${fmt(result.meta.spanDaysActual, 1)}`,
  );

  if (!skipMd) {
    analyzeAndWriteMd(mdOut, result.trades, {
      csv: csvOut,
      days,
      symbol,
      ambiguity_threshold: ambiguityThreshold,
      oi_points: result.meta.oiPoints,
      ls_points: result.meta.lsPoints,
      funding_points: result.meta.fundingPoints,
      bars_checked: result.meta.barsChecked,
      can_enter_ticks: result.meta.canEnterTicks,
      oi_real_pct: fmt(result.meta.oiRealPct),
      ls_real_pct: fmt(result.meta.lsRealPct),
      near_1h_bars: result.meta.near1hBars,
      near_4h_bars: result.meta.near4hBars,
    });
    console.log(`Wrote MD:  ${mdOut}`);
  }

  console.log(`\nWrote CSV: ${csvOut}`);
}

export type SweepRow = {
  symbol: AppTradeSymbol;
  threshold: number;
  n: number;
  nPerMonth: number;
  wr: number;
  ev: number;
  longN: number;
  longWr: number;
  longEv: number;
  shortN: number;
  shortWr: number;
  shortEv: number;
  pctLostVs1: number | null;
  isN: number;
  isWr: number;
  isEv: number;
  oosN: number;
  oosWr: number;
  oosEv: number;
};

function sideStats(rows: TradeRow[], side: 'LONG' | 'SHORT'): Stats {
  return computeStats(rows.filter((r) => r.side === side));
}

function splitIsOos(rows: TradeRow[], isFrac = 120 / 180): {
  is: TradeRow[];
  oos: TradeRow[];
} {
  if (rows.length === 0) return { is: [], oos: [] };
  const times = rows.map((r) => r.entryTime);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const cut = t0 + (t1 - t0) * isFrac;
  return {
    is: rows.filter((r) => r.entryTime < cut),
    oos: rows.filter((r) => r.entryTime >= cut),
  };
}

export async function runAmbiguitySweep(params: {
  symbols: AppTradeSymbol[];
  days: number;
  outDir: string;
  thresholds: number[];
}): Promise<void> {
  const { symbols, days, outDir, thresholds } = params;
  fs.mkdirSync(outDir, { recursive: true });
  const summary: SweepRow[] = [];

  for (const symbol of symbols) {
    console.log(`\n######## LOAD ${symbol} ${days}d ########`);
    const bundle = await loadMarketBundle(symbol, days);
    const cache = buildBarEvalCache(bundle);
    console.log(
      `[cache] ${symbol}: scoredBars=${cache.length} (reuse for ${thresholds.length} thresholds)`,
    );

    const byThr = new Map<number, TradeRow[]>();
    for (const thr of thresholds) {
      const result = simulateFromCache(bundle, cache, thr);
      byThr.set(thr, result.trades);
      const csvPath = path.join(
        outDir,
        `${shortName(symbol).toLowerCase()}_180d_amb${thrTag(thr)}.csv`,
      );
      writeCsv(csvPath, result.trades);
      console.log(
        `[${symbol} thr=${thr}] n=${result.trades.length} → ${csvPath}`,
      );
    }

    const base = byThr.get(1.0) ?? [];
    const baseN = base.length;

    for (const thr of thresholds) {
      const trades = byThr.get(thr) ?? [];
      const all = computeStats(trades);
      const L = sideStats(trades, 'LONG');
      const S = sideStats(trades, 'SHORT');
      const { is, oos } = splitIsOos(trades);
      const isS = computeStats(is);
      const oosS = computeStats(oos);
      const months = days / 30;
      summary.push({
        symbol,
        threshold: thr,
        n: all.n,
        nPerMonth: months > 0 ? all.n / months : 0,
        wr: all.wr,
        ev: all.expectancyR,
        longN: L.n,
        longWr: L.wr,
        longEv: L.expectancyR,
        shortN: S.n,
        shortWr: S.wr,
        shortEv: S.expectancyR,
        pctLostVs1:
          thr === 1.0
            ? 0
            : baseN === 0
              ? null
              : ((baseN - all.n) / baseN) * 100,
        isN: isS.n,
        isWr: isS.wr,
        isEv: isS.expectancyR,
        oosN: oosS.n,
        oosWr: oosS.wr,
        oosEv: oosS.expectancyR,
      });
    }
  }

  const summaryCsv = path.join(outDir, 'SWEEP_SUMMARY.csv');
  const sumHeader = [
    'symbol',
    'threshold',
    'n',
    'nPerMonth',
    'wr',
    'ev',
    'longN',
    'longWr',
    'longEv',
    'shortN',
    'shortWr',
    'shortEv',
    'pctLostVs1',
    'isN',
    'isWr',
    'isEv',
    'oosN',
    'oosWr',
    'oosEv',
  ];
  const sumLines = summary.map((r) =>
    [
      r.symbol,
      r.threshold,
      r.n,
      +r.nPerMonth.toFixed(2),
      +r.wr.toFixed(2),
      +r.ev.toFixed(4),
      r.longN,
      +r.longWr.toFixed(2),
      +r.longEv.toFixed(4),
      r.shortN,
      +r.shortWr.toFixed(2),
      +r.shortEv.toFixed(4),
      r.pctLostVs1 == null ? '' : +r.pctLostVs1.toFixed(2),
      r.isN,
      +r.isWr.toFixed(2),
      +r.isEv.toFixed(4),
      r.oosN,
      +r.oosWr.toFixed(2),
      +r.oosEv.toFixed(4),
    ].join(','),
  );
  fs.writeFileSync(
    summaryCsv,
    [sumHeader.join(','), ...sumLines, ''].join('\n'),
    'utf8',
  );

  const mdPath = path.join(outDir, 'REPORT_AMBIGUITY_SWEEP.md');
  writeSweepReportMd(mdPath, summary, days, thresholds);
  console.log(`\nWrote summary CSV: ${summaryCsv}`);
  console.log(`Wrote report MD: ${mdPath}`);
}

function writeSweepReportMd(
  mdPath: string,
  summary: SweepRow[],
  days: number,
  thresholds: number[],
): void {
  const lines: string[] = [];
  lines.push('# V4 Ambiguity threshold sweep — Task 2/3 Part A');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Days:** ${days}`);
  lines.push(`**Thresholds:** ${thresholds.join(', ')}`);
  lines.push(
    '**NEAR baseline:** scorerV4 live gates including S1 (NEAR SHORT L3≥1.5) — no pre-S1 runner.',
  );
  lines.push(
    '**Ambiguity:** hysteresis 2-scan; thr=1.0 uses production `resolveDirectionAmbiguity`; other thr mirror same logic.',
  );
  lines.push(
    '**EV:** mean `resultR` (expectancy R). **% mất:** `(n@1.0 − n@thr) / n@1.0`.',
  );
  lines.push('');
  lines.push('## Sweep table');
  lines.push('');
  lines.push(
    '| Coin | Thr | n | n/tháng | WR% | EV | LONG n/WR/EV | SHORT n/WR/EV | % mất vs 1.0 |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---|---|---:|');
  for (const r of summary) {
    lines.push(
      `| ${r.symbol} | ${r.threshold} | ${r.n} | ${fmt(r.nPerMonth)} | ${fmt(r.wr)} | ${fmt(r.ev, 4)} | ${r.longN}/${fmt(r.longWr)}/${fmt(r.longEv, 4)} | ${r.shortN}/${fmt(r.shortWr)}/${fmt(r.shortEv, 4)} | ${r.pctLostVs1 == null ? '—' : fmt(r.pctLostVs1)} |`,
    );
  }
  lines.push('');
  lines.push('## IS/OOS (120d/60d by trade time) — every thr');
  lines.push('');
  lines.push('| Coin | Thr | IS n/WR/EV | OOS n/WR/EV |');
  lines.push('|---|---:|---|---|');
  for (const r of summary) {
    lines.push(
      `| ${r.symbol} | ${r.threshold} | ${r.isN}/${fmt(r.isWr)}/${fmt(r.isEv, 4)} | ${r.oosN}/${fmt(r.oosWr)}/${fmt(r.oosEv, 4)} |`,
    );
  }
  lines.push('');
  lines.push('## Best thr per coin (heuristic)');
  lines.push('');
  lines.push(
    'Pick among thr with n≥20: maximize EV, require OOS WR not collapse (>IS WR − 15pp); else note thin sample.',
  );
  lines.push('');
  for (const sym of [...new Set(summary.map((s) => s.symbol))]) {
    const rows = summary.filter((s) => s.symbol === sym);
    const candidates = rows.filter((r) => r.n >= 20);
    let best = candidates[0] ?? rows[0];
    for (const r of candidates) {
      const oosOk = r.oosN < 5 || r.oosWr >= r.isWr - 15;
      const bestOosOk = best.oosN < 5 || best.oosWr >= best.isWr - 15;
      if (!oosOk) continue;
      if (!bestOosOk || r.ev > best.ev) best = r;
    }
    lines.push(
      `- **${sym}:** thr=${best.threshold} — n=${best.n}, WR=${fmt(best.wr)}%, EV=${fmt(best.ev, 4)}, OOS WR=${fmt(best.oosWr)}% (n=${best.oosN}), %mất vs 1.0=${best.pctLostVs1 == null ? '—' : fmt(best.pctLostVs1)}`,
    );
  }
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
}

export type BacktestMeta = {
  daysRequested: number;
  spanDaysActual: number;
  near1hBars: number;
  near4hBars: number;
  btc1hBars: number;
  fundingPoints: number;
  oiPoints: number;
  lsPoints: number;
  barsChecked: number;
  canEnterTicks: number;
  oiRealBars: number;
  lsRealBars: number;
  oiRealPct: number;
  lsRealPct: number;
  windowStartMs: number;
  windowEndMs: number;
  symbol: AppTradeSymbol;
  ambiguityThreshold: number;
};

export type BacktestRunResult = {
  trades: TradeRow[];
  meta: BacktestMeta;
};

function hasFreshPoint(
  series: { timestamp: number }[],
  ts: number,
  maxStaleMs: number,
): boolean {
  const p = lookupNearestBefore(series, ts);
  if (!p) return false;
  return ts - p.timestamp <= maxStaleMs;
}

export async function loadMarketBundle(
  symbol: AppTradeSymbol,
  days: number,
): Promise<MarketBundle> {
  const endMs = Date.now();
  const windowStartMs = endMs - days * 86_400_000;
  const fetchStart1h = windowStartMs - WARMUP_1H * MS_1H;
  const fetchStart4h = windowStartMs - 80 * MS_4H;

  console.log(
    `=== V4 ${symbol} ${days}d data load (scorerV4 + tradePlanV4) ===`,
  );
  console.log(
    `CVD rolling=MARKET_KLINE_LIMIT=${MARKET_KLINE_LIMIT}; fundingDepth=MARKET_LS_DEPTH=${MARKET_LS_DEPTH}; lsHist≤${LIVE_LS_HISTORY_LIMIT}`,
  );

  const [sym1h, sym4h, btc1hRaw, fundingRecords, oiHist, lsHist] =
    await Promise.all([
      fetchKlinesPaged(symbol, '1h', fetchStart1h, endMs),
      fetchKlinesPaged(symbol, '4h', fetchStart4h, endMs),
      symbol === 'BTCUSDT'
        ? Promise.resolve(null as Kline[] | null)
        : fetchKlinesPaged('BTCUSDT', '1h', fetchStart1h, endMs),
      fetchFundingRecords(symbol, fetchStart1h, endMs),
      fetchOiHist(symbol, 500),
      fetchLsHist(symbol, 500),
    ]);

  const btc1h = symbol === 'BTCUSDT' ? sym1h : (btc1hRaw as Kline[]);

  console.log(
    `[data] ${symbol} 1h=${sym1h.length} 4h=${sym4h.length} | BTC 1h=${btc1h.length} | funding=${fundingRecords.length} | oi=${oiHist.length} | ls=${lsHist.length}`,
  );

  return {
    symbol,
    days,
    endMs,
    windowStartMs,
    sym1h,
    sym4h,
    btc1h,
    fundingRecords,
    oiHist,
    lsHist,
  };
}

/** Precompute per-bar scores/plans once — reuse across ambiguity thresholds. */
export function buildBarEvalCache(bundle: MarketBundle): BarEvalCache[] {
  const {
    symbol,
    endMs,
    windowStartMs,
    sym1h,
    sym4h,
    btc1h,
    fundingRecords,
    oiHist,
    lsHist,
  } = bundle;

  const startIdx = sym1h.findIndex((k) => k.openTime >= windowStartMs);
  if (startIdx < 0) {
    throw new Error(`No 1h bars in ${bundle.days}d window for ${symbol}`);
  }

  const todayStats = buildTodayStatsFromJournalV4(0, 0);
  const cache: BarEvalCache[] = [];

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;

    const win1h = sym1h.slice(0, i + 1);
    const win4h = sliceUpTo(sym4h, candle.openTime);
    if (win4h.length < 30) continue;

    const evaluated = withSimulatedNow(candle.openTime, () => {
      const input = buildInput({
        symbol,
        near1h: win1h,
        near4h: win4h,
        btc1h,
        fundingRecords,
        oiHist,
        lsHist,
        openTime: candle.openTime,
      });
      const scoring = scoreAnalysisV4(input, todayStats);
      const direction = suggestDirectionV4(scoring);
      const active = direction === 'LONG' ? scoring.long : scoring.short;
      const longScore =
        scoring.long.officialTotalScore ?? scoring.long.referenceTotalScore;
      const shortScore =
        scoring.short.officialTotalScore ?? scoring.short.referenceTotalScore;
      const canEnterRaw = canEnterV4(active);
      let plan: ReturnType<typeof calculateTradePlanV4> | null = null;
      if (canEnterRaw) {
        plan = calculateTradePlanV4(
          symbol,
          input.currentPrice,
          win1h,
          win4h,
          scoring,
          direction,
          { bidWalls: [], askWalls: [] },
          DEFAULT_INITIAL_CAPITAL,
          DEFAULT_INITIAL_CAPITAL,
        );
      }
      return {
        direction,
        longScore,
        shortScore,
        canEnterRaw,
        active,
        plan,
      };
    });

    cache.push({
      barIndex: i,
      openTime: candle.openTime,
      direction: evaluated.direction,
      longScore: evaluated.longScore,
      shortScore: evaluated.shortScore,
      canEnterRaw: evaluated.canEnterRaw,
      active: evaluated.active,
      plan: evaluated.plan,
    });
  }

  return cache;
}

export function simulateFromCache(
  bundle: MarketBundle,
  cache: BarEvalCache[],
  ambiguityThreshold: number,
): BacktestRunResult {
  const { symbol, days, endMs, windowStartMs, sym1h, sym4h, btc1h, fundingRecords, oiHist, lsHist } =
    bundle;

  const firstBar = sym1h.find((k) => k.openTime >= windowStartMs);
  const lastBar = sym1h[sym1h.length - 1];
  const spanDaysActual =
    firstBar && lastBar
      ? (lastBar.openTime - firstBar.openTime) / 86_400_000
      : 0;

  const trades: TradeRow[] = [];
  let inPositionUntil = -1;
  let prevCanEnter = false;
  let ambigState: AmbiguityState | null = null;
  let canEnterCount = 0;
  let oiRealBars = 0;
  let lsRealBars = 0;

  for (const bar of cache) {
    const i = bar.barIndex;
    const candle = sym1h[i];

    if (hasFreshPoint(oiHist, candle.openTime, OI_LS_MAX_STALE_MS)) {
      oiRealBars += 1;
    }
    if (hasFreshPoint(lsHist, candle.openTime, OI_LS_MAX_STALE_MS)) {
      lsRealBars += 1;
    }

    ambigState = resolveAmbiguityAtThreshold(
      bar.longScore,
      bar.shortScore,
      ambigState,
      ambiguityThreshold,
    );
    const scoreDiff = Math.abs(bar.longScore - bar.shortScore);
    const ambiguous = ambigState.status === 'AMBIGUOUS';
    // Live applyAmbiguityToSnapshot: canEnter=false when AMBIGUOUS
    const enterOk = bar.canEnterRaw && !ambiguous;

    if (i <= inPositionUntil) {
      prevCanEnter = false;
      continue;
    }

    const rising = enterOk && !prevCanEnter;
    prevCanEnter = enterOk;

    if (!enterOk) continue;
    canEnterCount += 1;

    const plan = bar.plan;
    if (!plan || !plan.isValid || !plan.tradePlanValid) continue;
    if (!rising) continue;

    const direction = bar.direction;
    const active = bar.active;
    const entryPrice = plan.recommendedEntry;
    const sl = plan.stopLoss.price;
    const tp1 = plan.tp1.price;
    const maxHold =
      typeof plan.expiryHours === 'number' && plan.expiryHours > 0
        ? plan.expiryHours
        : MAX_HOLD_BARS_FALLBACK;

    const futureBars = sym1h.slice(i + 1);
    const exit = simulateExit({
      side: direction,
      entryPrice,
      sl,
      tp: tp1,
      bars: futureBars,
      maxHoldBars: maxHold,
    });

    const r = resultR(direction, entryPrice, exit.exitPrice, sl);
    const pct = pnlPct(direction, entryPrice, exit.exitPrice);
    const score = active.officialTotalScore ?? active.referenceTotalScore;

    trades.push({
      symbol,
      entryTime: candle.openTime,
      exitTime: exit.exitTime,
      entryIso: new Date(candle.openTime).toISOString(),
      exitIso: new Date(exit.exitTime).toISOString(),
      side: direction,
      entryPrice,
      exitPrice: exit.exitPrice,
      sl,
      tp1,
      tp2: plan.tp2.price,
      tp3: plan.tp3.price,
      pnlPct: +pct.toFixed(4),
      resultR: +r.toFixed(4),
      exitReason: exit.exitReason,
      decision: active.decision,
      score: +score.toFixed(4),
      longScore: +bar.longScore.toFixed(4),
      shortScore: +bar.shortScore.toFixed(4),
      scoreDiff: +scoreDiff.toFixed(4),
      ambiguityStatus: ambigState.status,
      ambiguityThreshold,
      groupA: +active.groupScores.A.toFixed(4),
      groupB: +active.groupScores.B.toFixed(4),
      groupC: +active.groupScores.C.toFixed(4),
      primaryRR: plan.primaryRR,
      marketMode: plan.marketMode,
      hourVn: +hourVnFromMs(candle.openTime).toFixed(2),
      l1: layerScore(active, 1),
      l2: layerScore(active, 2),
      l3: layerScore(active, 3),
      l4: layerScore(active, 4),
      l5a: layerScore(active, 5),
      l5b: layerScore(active, LAYER_L5B_ID),
      l6: layerScore(active, 6),
      l7: layerScore(active, 7),
      l8: layerScore(active, 8),
      l9: layerScore(active, 9),
      l10: layerScore(active, 10),
      tradePlanValid: plan.tradePlanValid ? 1 : 0,
      win: r > 0 ? 1 : 0,
    });

    inPositionUntil = i + exit.barsHeld;
    prevCanEnter = false;
  }

  const signalsChecked = cache.length;
  const oiRealPct =
    signalsChecked > 0 ? (oiRealBars / signalsChecked) * 100 : 0;
  const lsRealPct =
    signalsChecked > 0 ? (lsRealBars / signalsChecked) * 100 : 0;

  return {
    trades,
    meta: {
      daysRequested: days,
      spanDaysActual,
      near1hBars: sym1h.length,
      near4hBars: sym4h.length,
      btc1hBars: btc1h.length,
      fundingPoints: fundingRecords.length,
      oiPoints: oiHist.length,
      lsPoints: lsHist.length,
      barsChecked: signalsChecked,
      canEnterTicks: canEnterCount,
      oiRealBars,
      lsRealBars,
      oiRealPct,
      lsRealPct,
      windowStartMs,
      windowEndMs: endMs,
      symbol,
      ambiguityThreshold,
    },
  };
}

export async function runV4Backtest(
  opts: V4BacktestOptions,
): Promise<BacktestRunResult> {
  const ambiguityThreshold =
    opts.ambiguityThreshold ?? DEFAULT_AMBIGUITY_THRESHOLD;
  const bundle = await loadMarketBundle(opts.symbol, opts.days);
  const cache = buildBarEvalCache(bundle);
  return simulateFromCache(bundle, cache, ambiguityThreshold);
}

/** Backward-compatible alias — NEAR + default ambiguity thr=1.0. */
export async function runNearV4Backtest(
  days: number,
): Promise<BacktestRunResult> {
  return runV4Backtest({
    symbol: 'NEARUSDT',
    days,
    ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
  });
}

export { computeStats, fmt, main, writeCsv, DEFAULT_AMBIGUITY_THRESHOLD, WARMUP_1H, MAX_HOLD_BARS_FALLBACK, OI_LS_MAX_STALE_MS, hasFreshPoint, lookupNearestBefore };
export type { TradeRow, Stats };

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('backtest-v4-near-90d.ts') ||
    process.argv[1].endsWith('backtest-v4-near-90d.js'));

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
