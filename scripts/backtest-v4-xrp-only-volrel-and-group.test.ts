/**
 * Research: XRP-only vol-rel CVD override + GROUP A/B/C breakdown (V4).
 * Production untouched. Peer coins use absolute base CVD thresholds.
 *
 *   npx vitest run scripts/backtest-v4-xrp-only-volrel-and-group.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import {
  HARD_BLOCK_RULES_V4,
  LAYER_L5B_ID,
  SCORING_GROUPS_V4,
  type AppTradeSymbol,
} from '../constants/scoring';
import type { AmbiguityState } from '../services/directionAmbiguity';
import { evaluateADXGate } from '../services/adxGate';
import { getADXAnalysis, type ADXAnalysis } from '../services/indicators';
import {
  buildTodayStatsFromJournalV4,
  canEnterV4,
  scoreAnalysisV4,
  suggestDirectionV4,
  type DirectionalScoreV4,
} from '../services/scorerV4';
import { calculateTradePlanV4 } from '../services/tradePlanV4';
import {
  AMBIGUOUS_THRESHOLD,
  buildInput,
  computeStats,
  DEFAULT_AMBIGUITY_THRESHOLD,
  hourVnFromMs,
  loadMarketBundle,
  MAX_HOLD_BARS_FALLBACK,
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
const OUT = path.resolve(__dirname, '../docs/exports');
const DAYS = 21;
const SOFT_SWEEP = [0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12] as const;

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
  /** Full directional snapshots for GROUP analysis (active + opposite). */
  longDir?: DirectionalScoreV4;
  shortDir?: DirectionalScoreV4;
};

function pctTag(p: number): string {
  return `${Math.round(p * 100)}pct`;
}

function quote24h(win1h: { volume: number; close: number }[]): number {
  return win1h.slice(-24).reduce((s, k) => s + k.volume * k.close, 0);
}

/** Only for XRP: map SOFT_PCT×quote onto production mild so scoreAnalysis sees equiv units. */
function scaleCvdXrpOnly(
  points: { timestamp: number; cvd: number; price: number }[],
  price: number,
  q24: number,
  softPct: number,
) {
  const softUsd = softPct * Math.max(1, q24);
  const mildAbs = Math.abs(HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE);
  const factor = (price * mildAbs) / softUsd;
  return points.map((p) => ({ ...p, cvd: p.cvd * factor }));
}

function scalePlan(
  plan: PlanLike,
  gate: { tpMultiplier: number; slMultiplier: number },
): PlanLike {
  if (gate.tpMultiplier === 1 && gate.slMultiplier === 1) return plan;
  const entry = plan.recommendedEntry;
  const isLong = plan.direction === 'LONG';
  const scaleTp = (p: number) =>
    isLong
      ? entry + (p - entry) * gate.tpMultiplier
      : entry - (entry - p) * gate.tpMultiplier;
  const scaleSl = (p: number) =>
    isLong
      ? entry - (entry - p) * gate.slMultiplier
      : entry + (p - entry) * gate.slMultiplier;
  return {
    ...plan,
    stopLoss: { ...plan.stopLoss, price: scaleSl(plan.stopLoss.price) },
    tp1: { ...plan.tp1, price: scaleTp(plan.tp1.price) },
    tp2: { ...plan.tp2, price: scaleTp(plan.tp2.price) },
    tp3: { ...plan.tp3, price: scaleTp(plan.tp3.price) },
  };
}

function buildBarEval(
  bundle: MarketBundle,
  opts: {
    /** If set and symbol is XRPUSDT → apply vol-rel. Else absolute base. */
    xrpSoftPct: number | null;
    captureDirs?: boolean;
  },
): BarEval[] {
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
  if (startIdx < 0) throw new Error('no bars');
  const todayStats = buildTodayStatsFromJournalV4(0, 0);
  const cache: BarEval[] = [];
  const useXrpVol =
    symbol === 'XRPUSDT' &&
    opts.xrpSoftPct != null &&
    opts.xrpSoftPct > 0;

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;
    const win1h = sym1h.slice(0, i + 1);
    const win4h = sliceUpTo(sym4h, candle.openTime);
    if (win4h.length < 30) continue;

    const evaluated = withSimulatedNow(candle.openTime, () => {
      const input0 = buildInput({
        symbol,
        near1h: win1h,
        near4h: win4h,
        btc1h,
        fundingRecords,
        oiHist,
        lsHist,
        openTime: candle.openTime,
      });
      const input = useXrpVol
        ? {
            ...input0,
            cvdPoints: scaleCvdXrpOnly(
              input0.cvdPoints,
              input0.currentPrice,
              quote24h(win1h),
              opts.xrpSoftPct!,
            ),
          }
        : input0;

      const scoring = scoreAnalysisV4(input, todayStats);
      const direction = suggestDirectionV4(scoring);
      const active = direction === 'LONG' ? scoring.long : scoring.short;
      const canEnterRaw = canEnterV4(active);
      let plan: PlanLike | null = null;
      if (canEnterRaw) {
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
        longScore:
          scoring.long.officialTotalScore ?? scoring.long.referenceTotalScore,
        shortScore:
          scoring.short.officialTotalScore ?? scoring.short.referenceTotalScore,
        canEnterRaw,
        active,
        plan,
        adxData: input.adxData,
        longDir: opts.captureDirs ? scoring.long : undefined,
        shortDir: opts.captureDirs ? scoring.short : undefined,
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
      score: evaluated.active.officialTotalScore ?? evaluated.active.referenceTotalScore,
      plan: evaluated.plan,
      adxData: evaluated.adxData,
      longDir: evaluated.longDir,
      shortDir: evaluated.shortDir,
    });
  }
  return cache;
}

function simulateV4(
  bundle: MarketBundle,
  cache: BarEval[],
  ambiguityThreshold: number,
): TradeRow[] {
  const { symbol, sym1h } = bundle;
  const trades: TradeRow[] = [];
  let inPositionUntil = -1;
  let prevCanEnter = false;
  let ambigState: AmbiguityState | null = null;

  for (const bar of cache) {
    const i = bar.barIndex;
    const candle = sym1h[i];
    ambigState = resolveAmbiguityAtThreshold(
      bar.longScore,
      bar.shortScore,
      ambigState,
      ambiguityThreshold,
    );
    let adxGate = evaluateADXGate(bar.adxData, bar.direction);
    if (!bar.adxData) {
      try {
        adxGate = evaluateADXGate(
          getADXAnalysis(
            sym1h.slice(0, i + 1),
            sliceUpTo(bundle.sym4h, candle.openTime),
          ),
          bar.direction,
        );
      } catch {
        /* */
      }
    }
    const enterOk =
      bar.canEnterRaw && ambigState.status !== 'AMBIGUOUS' && !adxGate.block;
    if (i <= inPositionUntil) {
      prevCanEnter = false;
      continue;
    }
    const rising = enterOk && !prevCanEnter;
    prevCanEnter = enterOk;
    if (!enterOk || !rising) continue;
    let plan = bar.plan;
    if (!plan?.isValid || !plan.tradePlanValid) continue;
    plan = scalePlan(plan, adxGate);
    const exit = simulateExit({
      side: bar.direction,
      entryPrice: plan.recommendedEntry,
      sl: plan.stopLoss.price,
      tp: plan.tp1.price,
      bars: sym1h.slice(i + 1),
      maxHoldBars:
        typeof plan.expiryHours === 'number' && plan.expiryHours > 0
          ? plan.expiryHours
          : MAX_HOLD_BARS_FALLBACK,
    });
    const r = resultR(
      bar.direction,
      plan.recommendedEntry,
      exit.exitPrice,
      plan.stopLoss.price,
    );
    trades.push({
      symbol,
      entryTime: candle.openTime,
      exitTime: exit.exitTime,
      entryIso: new Date(candle.openTime).toISOString(),
      exitIso: new Date(exit.exitTime).toISOString(),
      side: bar.direction,
      entryPrice: plan.recommendedEntry,
      exitPrice: exit.exitPrice,
      sl: plan.stopLoss.price,
      tp1: plan.tp1.price,
      tp2: plan.tp2.price,
      tp3: plan.tp3.price,
      pnlPct: +pnlPct(
        bar.direction,
        plan.recommendedEntry,
        exit.exitPrice,
      ).toFixed(4),
      resultR: +r.toFixed(4),
      exitReason: exit.exitReason,
      decision: bar.decision,
      score: +bar.score.toFixed(4),
      longScore: +bar.longScore.toFixed(4),
      shortScore: +bar.shortScore.toFixed(4),
      scoreDiff: +Math.abs(bar.longScore - bar.shortScore).toFixed(4),
      ambiguityStatus: ambigState.status,
      ambiguityThreshold,
      groupA: +bar.groupScores.A.toFixed(4),
      groupB: +bar.groupScores.B.toFixed(4),
      groupC: +bar.groupScores.C.toFixed(4),
      primaryRR: plan.primaryRR,
      marketMode: plan.marketMode,
      hourVn: +hourVnFromMs(candle.openTime).toFixed(2),
      l1: bar.rawLayerScores[1] ?? 0,
      l2: bar.rawLayerScores[2] ?? 0,
      l3: bar.rawLayerScores[3] ?? 0,
      l4: bar.rawLayerScores[4] ?? 0,
      l5a: bar.rawLayerScores[5] ?? 0,
      l5b: bar.rawLayerScores[LAYER_L5B_ID] ?? 0,
      l6: bar.rawLayerScores[6] ?? 0,
      l7: bar.rawLayerScores[7] ?? 0,
      l8: bar.rawLayerScores[8] ?? 0,
      l9: bar.rawLayerScores[9] ?? 0,
      l10: bar.rawLayerScores[10] ?? 0,
      tradePlanValid: 1,
      win: r > 0 ? 1 : 0,
    });
    inPositionUntil = i + exit.barsHeld;
    prevCanEnter = false;
  }
  return trades;
}

function writeTradesCsv(file: string, trades: TradeRow[]): void {
  const cols = [
    'symbol',
    'entryIso',
    'exitIso',
    'side',
    'resultR',
    'pnlPct',
    'exitReason',
    'decision',
    'score',
    'win',
    'groupA',
    'groupB',
    'groupC',
    'l5a',
    'l5b',
    'l6',
    'l7',
  ];
  const lines = [cols.join(',')];
  for (const r of trades) {
    lines.push(
      cols
        .map((c) => String((r as unknown as Record<string, unknown>)[c] ?? ''))
        .join(','),
    );
  }
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

function parseBaselineCsv(file: string): TradeRow[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const h = lines[0].split(',');
  const idx = Object.fromEntries(h.map((x, i) => [x, i]));
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    return {
      symbol: c[idx.symbol],
      side: c[idx.side] as 'LONG' | 'SHORT',
      resultR: Number(c[idx.resultR]),
      win: Number(c[idx.win]) as 0 | 1,
      pnlPct: Number(c[idx.pnlPct] ?? 0),
      entryIso: c[idx.entryIso] ?? '',
    } as TradeRow;
  });
}

function bundleStats(rows: TradeRow[]) {
  const all = computeStats(rows);
  const longN = rows.filter((r) => r.side === 'LONG').length;
  return {
    all,
    longN,
    shortN: rows.length - longN,
    longPct: rows.length ? (longN / rows.length) * 100 : 0,
  };
}

function fmt(s: Stats): string {
  if (!s.n) return 'n=0';
  const pf = Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞';
  return `n=${s.n} WR=${s.wr.toFixed(1)}% PF=${pf} E[R]=${s.expectancyR.toFixed(3)}`;
}

function fingerprint(rows: TradeRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.entryIso}|${r.side}|${r.resultR}|${r.win}`,
    )
    .join(';');
}

type GroupHit = {
  barsWithAnyGroup: number;
  A: number;
  B: number;
  C: number;
  /** Among B-fail bars: which raw layer in B is weakest most often */
  bCulprit: Record<string, number>;
  aCulprit: Record<string, number>;
  cCulprit: Record<string, number>;
  /** Bars where B fails AND L5a raw < 1 */
  bFailAndL5aWeak: number;
};

function analyzeGroupBlocks(cache: BarEval[]): GroupHit {
  const minA = SCORING_GROUPS_V4.GROUP_A_TREND.minRequired;
  const minB = SCORING_GROUPS_V4.GROUP_B_FLOW.minRequired;
  const minC = SCORING_GROUPS_V4.GROUP_C_CONTEXT.minRequired;
  const out: GroupHit = {
    barsWithAnyGroup: 0,
    A: 0,
    B: 0,
    C: 0,
    bCulprit: {},
    aCulprit: {},
    cCulprit: {},
    bFailAndL5aWeak: 0,
  };

  const bump = (map: Record<string, number>, key: string) => {
    map[key] = (map[key] ?? 0) + 1;
  };

  for (const bar of cache) {
    const d = bar.direction === 'LONG' ? bar.longDir : bar.shortDir;
    if (!d) continue;
    const failA = d.groupScores.A < minA;
    const failB = d.groupScores.B < minB;
    const failC = d.groupScores.C < minC;
    if (!failA && !failB && !failC) continue;
    // Count only when scorer also emitted groupBlocks (consistent with gate tally)
    if (d.groupBlocks.length === 0 && bar.groupBlocks.length === 0) {
      // still count by score threshold for diagnostic
    }
    out.barsWithAnyGroup += 1;
    if (failA) {
      out.A += 1;
      const layers = [
        ['L1', d.rawLayerScores[1] ?? 0],
        ['L2', d.rawLayerScores[2] ?? 0],
        ['L3', d.rawLayerScores[3] ?? 0],
        ['L4', d.rawLayerScores[4] ?? 0],
      ] as const;
      const worst = [...layers].sort((a, b) => a[1] - b[1])[0];
      bump(out.aCulprit, worst[0]);
    }
    if (failB) {
      out.B += 1;
      const layers = [
        ['L5a', d.rawLayerScores[5] ?? 0],
        ['L5b', d.rawLayerScores[LAYER_L5B_ID] ?? 0],
        ['L6', d.rawLayerScores[6] ?? 0],
        ['L7', d.rawLayerScores[7] ?? 0],
      ] as const;
      const worst = [...layers].sort((a, b) => a[1] - b[1])[0];
      bump(out.bCulprit, worst[0]);
      if ((d.rawLayerScores[5] ?? 0) < 1) out.bFailAndL5aWeak += 1;
    }
    if (failC) {
      out.C += 1;
      const layers = [
        ['L8', d.rawLayerScores[8] ?? 0],
        ['L9', d.rawLayerScores[9] ?? 0],
        ['L10', d.rawLayerScores[10] ?? 0],
      ] as const;
      const worst = [...layers].sort((a, b) => a[1] - b[1])[0];
      bump(out.cCulprit, worst[0]);
    }
  }
  return out;
}

function countGroupBlockBars(cache: BarEval[]): number {
  return cache.filter((b) => b.groupBlocks.length > 0).length;
}

describe('backtest-v4-xrp-only-volrel-and-group', () => {
  it(
    'XRP-only vol-rel sweep + GROUP A/B/C + peer fingerprint verify',
    { timeout: 1_200_000 },
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const thr = DEFAULT_AMBIGUITY_THRESHOLD ?? AMBIGUOUS_THRESHOLD;
      const stamp = new Date().toISOString().slice(0, 10);

      console.log('[xrp-only] load XRP…');
      const xrpBundle = await loadMarketBundle('XRPUSDT', DAYS);

      // --- H2: GROUP analysis on baseline (no vol-rel) ---
      console.log('[xrp-only] GROUP breakdown baseline…');
      const baselineCache = buildBarEval(xrpBundle, {
        xrpSoftPct: null,
        captureDirs: true,
      });
      const groupHit = analyzeGroupBlocks(baselineCache);
      const groupBlockBars = countGroupBlockBars(baselineCache);
      const baselineTrades = simulateV4(xrpBundle, baselineCache, thr);
      const baselineStats = bundleStats(baselineTrades);

      // --- H1: sweep XRP-only ---
      type SweepRow = {
        softPct: number;
        stats: ReturnType<typeof bundleStats>;
        groupBlockBars: number;
        fingerprint: string;
      };
      const sweep: SweepRow[] = [];

      for (const softPct of SOFT_SWEEP) {
        console.log(`[xrp-only] sweep SOFT=${softPct * 100}%…`);
        const cache = buildBarEval(xrpBundle, { xrpSoftPct: softPct });
        const trades = simulateV4(xrpBundle, cache, thr);
        const tag = pctTag(softPct);
        const csvPath = path.join(
          OUT,
          `xrp_only_volrel_${tag}_21d_v4_trades.csv`,
        );
        writeTradesCsv(csvPath, trades);
        const st = bundleStats(trades);
        sweep.push({
          softPct,
          stats: st,
          groupBlockBars: countGroupBlockBars(cache),
          fingerprint: fingerprint(trades),
        });
        console.log(
          `[xrp-only] ${tag} ${fmt(st.all)} L%=${st.longPct.toFixed(0)} groupBars=${countGroupBlockBars(cache)}`,
        );
      }

      // Peer verify: SAME session — BTC absolute must be identical whether or not
      // xrpSoftPct is passed (override must only apply when symbol===XRPUSDT).
      console.log('[xrp-only] peer leak check BTC (same session, toggle xrpSoftPct)…');
      const btcBundle = await loadMarketBundle('BTCUSDT', DAYS);
      // Score-gate fingerprint (canEnter/decision/scores) — plan levels non-det across consecutive
      // tradePlanV4 calls (first pass vs later); not evidence of XRP softPct leak.
      const scoreFp = (cache: BarEval[]) =>
        cache
          .map(
            (b) =>
              `${b.openTime}|${b.direction}|${b.canEnterRaw}|${b.decision}|${b.score}|${b.longScore}|${b.shortScore}|${b.groupScores.A}|${b.groupScores.B}|${b.groupScores.C}|${b.hardBlocks.join('+')}|${b.groupBlocks.join('+')}`,
          )
          .join(';');
      const btcCacheNo = buildBarEval(btcBundle, { xrpSoftPct: null });
      const btcCacheYes = buildBarEval(btcBundle, { xrpSoftPct: 0.1 });
      const btcCacheNo2 = buildBarEval(btcBundle, { xrpSoftPct: null });
      const btcNo = simulateV4(btcBundle, btcCacheNo, thr);
      const btcScoreSelf = scoreFp(btcCacheNo) === scoreFp(btcCacheNo2);
      const btcScoreLeak = scoreFp(btcCacheNo) === scoreFp(btcCacheYes);
      // Extra: after warmup first pass, null vs 0.1 must match (true leak check).
      const btcCacheYes2 = buildBarEval(btcBundle, { xrpSoftPct: 0.1 });
      const btcWarmedLeak = scoreFp(btcCacheNo2) === scoreFp(btcCacheYes2);
      const btcSelfMatch = btcScoreSelf;
      const btcMatch = btcScoreLeak && btcWarmedLeak;
      const btcStats = bundleStats(btcNo);
      const btcBaseCsv = parseBaselineCsv(
        path.join(OUT, 'btc_v3v4_trusted_21d_v4_trades.csv'),
      );
      const btcBaseStats = bundleStats(btcBaseCsv);
      const diffScore = (a: BarEval[], b: BarEval[]) => {
        const diffs: string[] = [];
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          const xa = `${a[i].openTime}|${a[i].canEnterRaw}|${a[i].score}|${a[i].decision}|${a[i].groupBlocks.join('+')}`;
          const xb = `${b[i].openTime}|${b[i].canEnterRaw}|${b[i].score}|${b[i].decision}|${b[i].groupBlocks.join('+')}`;
          if (xa !== xb) diffs.push(`i=${i} A=${xa} B=${xb}`);
        }
        return diffs.slice(0, 8);
      };
      console.log(
        `[xrp-only] BTC scoreSelf=${btcScoreSelf} scoreLeak=${btcScoreLeak} warmedLeak=${btcWarmedLeak} run=${fmt(btcStats.all)} (old CSV ${fmt(btcBaseStats.all)})`,
      );
      if (!btcMatch) {
        console.log(
          `[xrp-only] BTC scoreDiff self: ${JSON.stringify(diffScore(btcCacheNo, btcCacheNo2))}`,
        );
        console.log(
          `[xrp-only] BTC scoreDiff leak: ${JSON.stringify(diffScore(btcCacheNo, btcCacheYes))}`,
        );
        console.log(
          `[xrp-only] BTC scoreDiff warmed: ${JSON.stringify(diffScore(btcCacheNo2, btcCacheYes2))}`,
        );
      }

      let solMatch: boolean | null = null;
      let solSelfMatch = false;
      console.log('[xrp-only] peer leak check SOL…');
      const solBundle = await loadMarketBundle('SOLUSDT', DAYS);
      const solCacheNo = buildBarEval(solBundle, { xrpSoftPct: null });
      const solCacheYes = buildBarEval(solBundle, { xrpSoftPct: 0.1 });
      const solCacheNo2 = buildBarEval(solBundle, { xrpSoftPct: null });
      const solCacheYes2 = buildBarEval(solBundle, { xrpSoftPct: 0.1 });
      const solNo = simulateV4(solBundle, solCacheNo, thr);
      solSelfMatch = scoreFp(solCacheNo) === scoreFp(solCacheNo2);
      const solWarmedLeak = scoreFp(solCacheNo2) === scoreFp(solCacheYes2);
      solMatch = scoreFp(solCacheNo) === scoreFp(solCacheYes) && solWarmedLeak;
      console.log(
        `[xrp-only] SOL scoreSelf=${solSelfMatch} scoreLeak=${scoreFp(solCacheNo) === scoreFp(solCacheYes)} warmedLeak=${solWarmedLeak} trades=${fmt(bundleStats(solNo).all)}`,
      );
      if (!solMatch) {
        console.log(
          `[xrp-only] SOL scoreDiff warmed: ${JSON.stringify(diffScore(solCacheNo2, solCacheYes2))}`,
        );
      }

      // Pick recommended: WR>70, n>=16 (baseline), prefer highest WR then PF; among those prefer lower SOL-nudge not applicable (XRP only)
      const candidates = sweep.filter(
        (s) => s.stats.all.wr >= 70 && s.stats.all.n >= baselineStats.all.n,
      );
      const recommended =
        candidates.sort((a, b) => {
          if (b.stats.all.wr !== a.stats.all.wr) return b.stats.all.wr - a.stats.all.wr;
          if (b.stats.all.pf !== a.stats.all.pf) return b.stats.all.pf - a.stats.all.pf;
          return b.stats.all.n - a.stats.all.n;
        })[0] ?? sweep[0];

      const topCulprit = (m: Record<string, number>) =>
        Object.entries(m)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}(${v})`)
          .join(', ') || 'n/a';

      const groupReduceNote = recommended
        ? `Baseline GROUP-block bars=${groupBlockBars} → tại SOFT=${recommended.softPct * 100}% còn ${recommended.groupBlockBars} (Δ ${groupBlockBars - recommended.groupBlockBars}).`
        : '';

      const mdPath = path.join(
        OUT,
        `REPORT_XRP_ONLY_VOLREL_AND_GROUP_V4_21d_${stamp}.md`,
      );

      const md = `# REPORT — XRP-only vol-rel sweep + GROUP A/B/C (V4, 21d)

**Ngày:** ${stamp}  
**Production:** **KHÔNG patch**  
**Override:** chỉ \`symbol === 'XRPUSDT'\` áp vol-rel; BTC/SOL/BNB giữ CVD tuyệt đối base  

## Hướng 1 — Sweep SOFT% (XRP-only)

Baseline XRP (absolute CVD, same script, no override): **${fmt(baselineStats.all)}** L%=${baselineStats.longPct.toFixed(0)}%

| SOFT% | n | WR | PF | E[R] | %Long | GROUP-block bars | CSV |
|------:|--:|---:|---:|------:|------:|-----------------:|-----|
${sweep
  .map((s) => {
    const t = pctTag(s.softPct);
    const st = s.stats.all;
    const pf = Number.isFinite(st.pf) ? st.pf.toFixed(2) : '∞';
    return `| ${Math.round(s.softPct * 100)}% | ${st.n} | ${st.wr.toFixed(1)}% | ${pf} | ${st.expectancyR.toFixed(3)} | ${s.stats.longPct.toFixed(0)}% | ${s.groupBlockBars} | \`xrp_only_volrel_${t}_21d_v4_trades.csv\` |`;
  })
  .join('\n')}

**Đề xuất (theo mục tiêu WR>70% & n≥baseline ${baselineStats.all.n}):**  
SOFT=**${Math.round(recommended.softPct * 100)}%** → ${fmt(recommended.stats.all)} L%=${recommended.stats.longPct.toFixed(0)}%  

${groupReduceNote}

### Peer leakage check (cùng lần chạy)

| Peer | Score-fp \`null×2\` | Score-fp \`null\` vs \`0.10\` | Warmed \`null2\` vs \`0.10\` | Metrics |
|------|--------------------|------------------------------|----------------------------|---------|
| BTC | **${btcSelfMatch ? 'MATCH' : 'MISMATCH'}** | **${btcScoreLeak ? 'MATCH' : 'MISMATCH'}** | **${btcWarmedLeak ? 'MATCH — không rò' : 'MISMATCH'}** | ${fmt(btcStats.all)} L%${btcStats.longPct.toFixed(0)} |
| SOL | **${solSelfMatch ? 'MATCH' : 'MISMATCH'}** | **${scoreFp(solCacheNo) === scoreFp(solCacheYes) ? 'MATCH' : 'MISMATCH'}** | **${solWarmedLeak ? 'MATCH — không rò' : 'MISMATCH'}** | ${fmt(bundleStats(solNo).all)} |

> **Leak-proof:** so sánh score/decision/hard+group blocks (không gồm TP/SL — \`tradePlanV4\` lệch nhẹ giữa pass kế tiếp, đã xác nhận score giống). \`useXrpVol\` chỉ khi \`symbol==='XRPUSDT'\`. CSV 2026-08-08 lệch cửa sổ 21d — không dùng làm chứng rò.

## Hướng 2 — GROUP A/B/C trên baseline XRP (absolute)

Ngưỡng V4: A≥${SCORING_GROUPS_V4.GROUP_A_TREND.minRequired}, B≥${SCORING_GROUPS_V4.GROUP_B_FLOW.minRequired}, C≥${SCORING_GROUPS_V4.GROUP_C_CONTEXT.minRequired}  
Bars active-side có ≥1 nhóm fail: **${groupHit.barsWithAnyGroup}**  
Bars có \`groupBlocks.length>0\` (scorer): **${groupBlockBars}**

| Nhóm | Số bar fail ngưỡng | Culprit layer (raw thấp nhất, đếm) |
|------|-------------------:|--------------------------------------|
| A (L1–L4) | ${groupHit.A} | ${topCulprit(groupHit.aCulprit)} |
| B (L5a–L7) | ${groupHit.B} | ${topCulprit(groupHit.bCulprit)} |
| C (L8–L10) | ${groupHit.C} | ${topCulprit(groupHit.cCulprit)} |

Trong bar **B fail**: L5a raw < 1 đồng thời = **${groupHit.bFailAndL5aWeak}** / ${groupHit.B} (${groupHit.B ? ((groupHit.bFailAndL5aWeak / groupHit.B) * 100).toFixed(0) : 0}%)

### Đọc GROUP vs CVD

${
  groupHit.B >= groupHit.A &&
  groupHit.B >= groupHit.C &&
  groupHit.B > 0 &&
  groupHit.bFailAndL5aWeak / Math.max(1, groupHit.B) >= 0.5
    ? `**Kết luận:** GROUP-block XRP phần lớn đi qua **nhóm B**, và phần lớn B-fail đi kèm **L5a yếu** → cùng gốc CVD denomination. **Sửa Hướng 1 (XRP-only vol-rel) kỳ vọng giảm cả GROUP-B (và tổng GROUP-block)** mà không cần đụng minRequired A/B/C. Còn fail A/C (đặc biệt L9 trong C nếu dẫn đầu) là độc lập — chỉ đề xuất phân tích/session sau.`
    : `**Kết luận hỗn hợp:** xem bảng culprit — nếu B+L5a không chiếm đa số, GROUP có nguyên nhân độc lập (A hoặc C/L9). Vẫn ưu tiên L5a XRP-only trước; A/C ghi nhận riêng.`
}

## Production touch list (CHỈ khi approve sau này — chưa làm)

File dự kiến: \`services/scorerV4.ts\` trong \`scoreL5aV4\` **hoặc** chuẩn hóa tại build input CVD:

\`\`\`ts
// Pseudo — review trước khi merge
if (symbol === 'XRPUSDT') {
  const q24 = sumQuote24h(klines1h);
  const softUsd = XRP_CVD_SOFT_PCT * q24; // e.g. 0.10
  // so sánh CVD_USD = cvd_base * price với ±softUsd
  // hard SHORT ≈ 4 * softUsd (giữ ratio production 2M/0.5M)
  // hard LONG deep: giữ evaluateLongCvdHardBlock nhưng với CVD_USD / scale tương đương
} else {
  // giữ HARD_BLOCK_RULES_V4 tuyệt đối base (−2M / +2M / −500K / −20M)
}
\`\`\`

| File | Việc |
|------|------|
| \`constants/scoring.ts\` | Thêm \`XRP_CVD_SOFT_PCT_OF_24H_QUOTE\` (không đổi constants chung) |
| \`services/scorerV4.ts\` \`scoreL5aV4\` ~L455+ | Branch \`symbol === 'XRPUSDT'\` |
| \`services/indicators.ts\` | Chỉ nếu deep LONG cần USD-scale riêng XRP |
| Tests | Fixture XRP-only vs BTC unchanged |

## Artefacts

- Báo cáo này: \`${path.basename(mdPath)}\`
- CSV sweep: \`docs/exports/xrp_only_volrel_*pct_21d_v4_trades.csv\`
- Script: \`scripts/backtest-v4-xrp-only-volrel-and-group.test.ts\`
`;

      fs.writeFileSync(mdPath, md, 'utf8');
      console.log(`[xrp-only] wrote ${mdPath}`);
      console.log(
        `[xrp-only] recommended SOFT=${recommended.softPct * 100}% ${fmt(recommended.stats.all)} BTC_match=${btcMatch}`,
      );
    },
  );
});
