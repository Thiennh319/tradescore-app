/**
 * Investigation only — why NEAR V4 180d backtest is 100% SHORT / 0% LONG.
 * Does not modify scorer/constants. Writes JSON + console summary.
 *
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs \
 *     scripts/investigate-near-180d-long-zero.ts --days 180
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BINANCE_BASE_URL,
  DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
  type PsychologyChecklistV3,
} from '../constants/scoring';
import type { Kline } from '../services/binanceApi';
import { computeAtr1hFromKlines } from '../services/atr1h';
import {
  buildCVDPointsFromKlines,
  getADXAnalysis,
  getEMAAnalysisV3,
} from '../services/indicators';
import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
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

const SYMBOL = 'NEARUSDT';
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const WARMUP_1H = 220;
const BINANCE_MAX_LIMIT = 1500;
const FETCH_GAP_MS = 200;

const PSYCH_V3_READY: PsychologyChecklistV3 = {
  alert: true,
  chartStudied: true,
  noFomo: true,
  slTpReady: true,
  riskAccepted: true,
};

type OiPoint = { timestamp: number; sumOpenInterest: number };
type LsPoint = { timestamp: number; longShortRatio: number };

function sleep(ms: number) {
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
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`klines ${symbol} ${interval}: ${res.status}`);
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

async function fetchFundingRecords(symbol: string, startMs: number, endMs: number) {
  const byTs = new Map<number, { fundingRate: number; fundingTime: number }>();
  let cursorEnd = endMs;
  for (let guard = 0; guard < 40; guard++) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/fundingRate`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('startTime', String(startMs));
    url.searchParams.set('endTime', String(cursorEnd));
    url.searchParams.set('limit', '1000');
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) break;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = (
      json as { fundingRate: string; fundingTime: number }[]
    ).map((p) => ({
      fundingRate: Number(p.fundingRate),
      fundingTime: Number(p.fundingTime),
    }));
    for (const p of batch) byTs.set(p.fundingTime, p);
    const earliest = Math.min(...batch.map((p) => p.fundingTime));
    if (earliest >= cursorEnd) break;
    cursorEnd = earliest - 1;
    if (batch.length < 2) break;
  }
  return [...byTs.values()].sort((a, b) => a.fundingTime - b.fundingTime);
}

async function fetchOiHist(symbol: string, limit: number): Promise<OiPoint[]> {
  const url = new URL(`${BINANCE_BASE_URL}/futures/data/openInterestHist`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('period', '1h');
  url.searchParams.set('limit', String(limit));
  await sleep(FETCH_GAP_MS);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return [];
  return (json as { timestamp: number; sumOpenInterest: string }[])
    .map((p) => ({
      timestamp: Number(p.timestamp),
      sumOpenInterest: Number(p.sumOpenInterest),
    }))
    .filter((p) => Number.isFinite(p.sumOpenInterest))
    .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchLsHist(symbol: string, limit: number): Promise<LsPoint[]> {
  const url = new URL(
    `${BINANCE_BASE_URL}/futures/data/topLongShortAccountRatio`,
  );
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('period', '1h');
  url.searchParams.set('limit', String(limit));
  await sleep(FETCH_GAP_MS);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return [];
  return (json as { timestamp: string; longShortRatio: string }[])
    .map((p) => ({
      timestamp: Number(p.timestamp),
      longShortRatio: Number(p.longShortRatio),
    }))
    .filter((p) => Number.isFinite(p.longShortRatio) && p.longShortRatio > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function sliceUpTo(klines: Kline[], openTime: number): Kline[] {
  return klines.filter((k) => k.openTime <= openTime);
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
) {
  return records.filter((r) => r.fundingTime <= ts);
}

function withSimulatedNow<T>(simMs: number, fn: () => T): T {
  const OriginalDate = globalThis.Date;
  function MockDate(this: Date, ...args: unknown[]) {
    if (args.length === 0) return new OriginalDate(simMs);
    if (args.length === 1) return new OriginalDate(args[0] as string | number | Date);
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

function buildInput(params: {
  near1h: Kline[];
  near4h: Kline[];
  btc1h: Kline[];
  fundingRecords: { fundingRate: number; fundingTime: number }[];
  oiHist: OiPoint[];
  lsHist: LsPoint[];
  openTime: number;
}): AnalysisInputV4 {
  const { near1h, near4h, btc1h, fundingRecords, oiHist, lsHist, openTime } =
    params;
  const price = near1h[near1h.length - 1].close;
  const fundUpTo = fundingUpTo(fundingRecords, openTime);
  const lastFund = fundUpTo[fundUpTo.length - 1];
  const fundingRatePct = lastFund ? lastFund.fundingRate * 100 : 0;

  const oiNow = lookupNearestBefore(oiHist, openTime);
  const oiPrev = oiNow ? lookupNearestBefore(oiHist, oiNow.timestamp - 1) : null;
  const lsUpTo = lsHist.filter((p) => p.timestamp <= openTime);
  const ratios = lsUpTo.map((p) => p.longShortRatio);

  const btcSlice = sliceUpTo(btc1h, openTime);
  let btc24h = 0;
  if (btcSlice.length > 24) {
    const a = btcSlice[btcSlice.length - 25].close;
    const b = btcSlice[btcSlice.length - 1].close;
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

  return {
    symbol: SYMBOL,
    currentPrice: price,
    klines1h: near1h,
    klines4h: near4h,
    fundingRate: fundingRatePct,
    oiCurrent,
    oiPrevious,
    topLongShortRatios: ratios.length > 0 ? ratios : [1],
    globalLongShortRatios: ratios.length > 0 ? ratios : [1],
    btc24hChangePct: btc24h,
    cvdPoints: buildCVDPointsFromKlines(near1h),
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

function layerMap(d: DirectionalScoreV4): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.rawLayerScores)) {
    out[`L${k}`] = v;
  }
  return out;
}

function summarizeDir(d: DirectionalScoreV4) {
  return {
    decision: d.decision,
    score: +(d.officialTotalScore ?? d.referenceTotalScore).toFixed(3),
    canEnter: canEnterV4(d),
    hardBlocks: d.hardBlocks,
    blockReasons: d.blockReasons,
    groupBlocks: d.groupBlocks,
    groups: {
      A: +d.groupScores.A.toFixed(3),
      B: +d.groupScores.B.toFixed(3),
      C: +d.groupScores.C.toFixed(3),
    },
    layers: layerMap(d),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let days = 180;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days') days = Math.max(1, Number(args[++i] ?? 180));
  }

  const endMs = Date.now();
  const windowStartMs = endMs - days * 86_400_000;
  const fetchStart1h = windowStartMs - WARMUP_1H * MS_1H;
  const fetchStart4h = windowStartMs - 80 * MS_4H;

  console.log(`=== Investigate NEAR LONG=0 (${days}d) ===`);

  const [near1h, near4h, btc1h, fundingRecords, oiHist, lsHist] =
    await Promise.all([
      fetchKlinesPaged(SYMBOL, '1h', fetchStart1h, endMs),
      fetchKlinesPaged(SYMBOL, '4h', fetchStart4h, endMs),
      fetchKlinesPaged('BTCUSDT', '1h', fetchStart1h, endMs),
      fetchFundingRecords(SYMBOL, fetchStart1h, endMs),
      fetchOiHist(SYMBOL, 500),
      fetchLsHist(SYMBOL, 500),
    ]);

  const startIdx = near1h.findIndex((k) => k.openTime >= windowStartMs);
  if (startIdx < 0) throw new Error('no bars in window');

  // --- Part 1: price / trend ---
  const win1h = near1h.filter((k) => k.openTime >= windowStartMs);
  const first = win1h[0];
  const last = win1h[win1h.length - 1];
  const totalPct = ((last.close - first.close) / first.close) * 100;

  // Daily closes (UTC day buckets)
  const daily = new Map<string, { open: number; close: number; high: number; low: number }>();
  for (const k of win1h) {
    const day = new Date(k.openTime).toISOString().slice(0, 10);
    const cur = daily.get(day);
    if (!cur) {
      daily.set(day, { open: k.open, close: k.close, high: k.high, low: k.low });
    } else {
      cur.close = k.close;
      cur.high = Math.max(cur.high, k.high);
      cur.low = Math.min(cur.low, k.low);
    }
  }
  const daysArr = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let upDays = 0;
  let downDays = 0;
  let flatDays = 0;
  for (let i = 1; i < daysArr.length; i++) {
    const prev = daysArr[i - 1][1].close;
    const cur = daysArr[i][1].close;
    const ch = ((cur - prev) / prev) * 100;
    if (ch > 0.15) upDays += 1;
    else if (ch < -0.15) downDays += 1;
    else flatDays += 1;
  }

  // 4H EMA slope buckets (sample each 4h bar in window)
  let downTrendBars = 0;
  let upTrendBars = 0;
  let sideBars = 0;
  const near4hWin = near4h.filter((k) => k.openTime >= windowStartMs);
  for (let i = 50; i < near4hWin.length; i++) {
    const slice = near4h.slice(
      0,
      near4h.findIndex((k) => k.openTime === near4hWin[i].openTime) + 1,
    );
    if (slice.length < 60) continue;
    try {
      const ema = getEMAAnalysisV3(slice);
      if (ema.slope20 === 'DOWN') downTrendBars += 1;
      else if (ema.slope20 === 'UP') upTrendBars += 1;
      else sideBars += 1;
    } catch {
      /* skip */
    }
  }
  const trendTotal = downTrendBars + upTrendBars + sideBars;

  // Relief rallies: rolling 5d return from daily closes > +12%
  const reliefCandidates: { day: string; ret5d: number; close: number }[] = [];
  for (let i = 5; i < daysArr.length; i++) {
    const a = daysArr[i - 5][1].close;
    const b = daysArr[i][1].close;
    const ret = ((b - a) / a) * 100;
    if (ret >= 12) {
      reliefCandidates.push({ day: daysArr[i][0], ret5d: +ret.toFixed(2), close: b });
    }
  }
  // Deduplicate: keep local peaks spaced >= 7 days
  const reliefPeaks: typeof reliefCandidates = [];
  for (const c of reliefCandidates.sort((a, b) => b.ret5d - a.ret5d)) {
    const t = Date.parse(c.day + 'T12:00:00Z');
    if (reliefPeaks.some((p) => Math.abs(Date.parse(p.day + 'T12:00:00Z') - t) < 7 * 86_400_000)) {
      continue;
    }
    reliefPeaks.push(c);
    if (reliefPeaks.length >= 5) break;
  }

  // --- Part 2/3: independent canEnter LONG vs SHORT ---
  const todayStats = buildTodayStatsFromJournalV4(0, 0);
  let bars = 0;
  let longOk = 0;
  let shortOk = 0;
  let bothOk = 0;
  let neitherOk = 0;
  let suggestedLong = 0;
  let suggestedShort = 0;
  let longOkButSuggestShort = 0;
  let shortOkButSuggestLong = 0;
  let longWouldEnterRising = 0;
  let shortWouldEnterRising = 0;
  let prevLongOk = false;
  let prevShortOk = false;
  let longRisingPlanOk = 0;
  let shortRisingPlanOk = 0;
  let longRisingPlanFail = 0;
  let shortRisingPlanFail = 0;
  let longRisingPlanFailReasons: Record<string, number> = {};
  let shortRisingPlanFailReasons: Record<string, number> = {};
  // Mimic backtest: only suggested direction + rising + tradePlanValid
  let btLongTrades = 0;
  let btShortTrades = 0;
  let btPrevCanEnter = false;
  let btInPosUntil = -1;
  const btLongFailReasons: Record<string, number> = {};
  const btShortFailReasons: Record<string, number> = {};

  const hardBlockLongCounts: Record<string, number> = {};
  const hardBlockShortCounts: Record<string, number> = {};
  const groupBlockLongCounts: Record<string, number> = {};
  const groupBlockShortCounts: Record<string, number> = {};

  const sampleEvery = 1; // full scan
  const spotChecks: unknown[] = [];

  for (let i = Math.max(startIdx, WARMUP_1H); i < near1h.length - 1; i += sampleEvery) {
    const candle = near1h[i];
    if (candle.openTime > endMs) break;
    const w1 = near1h.slice(0, i + 1);
    const w4 = sliceUpTo(near4h, candle.openTime);
    if (w4.length < 30) continue;

    bars += 1;
    const evaluated = withSimulatedNow(candle.openTime, () => {
      const input = buildInput({
        near1h: w1,
        near4h: w4,
        btc1h,
        fundingRecords,
        oiHist,
        lsHist,
        openTime: candle.openTime,
      });
      const scoring = scoreAnalysisV4(input, todayStats);
      const dir = suggestDirectionV4(scoring);
      return { scoring, dir, input };
    });

    const L = evaluated.scoring.long;
    const S = evaluated.scoring.short;
    const lOk = canEnterV4(L);
    const sOk = canEnterV4(S);

    if (lOk) longOk += 1;
    if (sOk) shortOk += 1;
    if (lOk && sOk) bothOk += 1;
    if (!lOk && !sOk) neitherOk += 1;
    if (evaluated.dir === 'LONG') suggestedLong += 1;
    else suggestedShort += 1;
    if (lOk && !sOk && evaluated.dir === 'SHORT') longOkButSuggestShort += 1;
    if (sOk && !lOk && evaluated.dir === 'LONG') shortOkButSuggestLong += 1;
    if (lOk && sOk && evaluated.dir === 'SHORT') longOkButSuggestShort += 1;

    if (lOk && !prevLongOk) {
      longWouldEnterRising += 1;
      const plan = withSimulatedNow(candle.openTime, () =>
        calculateTradePlanV4(
          SYMBOL,
          evaluated.input.currentPrice,
          w1,
          w4,
          evaluated.scoring,
          'LONG',
          { bidWalls: [], askWalls: [] },
          DEFAULT_INITIAL_CAPITAL,
          DEFAULT_INITIAL_CAPITAL,
        ),
      );
      if (plan.isValid && plan.tradePlanValid) longRisingPlanOk += 1;
      else {
        longRisingPlanFail += 1;
        const reason = !plan.isValid
          ? `isValid=false:${(plan.blockReasons ?? []).join('|') || 'no-blockReasons'}`
          : `tradePlanValid=false`;
        longRisingPlanFailReasons[reason] =
          (longRisingPlanFailReasons[reason] ?? 0) + 1;
      }
    }
    if (sOk && !prevShortOk) {
      shortWouldEnterRising += 1;
      const plan = withSimulatedNow(candle.openTime, () =>
        calculateTradePlanV4(
          SYMBOL,
          evaluated.input.currentPrice,
          w1,
          w4,
          evaluated.scoring,
          'SHORT',
          { bidWalls: [], askWalls: [] },
          DEFAULT_INITIAL_CAPITAL,
          DEFAULT_INITIAL_CAPITAL,
        ),
      );
      if (plan.isValid && plan.tradePlanValid) shortRisingPlanOk += 1;
      else {
        shortRisingPlanFail += 1;
        const reason = !plan.isValid
          ? `isValid=false:${(plan.blockReasons ?? []).join('|') || 'no-blockReasons'}`
          : `tradePlanValid=false`;
        shortRisingPlanFailReasons[reason] =
          (shortRisingPlanFailReasons[reason] ?? 0) + 1;
      }
    }
    prevLongOk = lOk;
    prevShortOk = sOk;

    // Mimic production backtest entry gate (suggested side only)
    if (i > btInPosUntil) {
      const active = evaluated.dir === 'LONG' ? L : S;
      const enterOk = canEnterV4(active);
      const rising = enterOk && !btPrevCanEnter;
      btPrevCanEnter = enterOk;
      if (enterOk) {
        const plan = withSimulatedNow(candle.openTime, () =>
          calculateTradePlanV4(
            SYMBOL,
            evaluated.input.currentPrice,
            w1,
            w4,
            evaluated.scoring,
            evaluated.dir,
            { bidWalls: [], askWalls: [] },
            DEFAULT_INITIAL_CAPITAL,
            DEFAULT_INITIAL_CAPITAL,
          ),
        );
        if (plan.isValid && plan.tradePlanValid && rising) {
          if (evaluated.dir === 'LONG') btLongTrades += 1;
          else btShortTrades += 1;
          // approximate hold: skip next 12 bars like a short timeout
          btInPosUntil = i + 12;
          btPrevCanEnter = false;
        } else if (rising) {
          const reason = !plan.isValid
            ? `isValid=false`
            : `tradePlanValid=false`;
          const bag =
            evaluated.dir === 'LONG' ? btLongFailReasons : btShortFailReasons;
          bag[reason] = (bag[reason] ?? 0) + 1;
        }
      }
    }

    for (const b of L.hardBlocks) {
      hardBlockLongCounts[b] = (hardBlockLongCounts[b] ?? 0) + 1;
    }
    for (const b of S.hardBlocks) {
      hardBlockShortCounts[b] = (hardBlockShortCounts[b] ?? 0) + 1;
    }
    for (const b of L.groupBlocks) {
      groupBlockLongCounts[b] = (groupBlockLongCounts[b] ?? 0) + 1;
    }
    for (const b of S.groupBlocks) {
      groupBlockShortCounts[b] = (groupBlockShortCounts[b] ?? 0) + 1;
    }
  }

  // Spot-check at relief peaks (use 12:00 UTC that day or nearest 1h)
  for (const peak of reliefPeaks) {
    const target = Date.parse(peak.day + 'T12:00:00.000Z');
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = Math.max(startIdx, WARMUP_1H); i < near1h.length; i++) {
      const d = Math.abs(near1h[i].openTime - target);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;
    const candle = near1h[bestIdx];
    const snap = withSimulatedNow(candle.openTime, () => {
      const input = buildInput({
        near1h: near1h.slice(0, bestIdx + 1),
        near4h: sliceUpTo(near4h, candle.openTime),
        btc1h,
        fundingRecords,
        oiHist,
        lsHist,
        openTime: candle.openTime,
      });
      const scoring = scoreAnalysisV4(input, todayStats);
      const dir = suggestDirectionV4(scoring);
      let emaNote = '';
      try {
        const ema = getEMAAnalysisV3(sliceUpTo(near4h, candle.openTime));
        emaNote = `ema20=${ema.ema20?.toFixed(4)} slope20=${ema.slope20} vs20=${ema.priceVsEma20Pct?.toFixed(2)}%`;
      } catch {
        emaNote = 'ema n/a';
      }
      return {
        iso: new Date(candle.openTime).toISOString(),
        reliefDay: peak.day,
        ret5d: peak.ret5d,
        price: input.currentPrice,
        fundingPct: input.fundingRate,
        btc24h: input.btc24hChangePct,
        emaNote,
        suggested: dir,
        long: summarizeDir(scoring.long),
        short: summarizeDir(scoring.short),
      };
    });
    spotChecks.push(snap);
  }

  const report = {
    meta: {
      days,
      windowStartIso: new Date(windowStartMs).toISOString(),
      windowEndIso: new Date(endMs).toISOString(),
      firstClose: first.close,
      lastClose: last.close,
      firstIso: new Date(first.openTime).toISOString(),
      lastIso: new Date(last.openTime).toISOString(),
      totalPct: +totalPct.toFixed(2),
      near1h: near1h.length,
      near4h: near4h.length,
    },
    priceRegime: {
      upDays,
      downDays,
      flatDays,
      dayCount: daysArr.length,
      pctDownDays: +((downDays / Math.max(1, upDays + downDays + flatDays)) * 100).toFixed(1),
      pctUpDays: +((upDays / Math.max(1, upDays + downDays + flatDays)) * 100).toFixed(1),
      ema4hBuckets: {
        downTrendBars,
        upTrendBars,
        sideBars,
        pctDown: trendTotal ? +((downTrendBars / trendTotal) * 100).toFixed(1) : null,
        pctUp: trendTotal ? +((upTrendBars / trendTotal) * 100).toFixed(1) : null,
        pctSide: trendTotal ? +((sideBars / trendTotal) * 100).toFixed(1) : null,
      },
      reliefPeaks,
    },
    canEnterIndependent: {
      barsChecked: bars,
      longOk,
      shortOk,
      bothOk,
      neitherOk,
      longOkPct: +((longOk / bars) * 100).toFixed(2),
      shortOkPct: +((shortOk / bars) * 100).toFixed(2),
      suggestedLong,
      suggestedShort,
      longOkButSuggestShort,
      shortOkButSuggestLong,
      longWouldEnterRisingEdges: longWouldEnterRising,
      shortWouldEnterRisingEdges: shortWouldEnterRising,
      longRisingPlanOk,
      shortRisingPlanOk,
      longRisingPlanFail,
      shortRisingPlanFail,
      longRisingPlanFailReasons,
      shortRisingPlanFailReasons,
      backtestMimic: {
        longTrades: btLongTrades,
        shortTrades: btShortTrades,
        longFailReasons: btLongFailReasons,
        shortFailReasons: btShortFailReasons,
      },
    },
    hardBlockTop: {
      long: Object.entries(hardBlockLongCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
      short: Object.entries(hardBlockShortCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    },
    groupBlockTop: {
      long: Object.entries(groupBlockLongCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      short: Object.entries(groupBlockShortCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    },
    spotChecks,
  };

  const outPath = path.join(
    process.cwd(),
    'docs/exports/near_v4_180d_long_zero_investigate.json',
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    totalPct: report.meta.totalPct,
    priceRegime: report.priceRegime,
    canEnterIndependent: report.canEnterIndependent,
    hardBlockLongTop5: report.hardBlockTop.long.slice(0, 5),
    hardBlockShortTop5: report.hardBlockTop.short.slice(0, 5),
    spotCount: spotChecks.length,
    outPath,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
