/**
 * Vòng Adjust — mild_only: soft ±500K/steep theo CVD_USD × SOFT_K;
 * hard Short/Long-deep theo CVD_USD × HARD_K (=1 full).
 * KHÔNG sửa production.
 *
 *   npx vitest run scripts/backtest-v4-cvd-usd-mild-only.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { DEFAULT_INITIAL_CAPITAL } from '../constants/capitalManagement';
import {
  HARD_BLOCK_RULES_V4,
  LAYER_L5B_ID,
  type AppTradeSymbol,
} from '../constants/scoring';
import type { AmbiguityState } from '../services/directionAmbiguity';
import { evaluateADXGate } from '../services/adxGate';
import {
  analyzeCVD,
  applyRecoveringCvdLocalPenalty,
  buildCVDPointsFromKlines,
  evaluateLongCvdHardBlock,
  getADXAnalysis,
  getEMAAnalysisV3,
  type ADXAnalysis,
  type CVDPoint,
} from '../services/indicators';
import { MARKET_KLINE_LIMIT } from '../services/marketAnalysisFetch';
import {
  buildTodayStatsFromJournalV4,
  canEnterV4,
  scoreAnalysisV4,
  suggestDirectionV4,
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
const SYMBOLS: AppTradeSymbol[] = ['XRPUSDT', 'BTCUSDT', 'SOLUSDT', 'BNBUSDT'];
const DAYS = 21;

/** Soft thắt hơn full-USD: T_soft_USD = T_base × BTC_REF × SOFT_K */
const SOFT_K = 0.1;
/** Hard Short / deep Long: T_hard_USD = T_base × BTC_REF × HARD_K */
const HARD_K = 1.0;
const CVD_DEEP_BASE = -20_000_000;
const CVD_MOM_REC_BASE = 3_000_000;
const CVD_MOM_BEAR_BASE = -3_000_000;

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

function scalePlanByAdx(
  plan: PlanLike,
  gate: { tpMultiplier: number; slMultiplier: number },
): PlanLike {
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

function toBtcEquiv(points: CVDPoint[], price: number, btcRef: number): CVDPoint[] {
  const scale = btcRef > 0 ? price / btcRef : 1;
  return points.map((p) => ({ ...p, cvd: p.cvd * scale }));
}

function cvdDelta(points: CVDPoint[], lookback = 12): number {
  if (points.length < 2) return 0;
  const recent = points.slice(-Math.min(lookback, points.length));
  return recent[recent.length - 1].cvd - recent[0].cvd;
}

/**
 * L5a fork — soft thresholds × SOFT_K, hard × HARD_K, trên CVD đã BTC-equiv
 * (cvd' = CVD_base × price/BTC_REF).
 */
function scoreL5aMildOnly(
  direction: 'LONG' | 'SHORT',
  pointsBtcEq: CVDPoint[],
  ctx: { currentPrice: number; ema20: number },
): { score: number; hardBlock: string | null; reason: string } {
  const currentCvd = pointsBtcEq.length ? pointsBtcEq[pointsBtcEq.length - 1].cvd : 0;
  const analysis = analyzeCVD(pointsBtcEq, direction);
  const delta = cvdDelta(pointsBtcEq);
  const mildNeg = HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE * SOFT_K;
  const mildPos = HARD_BLOCK_RULES_V4.CVD_MILD_POSITIVE * SOFT_K;
  const steep = HARD_BLOCK_RULES_V4.CVD_STEEP_SLOPE_DELTA * SOFT_K;
  const shortHard = HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK * HARD_K;
  const deep = CVD_DEEP_BASE * HARD_K;
  const momRec = CVD_MOM_REC_BASE * HARD_K;
  const momBear = CVD_MOM_BEAR_BASE * HARD_K;

  // Hard LONG: mirror evaluateLongCvdHardBlock with scaled deep/momentum
  if (direction === 'LONG') {
    const deepNeg = currentCvd < deep;
    const strongBear = deepNeg && analysis.cvdMomentum24h < momBear;
    // recovering check unused for hard
    void momRec;
    if (strongBear && ctx.currentPrice < ctx.ema20) {
      return {
        score: 0,
        hardBlock: 'CVD deeply negative and still deteriorating. (USD mild_only)',
        reason: `CVD ${currentCvd.toFixed(0)} HARD LONG`,
      };
    }
  }
  if (direction === 'SHORT' && currentCvd > shortHard) {
    return {
      score: 0,
      hardBlock: `CVD +${(currentCvd / 1e6).toFixed(2)}M > hard SHORT (USD×HARD_K)`,
      reason: 'HARD SHORT',
    };
  }

  const steepNeg = delta <= -steep;
  const steepPos = delta >= steep;
  let score = 0;
  let reason = '';

  if (direction === 'LONG') {
    if (currentCvd > 0 && analysis.slope === 'up') {
      score = 2;
      reason = 'CVD+ slope up';
    } else if (
      currentCvd >= mildNeg &&
      currentCvd <= 0 &&
      (analysis.slope === 'up' || delta > 0)
    ) {
      score = 1;
      reason = 'CVD mild neg improving';
    } else if (currentCvd < mildNeg || (analysis.slope === 'down' && steepNeg)) {
      score = 0;
      reason = 'CVD soft fail LONG';
    } else {
      score = 0;
      reason = 'CVD insufficient LONG';
    }
  } else if (currentCvd < 0 && analysis.slope === 'down') {
    score = 2;
    reason = 'CVD- slope down';
  } else if (
    currentCvd >= 0 &&
    currentCvd <= mildPos &&
    (analysis.slope === 'down' || delta < 0)
  ) {
    score = 1;
    reason = 'CVD mild pos weakening';
  } else if (currentCvd > mildPos || (analysis.slope === 'up' && steepPos)) {
    score = 0;
    reason = 'CVD soft fail SHORT';
  } else {
    score = 0;
    reason = 'CVD insufficient SHORT';
  }

  const rec = applyRecoveringCvdLocalPenalty(
    score,
    currentCvd,
    analysis.cvdMomentum24h,
  );
  // Recovering uses deep −20M unscaled in classify — with BTC-equiv, rare for alts after scale.
  score = rec.score;

  // Also mirror evaluateLongCvdHardBlock on BTC-equiv with production deep (−20M) × HARD_K
  // already done; optionally call production helper on scaled points:
  const hb = evaluateLongCvdHardBlock({
    currentCvd,
    cvdMomentum24h: analysis.cvdMomentum24h,
    currentPrice: ctx.currentPrice,
    ema20: ctx.ema20,
  });
  // production helper uses −20M absolute on scaled CVD — with HARD_K=1 matches deep above.
  if (direction === 'LONG' && hb) {
    return { score: 0, hardBlock: hb + ' (equiv)', reason: 'HARD LONG' };
  }

  return { score, hardBlock: null, reason };
}

function buildInputScaled(
  params: Parameters<typeof buildInput>[0],
  btcRef: number,
) {
  const input = buildInput(params);
  const scale = btcRef > 0 ? input.currentPrice / btcRef : 1;
  return {
    ...input,
    cvdPoints: input.cvdPoints.map((p) => ({ ...p, cvd: p.cvd * scale })),
  };
}

function buildBarEvalMildOnly(bundle: MarketBundle, btcRef: number): BarEval[] {
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

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;
    const win1h = sym1h.slice(0, i + 1);
    const win4h = sliceUpTo(sym4h, candle.openTime);
    if (win4h.length < 30) continue;

    const evaluated = withSimulatedNow(candle.openTime, () => {
      // Full score with BTC-equiv CVD (HARD_K=1 / soft as production ratios)
      const inputScaled = buildInputScaled(
        {
          symbol,
          near1h: win1h,
          near4h: win4h,
          btc1h,
          fundingRecords,
          oiHist,
          lsHist,
          openTime: candle.openTime,
        },
        btcRef,
      );
      const scoring = scoreAnalysisV4(inputScaled, todayStats);
      const direction = suggestDirectionV4(scoring);
      const active = direction === 'LONG' ? scoring.long : scoring.short;

      // Override L5a with mild_only softK
      const cvdSlice =
        win1h.length > MARKET_KLINE_LIMIT
          ? win1h.slice(-MARKET_KLINE_LIMIT)
          : win1h;
      const basePts = buildCVDPointsFromKlines(cvdSlice);
      const ptsEq = toBtcEquiv(basePts, inputScaled.currentPrice, btcRef);
      const ema = getEMAAnalysisV3(cvdSlice);
      const l5a = scoreL5aMildOnly(direction, ptsEq, {
        currentPrice: inputScaled.currentPrice,
        ema20: ema.ema20,
      });

      // Rebuild canEnter: strip old L5a CVD blocks, apply mild_only
      const hardBlocks = active.hardBlocks.filter(
        (h) =>
          !/CVD|deeply negative/i.test(h) &&
          !h.includes('chặn Short hoàn toàn'),
      );
      const blockReasons = active.blockReasons.filter(
        (b) => !b.startsWith('L5a CVD'),
      );
      if (l5a.hardBlock) hardBlocks.push(l5a.hardBlock);
      if (l5a.score < 1 && !l5a.hardBlock) {
        blockReasons.push(`L5a CVD chưa đủ 1đ — ${l5a.reason} (mild_only SOFT_K=${SOFT_K})`);
      }

      const patched = {
        ...active,
        hardBlocks,
        blockReasons,
        rawLayerScores: { ...active.rawLayerScores, 5: l5a.score },
      };
      const canEnterRaw = canEnterV4(patched);

      let plan: PlanLike | null = null;
      if (canEnterRaw) {
        const p = calculateTradePlanV4(
          symbol,
          inputScaled.currentPrice,
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
        active: patched,
        plan,
        adxData: inputScaled.adxData,
        score:
          patched.officialTotalScore ?? patched.referenceTotalScore,
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
      score: evaluated.score,
      plan: evaluated.plan,
      adxData: evaluated.adxData,
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
    plan = scalePlanByAdx(plan, adxGate);
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
      pnlPct: +pnlPct(bar.direction, plan.recommendedEntry, exit.exitPrice).toFixed(4),
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

function parseCsv(file: string): TradeRow[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return {
      symbol: row.symbol,
      side: row.side as 'LONG' | 'SHORT',
      resultR: Number(row.resultR),
      win: Number(row.win) as 0 | 1,
      pnlPct: Number(row.pnlPct),
    } as TradeRow;
  });
}

function statsOf(rows: TradeRow[]) {
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

describe('backtest-v4-cvd-usd-mild-only', () => {
  it(
    'mild_only SOFT_K=0.1 HARD_K=1 vs base + full USD',
    { timeout: 1_200_000 },
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const thr = DEFAULT_AMBIGUITY_THRESHOLD ?? AMBIGUOUS_THRESHOLD;

      const btcBundle = await loadMarketBundle('BTCUSDT', DAYS);
      const winBars = btcBundle.sym1h.filter(
        (k) =>
          k.openTime >= btcBundle.windowStartMs &&
          k.openTime <= btcBundle.endMs,
      );
      const btcRef =
        winBars.reduce((s, k) => s + k.close, 0) / Math.max(1, winBars.length);
      console.log(`[mild] BTC_REF=${btcRef.toFixed(2)} SOFT_K=${SOFT_K} HARD_K=${HARD_K}`);

      type Row = {
        symbol: AppTradeSymbol;
        base: ReturnType<typeof statsOf>;
        full: ReturnType<typeof statsOf>;
        mild: ReturnType<typeof statsOf>;
      };
      const rows: Row[] = [];

      for (const symbol of SYMBOLS) {
        console.log(`[mild] ${symbol}…`);
        const bundle =
          symbol === 'BTCUSDT' ? btcBundle : await loadMarketBundle(symbol, DAYS);
        const short = symbol.replace('USDT', '').toLowerCase();
        const base = statsOf(
          parseCsv(path.join(OUT, `${short}_v3v4_trusted_${DAYS}d_v4_trades.csv`)),
        );
        const full = statsOf(
          parseCsv(path.join(OUT, `${short}_v4_cvd_usd_exp_${DAYS}d_trades.csv`)),
        );
        const trades = simulateV4(
          bundle,
          buildBarEvalMildOnly(bundle, btcRef),
          thr,
        );
        const mildPath = path.join(
          OUT,
          `${short}_v4_cvd_usd_mild_k${SOFT_K}_${DAYS}d_trades.csv`,
        );
        const cols = [
          'symbol',
          'entryIso',
          'side',
          'resultR',
          'exitReason',
          'win',
        ];
        fs.writeFileSync(
          mildPath,
          [
            cols.join(','),
            ...trades.map((r) =>
              cols
                .map((c) => String((r as unknown as Record<string, unknown>)[c] ?? ''))
                .join(','),
            ),
          ].join('\n'),
          'utf8',
        );
        const mild = statsOf(trades);
        rows.push({ symbol, base, full, mild });
        console.log(
          `[mild] ${symbol} base L%=${base.longPct.toFixed(0)} | full L%=${full.longPct.toFixed(0)} | mild L%=${mild.longPct.toFixed(0)} WR ${mild.all.wr.toFixed(1)}%`,
        );
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const mdPath = path.join(
        OUT,
        `REPORT_EXPERIMENT_CVD_USD_MILD_ONLY_21d_${stamp}.md`,
      );
      const names = SYMBOLS.map((s) => s.replace('USDT', ''));
      const btc = rows.find((r) => r.symbol === 'BTCUSDT')!;
      const xrp = rows.find((r) => r.symbol === 'XRPUSDT')!;

      let hint: string;
      if (btc.mild.all.wr < btc.base.all.wr - 5) {
        hint = '**Không recommend** — BTC WR mild↓ >5pp.';
      } else if (
        xrp.mild.longPct >= 15 &&
        btc.mild.all.wr >= btc.base.all.wr - 5
      ) {
        hint =
          '**Có thể cân nhắc approve mild_only** (SOFT_K=0.1, HARD_K=1) — XRP Long% cải thiện, BTC ổn. Bạn xác nhận trước khi patch.';
      } else {
        hint = '**Xem bảng** — kết quả trung gian giữa base và full USD.';
      }

      const md = `# EXPERIMENT Adjust — CVD_USD mild_only (SOFT_K=${SOFT_K}, HARD_K=${HARD_K})

**Ngày:** ${stamp}  
**BTC_REF:** ${btcRef.toFixed(2)}  
**Công thức:** CVD' = CVD_base × (price/BTC_REF); soft so \`T_base×SOFT_K\`; hard so \`T_base×HARD_K\`  
**KHÔNG sửa production**

## So sánh 3 biến thể (V4, 21d)

| Metric | ${names.join(' | ')} |
|--------|${names.map(() => '---').join('|')}|
| Base n/WR | ${rows.map((r) => fmt(r.base.all)).join(' | ')} |
| Full USD n/WR | ${rows.map((r) => fmt(r.full.all)).join(' | ')} |
| **Mild_only** n/WR | ${rows.map((r) => fmt(r.mild.all)).join(' | ')} |
| Base %Long | ${rows.map((r) => `${r.base.longPct.toFixed(0)}%`).join(' | ')} |
| Full %Long | ${rows.map((r) => `${r.full.longPct.toFixed(0)}%`).join(' | ')} |
| **Mild %Long** | ${rows.map((r) => `${r.mild.longPct.toFixed(0)}%`).join(' | ')} |

## Đọc nhanh

- XRP Long%: base ${xrp.base.longPct.toFixed(0)}% → full ${xrp.full.longPct.toFixed(0)}% → **mild ${xrp.mild.longPct.toFixed(0)}%**
- BTC WR: ${btc.base.all.wr.toFixed(1)} → full ${btc.full.all.wr.toFixed(1)} → **mild ${btc.mild.all.wr.toFixed(1)}**

## Gợi ý

${hint}

Nếu approve production theo mild_only: soft constants × BTC_REF × ${SOFT_K}; hard × BTC_REF × ${HARD_K}.  
File touch list giữ như báo cáo full USD + fork L5a soft/hard multipliers.

## Artefacts

- \`*_v4_cvd_usd_mild_k${SOFT_K}_21d_trades.csv\`
- Full: \`REPORT_EXPERIMENT_CVD_USD_V4_21d_${stamp}.md\`
`;
      fs.writeFileSync(mdPath, md, 'utf8');
      console.log(`[mild] ${mdPath}`);
      console.log(`[mild] ${hint}`);
    },
  );
});
