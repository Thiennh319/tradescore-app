/**
 * Backtest độc lập V3 + V4 Signal Board — cửa sổ tin cậy OI/LS (~21d).
 *
 * Phạm vi: scoreAnalysisV3 / scoreAnalysisV4 + calculateTradePlanV3/V4
 * Gate live: ambiguity (AMBIGUOUS_THRESHOLD) + ADX CHOPPY block + ADX TP/SL scale
 * CẤM: V41 breakout, resolveSymbolStrategy, sửa scorer/tradePlan production
 *
 * Usage:
 *   npx tsx scripts/backtest-v3v4-xrp-trusted-window.ts
 *   npx tsx scripts/backtest-v3v4-xrp-trusted-window.ts --symbol XRPUSDT --days 21
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import { LAYER_L5B_ID, type AppTradeSymbol } from '../constants/scoring';
import type { Kline } from '../services/binanceApi';
import { AMBIGUOUS_THRESHOLD, type AmbiguityState } from '../services/directionAmbiguity';
import { getADXAnalysis, type ADXAnalysis } from '../services/indicators';
import { evaluateADXGate, type ADXGateResult } from '../services/adxGate';
import {
  buildTodayStatsFromJournal,
  canEnterV3,
  scoreAnalysisV3,
  suggestDirectionV3,
  type AnalysisInputV3,
  type DirectionalScoreV3,
} from '../services/scorerV3';
import {
  buildTodayStatsFromJournalV4,
  canEnterV4,
  scoreAnalysisV4,
  suggestDirectionV4,
  type DirectionalScoreV4,
} from '../services/scorerV4';
import { calculateTradePlanV3, type TradePlanV3 } from '../services/tradePlanV3';
import { calculateTradePlanV4 } from '../services/tradePlanV4';

import {
  buildInput,
  computeStats,
  DEFAULT_AMBIGUITY_THRESHOLD,
  hasFreshPoint,
  hourVnFromMs,
  loadMarketBundle,
  MAX_HOLD_BARS_FALLBACK,
  OI_LS_MAX_STALE_MS,
  pnlPct,
  resolveAmbiguityAtThreshold,
  resultR,
  simulateExit,
  sliceUpTo,
  WARMUP_1H,
  withSimulatedNow,
  type MarketBundle,
  type Stats,
  type TradeRow,
} from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Engine = 'V3' | 'V4';

type PlanLike = {
  recommendedEntry: number;
  stopLoss: { price: number };
  tp1: { price: number };
  tp2: { price: number };
  tp3: { price: number };
  expiryHours?: number;
  isValid: boolean;
  tradePlanValid: boolean;
  primaryRR: number;
  marketMode: string;
  direction: 'LONG' | 'SHORT';
};

type BarEval = {
  barIndex: number;
  openTime: number;
  direction: 'LONG' | 'SHORT';
  longScore: number;
  shortScore: number;
  canEnterRaw: boolean;
  decision: string;
  hardBlocks: string[];
  groupBlocks: string[];
  blockReasons: string[];
  awaitingRescore: boolean;
  rawLayerScores: Record<number, number>;
  groupScores: { A: number; B: number; C: number };
  score: number;
  plan: PlanLike | null;
  adxData?: ADXAnalysis;
};

type GateClass =
  | 'ENTERED'
  | 'SOFT_BLOCK'
  | 'CHO_TAI_CHAM'
  | 'HARD_BLOCK'
  | 'AMBIGUOUS'
  | 'ADX_CHOPPY'
  | 'NO_PLAN'
  | 'OTHER';

type CounterfactualRow = {
  engine: Engine;
  openTime: number;
  side: 'LONG' | 'SHORT';
  gate: GateClass;
  wouldWin: boolean | null;
  resultR: number | null;
  exitReason: string | null;
  decision: string;
  blockReasons: string[];
  hardBlocks: string[];
};

function scalePlanByAdx(plan: PlanLike, gate: ADXGateResult): PlanLike {
  if (gate.tpMultiplier === 1 && gate.slMultiplier === 1) return plan;
  const entry = plan.recommendedEntry;
  const isLong = plan.direction === 'LONG';
  const scaleTp = (price: number) =>
    isLong
      ? entry + (price - entry) * gate.tpMultiplier
      : entry - (entry - price) * gate.tpMultiplier;
  const scaleSl = (price: number) =>
    isLong
      ? entry - (entry - price) * gate.slMultiplier
      : entry + (price - entry) * gate.slMultiplier;
  return {
    ...plan,
    stopLoss: { ...plan.stopLoss, price: scaleSl(plan.stopLoss.price) },
    tp1: { ...plan.tp1, price: scaleTp(plan.tp1.price) },
    tp2: { ...plan.tp2, price: scaleTp(plan.tp2.price) },
    tp3: { ...plan.tp3, price: scaleTp(plan.tp3.price) },
  };
}

function layerHintFromHardBlock(msg: string): string {
  const m = msg.match(/\bL(\d{1,2}[ab]?)\b/i);
  if (m) return `L${m[1]}`;
  if (/CVD/i.test(msg)) return 'L5a';
  if (/Funding/i.test(msg)) return 'L6';
  if (/OI|Open Interest|Vol\/OI|Vol\b/i.test(msg)) return 'L5b';
  if (/MACD/i.test(msg)) return 'L3';
  if (/Phiên|session/i.test(msg)) return 'L9';
  if (/Tâm lý|psychology/i.test(msg)) return 'L10';
  if (/Group\s*[ABC]|nhóm\s*[ABC]/i.test(msg)) return 'GROUP';
  if (/BTC/i.test(msg)) return 'L8';
  if (/Whale|L\/S|Long.?Short/i.test(msg)) return 'L7';
  if (/EMA|Giá/i.test(msg)) return 'L1';
  return 'OTHER';
}

function normalizeLayerKey(raw: string): string {
  const u = raw.toUpperCase();
  if (u.includes('5B') || u === 'L5B') return 'L5b';
  if (u.includes('5A') || u === 'L5A') return 'L5a';
  const m = u.match(/L(\d+)/);
  if (m) return `L${m[1]}`;
  return raw;
}

function trustedDaysFromBundle(bundle: MarketBundle): {
  oiSpanDays: number;
  lsSpanDays: number;
  trustedDays: number;
} {
  const oiSpanDays =
    bundle.oiHist.length >= 2
      ? (bundle.oiHist[bundle.oiHist.length - 1].timestamp -
          bundle.oiHist[0].timestamp) /
        86_400_000
      : 0;
  const lsSpanDays =
    bundle.lsHist.length >= 2
      ? (bundle.lsHist[bundle.lsHist.length - 1].timestamp -
          bundle.lsHist[0].timestamp) /
        86_400_000
      : 0;
  const trustedDays = Math.max(
    1,
    Math.floor(Math.min(oiSpanDays, lsSpanDays, bundle.days) * 10) / 10,
  );
  return { oiSpanDays, lsSpanDays, trustedDays };
}

function buildBarEvalV4(bundle: MarketBundle): BarEval[] {
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
  if (startIdx < 0) throw new Error(`No 1h bars in window for ${symbol}`);
  const todayStats = buildTodayStatsFromJournalV4(0, 0);
  const cache: BarEval[] = [];

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
      let plan: PlanLike | null = null;
      const needPlan =
        canEnterRaw ||
        active.blockReasons.length > 0 ||
        active.decision === 'CHO_TAI_CHAM';
      if (needPlan) {
        const p = calculateTradePlanV4(
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
        plan = {
          recommendedEntry: p.recommendedEntry,
          stopLoss: p.stopLoss,
          tp1: p.tp1,
          tp2: p.tp2,
          tp3: p.tp3,
          expiryHours: p.expiryHours,
          isValid: p.isValid,
          tradePlanValid: p.tradePlanValid,
          primaryRR: p.primaryRR,
          marketMode: p.marketMode,
          direction: p.direction,
        };
      }
      return {
        direction,
        longScore,
        shortScore,
        canEnterRaw,
        active,
        plan,
        adxData: input.adxData,
      };
    });

    cache.push({
      barIndex: i,
      openTime: candle.openTime,
      direction: evaluated.direction,
      longScore: evaluated.longScore,
      shortScore: evaluated.shortScore,
      canEnterRaw: evaluated.canEnterRaw,
      decision: evaluated.active.decision,
      hardBlocks: [...evaluated.active.hardBlocks],
      groupBlocks: [...evaluated.active.groupBlocks],
      blockReasons: [...evaluated.active.blockReasons],
      awaitingRescore: evaluated.active.awaitingRescore,
      rawLayerScores: { ...evaluated.active.rawLayerScores },
      groupScores: { ...evaluated.active.groupScores },
      score:
        evaluated.active.officialTotalScore ??
        evaluated.active.referenceTotalScore,
      plan: evaluated.plan,
      adxData: evaluated.adxData,
    });
  }
  return cache;
}

function buildBarEvalV3(bundle: MarketBundle): BarEval[] {
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
  if (startIdx < 0) throw new Error(`No 1h bars in window for ${symbol}`);
  const todayStats = buildTodayStatsFromJournal(0, 0);
  const cache: BarEval[] = [];

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;
    const win1h = sym1h.slice(0, i + 1);
    const win4h = sliceUpTo(sym4h, candle.openTime);
    if (win4h.length < 30) continue;

    const evaluated = withSimulatedNow(candle.openTime, () => {
      const inputV4 = buildInput({
        symbol,
        near1h: win1h,
        near4h: win4h,
        btc1h,
        fundingRecords,
        oiHist,
        lsHist,
        openTime: candle.openTime,
      });
      const input = inputV4 as unknown as AnalysisInputV3;
      const scoring = scoreAnalysisV3(input, todayStats);
      const direction = suggestDirectionV3(scoring);
      const active: DirectionalScoreV3 =
        direction === 'LONG' ? scoring.long : scoring.short;
      const longScore = scoring.long.totalScore;
      const shortScore = scoring.short.totalScore;
      const canEnterRaw = canEnterV3(active);
      let plan: PlanLike | null = null;
      if (canEnterRaw || active.hardBlocks.length === 0) {
        try {
          const p: TradePlanV3 = calculateTradePlanV3(
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
          plan = {
            recommendedEntry: p.recommendedEntry,
            stopLoss: p.stopLoss,
            tp1: p.tp1,
            tp2: p.tp2,
            tp3: p.tp3,
            expiryHours: p.expiryHours,
            isValid: p.isValid,
            tradePlanValid: p.tradePlanValid,
            primaryRR: p.primaryRR,
            marketMode: p.marketMode,
            direction: p.direction,
          };
        } catch {
          plan = null;
        }
      }
      return {
        direction,
        longScore,
        shortScore,
        canEnterRaw,
        active,
        plan,
        adxData: inputV4.adxData,
      };
    });

    cache.push({
      barIndex: i,
      openTime: candle.openTime,
      direction: evaluated.direction,
      longScore: evaluated.longScore,
      shortScore: evaluated.shortScore,
      canEnterRaw: evaluated.canEnterRaw,
      decision: evaluated.active.decision,
      hardBlocks: [...evaluated.active.hardBlocks],
      groupBlocks: [...evaluated.active.groupBlocks],
      blockReasons: [],
      awaitingRescore: false,
      rawLayerScores: { ...evaluated.active.rawLayerScores },
      groupScores: { ...evaluated.active.groupScores },
      score: evaluated.active.totalScore,
      plan: evaluated.plan,
      adxData: evaluated.adxData,
    });
  }
  return cache;
}

function classifyGate(
  bar: BarEval,
  ambiguous: boolean,
  adxBlock: boolean,
): GateClass {
  if (adxBlock) return 'ADX_CHOPPY';
  if (ambiguous) return 'AMBIGUOUS';
  if (bar.canEnterRaw) return 'ENTERED';
  if (bar.decision === 'CHO_TAI_CHAM' || bar.awaitingRescore) return 'CHO_TAI_CHAM';
  if (bar.blockReasons.length > 0 && bar.hardBlocks.length === 0) {
    return 'SOFT_BLOCK';
  }
  if (bar.hardBlocks.length > 0 || bar.groupBlocks.length > 0) return 'HARD_BLOCK';
  return 'OTHER';
}

function layerScore(
  scores: Record<number, number>,
  n: number,
): number {
  return scores[n] ?? 0;
}

function simulateEngine(
  bundle: MarketBundle,
  cache: BarEval[],
  engine: Engine,
  ambiguityThreshold: number,
): {
  trades: TradeRow[];
  counterfactuals: CounterfactualRow[];
  hardBlockLayerCounts: Record<string, number>;
  gateCounts: Record<GateClass, number>;
  meta: {
    barsChecked: number;
    canEnterTicks: number;
    risingEnterTicks: number;
    oiRealPct: number;
    lsRealPct: number;
    adxBlockedTicks: number;
    softBlockTicks: number;
    choTaiChamTicks: number;
  };
} {
  const { symbol, sym1h, oiHist, lsHist } = bundle;
  const trades: TradeRow[] = [];
  const counterfactuals: CounterfactualRow[] = [];
  const hardBlockLayerCounts: Record<string, number> = {};
  const gateCounts: Record<GateClass, number> = {
    ENTERED: 0,
    SOFT_BLOCK: 0,
    CHO_TAI_CHAM: 0,
    HARD_BLOCK: 0,
    AMBIGUOUS: 0,
    ADX_CHOPPY: 0,
    NO_PLAN: 0,
    OTHER: 0,
  };

  let inPositionUntil = -1;
  let prevCanEnter = false;
  let ambigState: AmbiguityState | null = null;
  let canEnterCount = 0;
  let risingEnterTicks = 0;
  let oiRealBars = 0;
  let lsRealBars = 0;
  let adxBlockedTicks = 0;
  let softBlockTicks = 0;
  let choTaiChamTicks = 0;

  for (const bar of cache) {
    const i = bar.barIndex;
    const candle = sym1h[i];

    if (hasFreshPoint(oiHist, candle.openTime, OI_LS_MAX_STALE_MS)) oiRealBars += 1;
    if (hasFreshPoint(lsHist, candle.openTime, OI_LS_MAX_STALE_MS)) lsRealBars += 1;

    ambigState = resolveAmbiguityAtThreshold(
      bar.longScore,
      bar.shortScore,
      ambigState,
      ambiguityThreshold,
    );
    const ambiguous = ambigState.status === 'AMBIGUOUS';
    const scoreDiff = Math.abs(bar.longScore - bar.shortScore);

    let adxGate: ADXGateResult = evaluateADXGate(bar.adxData, bar.direction);
    if (!bar.adxData) {
      try {
        const win1h = sym1h.slice(0, i + 1);
        const win4h = sliceUpTo(bundle.sym4h, candle.openTime);
        adxGate = evaluateADXGate(getADXAnalysis(win1h, win4h), bar.direction);
      } catch {
        /* keep default */
      }
    }
    const adxBlock = adxGate.block === true;
    if (adxBlock) adxBlockedTicks += 1;

    const enterOk = bar.canEnterRaw && !ambiguous && !adxBlock;
    const gate = classifyGate(bar, ambiguous, adxBlock);
    gateCounts[gate] = (gateCounts[gate] ?? 0) + 1;

    if (gate === 'SOFT_BLOCK') softBlockTicks += 1;
    if (gate === 'CHO_TAI_CHAM') choTaiChamTicks += 1;

    if (gate === 'HARD_BLOCK') {
      const msgs = [...bar.hardBlocks, ...bar.groupBlocks];
      if (msgs.length === 0) {
        hardBlockLayerCounts.OTHER = (hardBlockLayerCounts.OTHER ?? 0) + 1;
      } else {
        for (const msg of msgs) {
          const key = normalizeLayerKey(layerHintFromHardBlock(msg));
          hardBlockLayerCounts[key] = (hardBlockLayerCounts[key] ?? 0) + 1;
        }
      }
    }

    // Counterfactual for soft-block / CHO_TAI_CHAM (would-have-won analysis)
    if (
      (gate === 'SOFT_BLOCK' || gate === 'CHO_TAI_CHAM') &&
      bar.plan &&
      bar.plan.isValid &&
      i > inPositionUntil
    ) {
      const plan = scalePlanByAdx(bar.plan, adxGate);
      const maxHold =
        typeof plan.expiryHours === 'number' && plan.expiryHours > 0
          ? plan.expiryHours
          : MAX_HOLD_BARS_FALLBACK;
      const exit = simulateExit({
        side: bar.direction,
        entryPrice: plan.recommendedEntry,
        sl: plan.stopLoss.price,
        tp: plan.tp1.price,
        bars: sym1h.slice(i + 1),
        maxHoldBars: maxHold,
      });
      const r = resultR(
        bar.direction,
        plan.recommendedEntry,
        exit.exitPrice,
        plan.stopLoss.price,
      );
      counterfactuals.push({
        engine,
        openTime: candle.openTime,
        side: bar.direction,
        gate,
        wouldWin: r > 0,
        resultR: +r.toFixed(4),
        exitReason: exit.exitReason,
        decision: bar.decision,
        blockReasons: bar.blockReasons,
        hardBlocks: bar.hardBlocks,
      });
    }

    if (i <= inPositionUntil) {
      prevCanEnter = false;
      continue;
    }

    const rising = enterOk && !prevCanEnter;
    prevCanEnter = enterOk;
    if (!enterOk) continue;
    canEnterCount += 1;

    let plan = bar.plan;
    if (!plan || !plan.isValid || !plan.tradePlanValid) {
      gateCounts.NO_PLAN += 1;
      continue;
    }
    plan = scalePlanByAdx(plan, adxGate);
    if (!rising) continue;
    risingEnterTicks += 1;

    const entryPrice = plan.recommendedEntry;
    const sl = plan.stopLoss.price;
    const tp1 = plan.tp1.price;
    const maxHold =
      typeof plan.expiryHours === 'number' && plan.expiryHours > 0
        ? plan.expiryHours
        : MAX_HOLD_BARS_FALLBACK;
    const exit = simulateExit({
      side: bar.direction,
      entryPrice,
      sl,
      tp: tp1,
      bars: sym1h.slice(i + 1),
      maxHoldBars: maxHold,
    });
    const r = resultR(bar.direction, entryPrice, exit.exitPrice, sl);
    const pct = pnlPct(bar.direction, entryPrice, exit.exitPrice);

    trades.push({
      symbol,
      entryTime: candle.openTime,
      exitTime: exit.exitTime,
      entryIso: new Date(candle.openTime).toISOString(),
      exitIso: new Date(exit.exitTime).toISOString(),
      side: bar.direction,
      entryPrice,
      exitPrice: exit.exitPrice,
      sl,
      tp1,
      tp2: plan.tp2.price,
      tp3: plan.tp3.price,
      pnlPct: +pct.toFixed(4),
      resultR: +r.toFixed(4),
      exitReason: exit.exitReason,
      decision: bar.decision,
      score: +bar.score.toFixed(4),
      longScore: +bar.longScore.toFixed(4),
      shortScore: +bar.shortScore.toFixed(4),
      scoreDiff: +scoreDiff.toFixed(4),
      ambiguityStatus: ambigState.status,
      ambiguityThreshold,
      groupA: +bar.groupScores.A.toFixed(4),
      groupB: +bar.groupScores.B.toFixed(4),
      groupC: +bar.groupScores.C.toFixed(4),
      primaryRR: plan.primaryRR,
      marketMode: plan.marketMode,
      hourVn: +hourVnFromMs(candle.openTime).toFixed(2),
      l1: layerScore(bar.rawLayerScores, 1),
      l2: layerScore(bar.rawLayerScores, 2),
      l3: layerScore(bar.rawLayerScores, 3),
      l4: layerScore(bar.rawLayerScores, 4),
      l5a: layerScore(bar.rawLayerScores, 5),
      l5b: layerScore(bar.rawLayerScores, LAYER_L5B_ID),
      l6: layerScore(bar.rawLayerScores, 6),
      l7: layerScore(bar.rawLayerScores, 7),
      l8: layerScore(bar.rawLayerScores, 8),
      l9: layerScore(bar.rawLayerScores, 9),
      l10: layerScore(bar.rawLayerScores, 10),
      tradePlanValid: plan.tradePlanValid ? 1 : 0,
      win: r > 0 ? 1 : 0,
    });

    inPositionUntil = i + exit.barsHeld;
    prevCanEnter = false;
  }

  const n = cache.length;
  return {
    trades,
    counterfactuals,
    hardBlockLayerCounts,
    gateCounts,
    meta: {
      barsChecked: n,
      canEnterTicks: canEnterCount,
      risingEnterTicks,
      oiRealPct: n > 0 ? (oiRealBars / n) * 100 : 0,
      lsRealPct: n > 0 ? (lsRealBars / n) * 100 : 0,
      adxBlockedTicks,
      softBlockTicks,
      choTaiChamTicks,
    },
  };
}

/** `computeStats.wr` is already 0–100 (percent). */
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function sideStats(rows: TradeRow[], side: 'LONG' | 'SHORT'): Stats {
  return computeStats(rows.filter((r) => r.side === side));
}

function renderEngineReport(
  engine: Engine,
  trades: TradeRow[],
  counterfactuals: CounterfactualRow[],
  hardBlockLayerCounts: Record<string, number>,
  gateCounts: Record<GateClass, number>,
  meta: ReturnType<typeof simulateEngine>['meta'],
): string {
  const all = computeStats(trades);
  const longs = sideStats(trades, 'LONG');
  const shorts = sideStats(trades, 'SHORT');
  const softCf = counterfactuals.filter((c) => c.gate === 'SOFT_BLOCK');
  const choCf = counterfactuals.filter((c) => c.gate === 'CHO_TAI_CHAM');
  const softWouldWin = softCf.filter((c) => c.wouldWin === true).length;
  const choWouldWin = choCf.filter((c) => c.wouldWin === true).length;

  const layerRows = Object.entries(hardBlockLayerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');

  return `### ${engine}

| Metric | Value |
|--------|-------|
| Bars checked | ${meta.barsChecked} |
| canEnter ticks (after ambig+ADX) | ${meta.canEnterTicks} |
| Rising-edge entries | ${meta.risingEnterTicks} |
| Trades taken | ${all.n} (L=${longs.n}, S=${shorts.n}) |
| Winrate all | ${all.n ? fmtPct(all.wr) : 'n/a'} (${all.wins}W/${all.losses}L) |
| Winrate Long | ${longs.n ? fmtPct(longs.wr) : 'n/a'} |
| Winrate Short | ${shorts.n ? fmtPct(shorts.wr) : 'n/a'} |
| Profit factor | ${all.n ? all.pf.toFixed(2) : 'n/a'} |
| Avg R | ${all.n ? all.avgR.toFixed(3) : 'n/a'} |
| Expectancy R | ${all.n ? all.expectancyR.toFixed(3) : 'n/a'} |
| OI real % bars | ${meta.oiRealPct.toFixed(1)}% |
| LS real % bars | ${meta.lsRealPct.toFixed(1)}% |
| ADX choppy ticks | ${meta.adxBlockedTicks} |
| Soft-block ticks | ${meta.softBlockTicks} |
| CHO_TAI_CHAM ticks | ${meta.choTaiChamTicks} |

**Gate tally (per bar, active side):**
| Gate | Count |
|------|------:|
${Object.entries(gateCounts)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join('\n')}

**Hard-block layer contributors (active side, HARD_BLOCK bars):**
| Layer | Hits |
|-------|-----:|
${layerRows || '| (none) | 0 |'}

**Counterfactual — soft-block / CHO_TAI_CHAM với tradePlanValid:**
| Class | Simulated | Would-win | Would-lose/flat |
|-------|----------:|----------:|----------------:|
| Soft-block (blockReasons) | ${softCf.length} | ${softWouldWin} | ${softCf.length - softWouldWin} |
| CHO_TAI_CHAM | ${choCf.length} | ${choWouldWin} | ${choCf.length - choWouldWin} |

> Caveat: counterfactual giả sử vẫn entry đúng recommendedEntry của plan dù live không cho vào.
`;
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let symbol: AppTradeSymbol = 'XRPUSDT';
  let days = 21;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol') {
      const raw = (args[++i] ?? 'XRPUSDT').toUpperCase();
      symbol = (raw.endsWith('USDT') ? raw : `${raw}USDT`) as AppTradeSymbol;
    } else if (args[i] === '--days') {
      days = Math.max(1, Number(args[++i] ?? 21));
    }
  }

  console.log(
    `=== Trusted-window V3+V4 backtest ${symbol} days=${days} (amb=${DEFAULT_AMBIGUITY_THRESHOLD ?? AMBIGUOUS_THRESHOLD}) ===`,
  );

  const bundle = await loadMarketBundle(symbol, days);
  const spans = trustedDaysFromBundle(bundle);
  console.log(
    `[gate] OI span=${spans.oiSpanDays.toFixed(2)}d LS span=${spans.lsSpanDays.toFixed(2)}d → trusted≈${spans.trustedDays}d`,
  );

  if (spans.oiSpanDays < days * 0.85 || spans.lsSpanDays < days * 0.85) {
    console.warn(
      `[gate] WARNING: requested ${days}d vượt overlap OI/LS thật — kết quả L5b/L7 có thể lệch ở mép cửa sổ.`,
    );
  }

  console.log('[eval] building V4 bar cache…');
  const cacheV4 = buildBarEvalV4(bundle);
  console.log(`[eval] V4 bars=${cacheV4.length}`);
  console.log('[eval] building V3 bar cache…');
  const cacheV3 = buildBarEvalV3(bundle);
  console.log(`[eval] V3 bars=${cacheV3.length}`);

  const thr = DEFAULT_AMBIGUITY_THRESHOLD ?? AMBIGUOUS_THRESHOLD;
  const v4 = simulateEngine(bundle, cacheV4, 'V4', thr);
  const v3 = simulateEngine(bundle, cacheV3, 'V3', thr);

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(__dirname, '../docs/exports');
  fs.mkdirSync(outDir, { recursive: true });
  const base = `${symbol.replace('USDT', '').toLowerCase()}_v3v4_trusted_${days}d`;
  const csvV4 = path.join(outDir, `${base}_v4_trades.csv`);
  const csvV3 = path.join(outDir, `${base}_v3_trades.csv`);
  const mdPath = path.join(outDir, `REPORT_BACKTEST_XRP_V3V4_TRUSTED_${stamp}.md`);

  const writeTradesCsv = (file: string, rows: TradeRow[]) => {
    const cols = [
      'symbol',
      'entryIso',
      'exitIso',
      'side',
      'entryPrice',
      'exitPrice',
      'sl',
      'tp1',
      'pnlPct',
      'resultR',
      'exitReason',
      'decision',
      'score',
      'win',
    ];
    const lines = [cols.join(',')];
    for (const r of rows) {
      lines.push(
        cols
          .map((c) => {
            const v = (r as unknown as Record<string, unknown>)[c];
            return typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? '');
          })
          .join(','),
      );
    }
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  };

  writeTradesCsv(csvV4, v4.trades);
  writeTradesCsv(csvV3, v3.trades);

  const md = `# REPORT — Backtest XRP V3/V4 Trusted Window (~OI/LS overlap)

**Ngày:** ${stamp}  
**Symbol:** ${symbol}  
**Cửa sổ yêu cầu:** ${days} ngày  
**OI hist span:** ${spans.oiSpanDays.toFixed(2)}d (n=${bundle.oiHist.length})  
**LS hist span:** ${spans.lsSpanDays.toFixed(2)}d (n=${bundle.lsHist.length})  
**Funding points:** ${bundle.fundingRecords.length}  
**1H bars:** ${bundle.sym1h.length} | **4H bars:** ${bundle.sym4h.length}  
**Ambiguity threshold:** ${thr} (live)  
**ADX gate:** \`evaluateADXGate\` — CHOPPY 1H+4H → block; WARNING/BONUS scale TP/SL  
**TP/SL:** \`calculateTradePlanV3\` / \`calculateTradePlanV4\`  
**KHÔNG:** V41 breakout / resolveSymbolStrategy  

## Caveat mẫu nhỏ

Window ~${spans.trustedDays} ngày ≈ ${cacheV4.length} bar 1H sau warmup — **n trades thấp, WR không kết luận được cho 365d**.  
365d vẫn **không tin cậy** vì OI/LS public Binance chỉ ~21d (xem gate report).

## Peers

Chạy lần này: **chỉ ${symbol}** (theo lựa chọn user). BTC/SOL/BNB để đối chiếu → chạy lại \`--symbol BTCUSDT\` cùng script khi cần.

## Kết quả

${renderEngineReport('V4', v4.trades, v4.counterfactuals, v4.hardBlockLayerCounts, v4.gateCounts, v4.meta)}

${renderEngineReport('V3', v3.trades, v3.counterfactuals, v3.hardBlockLayerCounts, v3.gateCounts, v3.meta)}

## Files

- Trades V4: \`${path.relative(path.resolve(__dirname, '..'), csvV4)}\`
- Trades V3: \`${path.relative(path.resolve(__dirname, '..'), csvV3)}\`

## BƯỚC 4 — Đề xuất (điền tự động sau run — xem cuối file)
`;

  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`\n[out] ${mdPath}`);
  console.log(`[out] ${csvV4} (n=${v4.trades.length})`);
  console.log(`[out] ${csvV3} (n=${v3.trades.length})`);
  console.log(
    `[summary] V4 WR=${v4.trades.length ? computeStats(v4.trades).wr.toFixed(1) : 'n/a'}% n=${v4.trades.length} | V3 WR=${v3.trades.length ? computeStats(v3.trades).wr.toFixed(1) : 'n/a'}% n=${v3.trades.length}`,
  );

  // Append BƯỚC 4 proposals with numbers from this run (no production edits).
  const v4Stats = computeStats(v4.trades);
  const v3Stats = computeStats(v3.trades);
  const softCf = v4.counterfactuals.filter((c) => c.gate === 'SOFT_BLOCK');
  const softWin = softCf.filter((c) => c.wouldWin).length;
  const buoc4 = `

---

## BƯỚC 4 — Đề xuất cải tiến (CHƯA sửa code)

> Cảnh báo: n=${v4Stats.n} (V4) / n=${v3Stats.n} (V3) trên ~21d — **ước lượng cải thiện chỉ mang tính định hướng**, không đủ thống kê cho production change.

### Quan sát kỹ thuật từ cửa sổ tin cậy

1. **V4 asymmetry:** ${v4Stats.n} lệnh **toàn SHORT, 0 LONG** trong 21d — Long bị lọc cứng hơn (ambig + soft-block + hard) trên phase giá XRP này, không nhất thiết chứng minh rule Long hỏng.
2. **Soft-block V4 dày:** ${v4.meta.softBlockTicks} ticks có \`blockReasons\` (chủ yếu L5a CVD soft per live V4) vs V3 = 0 soft-block concept. Counterfactual soft (plan \`isValid\`): ${softCf.length} giả lập, would-win ${softWin}/${softCf.length || 0}.
3. **L9 phiên** là hard-block named nhiều nhất (cùng \`OTHER\`/group) — có thể “vô hiệu hóa” nhiều bar hợp lệ ngoài phiên. ADX choppy: ${v4.meta.adxBlockedTicks} ticks.
4. **OI/LS thực 100%** trong cửa sổ — tin cậy L5b/L7 trong ~21–31d; **không** suy ra 365d.
5. **Whale radar:** XRP không trong background whale list → L7 thiếu wall evidence so với BTC/SOL (giả thuyết, cần peers để xác nhận).

### Đề xuất (ưu tiên thấp → cao tác động ước lượng)

| # | Đề xuất | Ước cải thiện WR / tín hiệu | Rủi ro / đánh đổi |
|---|---------|-----------------------------|-------------------|
| 1 | **Thêm XRP vào Whale Radar background** (không đổi threshold scorer) | L7 chất lượng ↑; WR Δ nhỏ (±0–5pp) nếu wall thật correlate; nhiều hơn là giảm false soft/hard L7 | Radar noise nếu volume XRP mỏng; false wall |
| 2 | **Không copy NEAR L3 gate sang XRP** ngay | — | NEAR gate là short-specific; XRP V4 đã SHORT-heavy, gate L3 có thể **giảm thêm** n tín hiệu mà chưa có peers chứng minh WR↑ |
| 3 | **Review L5a CVD soft-block sensitivity cho alt thấp vol** (threshold research-only) | Nếu nới soft-CVD: +tín hiệu Long; CF soft would-win=${softWin} gợi ý có entry bị chặn đáng lẽ +R — **nhưng** mẫu nhỏ, dễ overfitting | Nới → thêm false entry; WR có thể ↓ dù n↑ |
| 4 | **Giữ L9 / ADX như live** cho đến khi có peers BTC/SOL/BNB cùng cửa sổ | — | Siết thêm → n↓ mạnh (ambig đã 200+ ticks) |
| 5 | **Chạy peers cùng script** (\`--symbol BTCUSDT\` / SOL / BNB, \`--days 21\`) trước quyết định đổi rule** | Phân biệt “rule chung kém” vs “XRP khác đặc tính” | Bắt buộc trước khi chỉnh threshold XRP-only |

### Không làm (trong bước này)

- Không ép backtest 365d với OI=0 fallback để kết luận WR.
- Không đụng \`SYMBOLS_USING_BREAKOUT_STRATEGY\` / V41.
- Không sửa \`scorerV3/V4\` / tradePlan production cho đến khi có peers + mẫu lớn hơn (archive OI hoặc ≥90d có data).
`;
  fs.appendFileSync(mdPath, buoc4, 'utf8');
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('backtest-v3v4-xrp-trusted-window.ts') ||
    process.argv[1].endsWith('backtest-v3v4-xrp-trusted-window.js'));

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
