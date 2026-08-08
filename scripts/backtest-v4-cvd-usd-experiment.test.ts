/**
 * THÍ NGHIỆM CVD_USD — script riêng, KHÔNG sửa production.
 *
 * Công thức (Option B):
 *   CVD_USD = CVD_base × price
 *   So sánh với T_USD = T_base × BTC_REF
 * Tương đương feed scorer production:
 *   cvd' = CVD_base × (price / BTC_REF)  rồi giữ nguyên T_base
 * ⇒ trên BTC (price ≈ BTC_REF) hành vi gần như baseline.
 *
 * BTC_REF = mean close BTC trong cửa sổ 21d (theo lựa chọn user).
 *
 *   npx vitest run scripts/backtest-v4-cvd-usd-experiment.test.ts
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
import { evaluateADXGate, type ADXGateResult } from '../services/adxGate';
import { getADXAnalysis, type ADXAnalysis } from '../services/indicators';
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

/** Deep LONG hard — private in indicators.ts; documented mirror. */
const CVD_DEEP_LONG_BASE = -20_000_000;
const CVD_MOMENTUM_RECOVERING_BASE = 3_000_000;
const CVD_MOMENTUM_STRONG_BEARISH_BASE = -3_000_000;

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

/** cvd' = CVD_base × (price / BTC_REF) ⇔ so T_base như production. */
function buildInputCvdUsdEquiv(
  params: Parameters<typeof buildInput>[0],
  btcRef: number,
) {
  const input = buildInput(params);
  const scale = btcRef > 0 ? input.currentPrice / btcRef : 1;
  return {
    ...input,
    cvdPoints: input.cvdPoints.map((p) => ({
      ...p,
      cvd: p.cvd * scale,
    })),
  };
}

function buildBarEvalV4CvdUsd(bundle: MarketBundle, btcRef: number): BarEval[] {
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
  if (startIdx < 0) throw new Error(`No 1h bars for ${symbol}`);
  const todayStats = buildTodayStatsFromJournalV4(0, 0);
  const cache: BarEval[] = [];

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;
    const win1h = sym1h.slice(0, i + 1);
    const win4h = sliceUpTo(sym4h, candle.openTime);
    if (win4h.length < 30) continue;

    const evaluated = withSimulatedNow(candle.openTime, () => {
      const input = buildInputCvdUsdEquiv(
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
      const scoring = scoreAnalysisV4(input, todayStats);
      const direction = suggestDirectionV4(scoring);
      const active = direction === 'LONG' ? scoring.long : scoring.short;
      const longScore =
        scoring.long.officialTotalScore ?? scoring.long.referenceTotalScore;
      const shortScore =
        scoring.short.officialTotalScore ?? scoring.short.referenceTotalScore;
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
    const ambiguous = ambigState.status === 'AMBIGUOUS';
    let adxGate = evaluateADXGate(bar.adxData, bar.direction);
    if (!bar.adxData) {
      try {
        adxGate = evaluateADXGate(
          getADXAnalysis(sym1h.slice(0, i + 1), sliceUpTo(bundle.sym4h, candle.openTime)),
          bar.direction,
        );
      } catch {
        /* ok */
      }
    }
    const enterOk = bar.canEnterRaw && !ambiguous && !adxGate.block;
    if (i <= inPositionUntil) {
      prevCanEnter = false;
      continue;
    }
    const rising = enterOk && !prevCanEnter;
    prevCanEnter = enterOk;
    if (!enterOk || !rising) continue;
    let plan = bar.plan;
    if (!plan || !plan.isValid || !plan.tradePlanValid) continue;
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
    const pct = pnlPct(bar.direction, plan.recommendedEntry, exit.exitPrice);
    const scoreDiff = Math.abs(bar.longScore - bar.shortScore);

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

function parseBaselineCsv(file: string): TradeRow[] {
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

function bundleStats(rows: TradeRow[]): {
  all: Stats;
  longN: number;
  shortN: number;
  longPct: number;
} {
  const all = computeStats(rows);
  const longN = rows.filter((r) => r.side === 'LONG').length;
  const shortN = rows.length - longN;
  return {
    all,
    longN,
    shortN,
    longPct: rows.length ? (longN / rows.length) * 100 : 0,
  };
}

function fmt(s: Stats): string {
  if (s.n === 0) return 'n=0';
  const pf = Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞';
  return `n=${s.n} WR=${s.wr.toFixed(1)}% PF=${pf} E[R]=${s.expectancyR.toFixed(3)}`;
}

describe('backtest-v4-cvd-usd-experiment', () => {
  it(
    'V4 CVD_USD experiment vs baseline 4 coins 21d',
    { timeout: 1_200_000 },
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const thr = DEFAULT_AMBIGUITY_THRESHOLD ?? AMBIGUOUS_THRESHOLD;

      console.log('[cvd-usd] load BTC for BTC_REF (window mean close)…');
      const btcBundle = await loadMarketBundle('BTCUSDT', DAYS);
      const winBars = btcBundle.sym1h.filter(
        (k) =>
          k.openTime >= btcBundle.windowStartMs &&
          k.openTime <= btcBundle.endMs,
      );
      const btcRef =
        winBars.reduce((s, k) => s + k.close, 0) / Math.max(1, winBars.length);
      console.log(`[cvd-usd] BTC_REF (mean close 21d)=${btcRef.toFixed(2)}`);

      const T_USD = {
        CVD_LONG_HARD_BLOCK: HARD_BLOCK_RULES_V4.CVD_LONG_HARD_BLOCK * btcRef,
        CVD_SHORT_HARD_BLOCK: HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK * btcRef,
        CVD_MILD_NEGATIVE: HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE * btcRef,
        CVD_MILD_POSITIVE: HARD_BLOCK_RULES_V4.CVD_MILD_POSITIVE * btcRef,
        CVD_STEEP_SLOPE_DELTA: HARD_BLOCK_RULES_V4.CVD_STEEP_SLOPE_DELTA * btcRef,
        CVD_DEEP_LONG: CVD_DEEP_LONG_BASE * btcRef,
        CVD_MOMENTUM_RECOVERING: CVD_MOMENTUM_RECOVERING_BASE * btcRef,
        CVD_MOMENTUM_STRONG_BEARISH:
          CVD_MOMENTUM_STRONG_BEARISH_BASE * btcRef,
      };

      type Row = {
        symbol: AppTradeSymbol;
        base: ReturnType<typeof bundleStats>;
        exp: ReturnType<typeof bundleStats>;
        tradesExp: TradeRow[];
      };
      const rows: Row[] = [];

      for (const symbol of SYMBOLS) {
        console.log(`[cvd-usd] experiment ${symbol}…`);
        const bundle =
          symbol === 'BTCUSDT' ? btcBundle : await loadMarketBundle(symbol, DAYS);
        const cache = buildBarEvalV4CvdUsd(bundle, btcRef);
        const tradesExp = simulateV4(bundle, cache, thr);

        const short = symbol.replace('USDT', '').toLowerCase();
        const baseCsv = path.join(
          OUT,
          `${short}_v3v4_trusted_${DAYS}d_v4_trades.csv`,
        );
        const baseTrades = parseBaselineCsv(baseCsv);

        const expCsv = path.join(
          OUT,
          `${short}_v4_cvd_usd_exp_${DAYS}d_trades.csv`,
        );
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
        for (const r of tradesExp) {
          lines.push(
            cols
              .map((c) => String((r as unknown as Record<string, unknown>)[c] ?? ''))
              .join(','),
          );
        }
        fs.writeFileSync(expCsv, lines.join('\n'), 'utf8');

        rows.push({
          symbol,
          base: bundleStats(baseTrades),
          exp: bundleStats(tradesExp),
          tradesExp,
        });
        console.log(
          `[cvd-usd] ${symbol} BASE ${fmt(bundleStats(baseTrades).all)} L%=${bundleStats(baseTrades).longPct.toFixed(0)} | EXP ${fmt(bundleStats(tradesExp).all)} L%=${bundleStats(tradesExp).longPct.toFixed(0)}`,
        );
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const mdPath = path.join(
        OUT,
        `REPORT_EXPERIMENT_CVD_USD_V4_21d_${stamp}.md`,
      );

      const names = SYMBOLS.map((s) => s.replace('USDT', ''));

      const deltaWr = (r: Row) => {
        if (r.base.all.n === 0 && r.exp.all.n === 0) return '0';
        if (r.base.all.n === 0) return 'n/a→exp';
        return `${(r.exp.all.wr - r.base.all.wr).toFixed(1)}pp`;
      };
      const deltaPf = (r: Row) => {
        if (!r.base.all.n || !r.exp.all.n) return 'n/a';
        if (!Number.isFinite(r.base.all.pf) || !Number.isFinite(r.exp.all.pf))
          return 'n/a';
        return `${(r.exp.all.pf - r.base.all.pf).toFixed(2)}`;
      };

      const btcRow = rows.find((r) => r.symbol === 'BTCUSDT')!;
      const btcWrDrop = btcRow.exp.all.wr - btcRow.base.all.wr;
      const xrp = rows.find((r) => r.symbol === 'XRPUSDT')!;
      const longRangeBase =
        Math.max(...rows.map((r) => r.base.longPct)) -
        Math.min(...rows.map((r) => r.base.longPct));
      const longRangeExp =
        Math.max(...rows.map((r) => r.exp.longPct)) -
        Math.min(...rows.map((r) => r.exp.longPct));

      let decisionHint: string;
      if (btcWrDrop < -5) {
        decisionHint =
          '**KHÔNG recommend approve production** — BTC WR giảm >5pp so với baseline.';
      } else if (
        rows.some(
          (r) =>
            r.symbol !== 'XRPUSDT' &&
            r.base.all.n >= 10 &&
            r.exp.all.wr < r.base.all.wr - 8,
        )
      ) {
        decisionHint =
          '**Thận trọng** — ít nhất một peer (SOL/BNB/BTC) WR giảm >8pp. Cân nhắc chỉnh BTC_REF / hệ số trước khi patch.';
      } else if (xrp.exp.longPct > 5 && btcWrDrop >= -5) {
        decisionHint =
          '**Có thể cân nhắc approve** (sau review code list) — XRP Long% cải thiện, peers WR không sụt nặng. Vẫn cần bạn xác nhận thủ công trên bảng.';
      } else {
        decisionHint =
          '**Chưa đủ bằng chứng approve** — xem bảng; Long% / WR chưa đáp ứng mục tiêu rõ.';
      }

      const md = `# EXPERIMENT — V4 CVD_USD (Option B) vs baseline trusted 21d

**Ngày:** ${stamp}  
**KHÔNG sửa production** — chỉ script thí nghiệm.  
**BTC_REF (mean close cửa sổ):** **${btcRef.toFixed(2)}** USD  

## 1) Thiết kế công thức (giữ BTC gần như không đổi)

### Mapping

\`\`\`
CVD_USD = CVD_base × price
T_USD   = T_base × BTC_REF

So sánh: CVD_USD ? T_USD
  ⇔  CVD_base × (price/BTC_REF) ? T_base   // experiment feed scorer production
\`\`\`

Trên BTC, \`price ≈ BTC_REF\` ⇒ \`cvd' ≈ CVD_base\` ⇒ quyết định L5a **gần baseline**.

### Ngưỡng USD đề xuất (T_USD = T_base × BTC_REF)

| Constant (base hiện tại) | Base | **USD đề xuất** (= base × ${btcRef.toFixed(0)}) |
|--------------------------|------|------|
| \`CVD_LONG_HARD_BLOCK\` | ${HARD_BLOCK_RULES_V4.CVD_LONG_HARD_BLOCK} | **${T_USD.CVD_LONG_HARD_BLOCK.toExponential(3)}** (vẫn orphan nếu không wire) |
| \`CVD_SHORT_HARD_BLOCK\` | ${HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK} | **${T_USD.CVD_SHORT_HARD_BLOCK.toExponential(3)}** |
| \`CVD_MILD_NEGATIVE\` | ${HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE} | **${T_USD.CVD_MILD_NEGATIVE.toExponential(3)}** |
| \`CVD_MILD_POSITIVE\` | ${HARD_BLOCK_RULES_V4.CVD_MILD_POSITIVE} | **${T_USD.CVD_MILD_POSITIVE.toExponential(3)}** |
| \`CVD_STEEP_SLOPE_DELTA\` | ${HARD_BLOCK_RULES_V4.CVD_STEEP_SLOPE_DELTA} | **${T_USD.CVD_STEEP_SLOPE_DELTA.toExponential(3)}** |
| Deep LONG (\`CVD_STATE_DEEP_NEGATIVE\`) | ${CVD_DEEP_LONG_BASE} | **${T_USD.CVD_DEEP_LONG.toExponential(3)}** |
| Momentum recovering | ${CVD_MOMENTUM_RECOVERING_BASE} | **${T_USD.CVD_MOMENTUM_RECOVERING.toExponential(3)}** |
| Momentum strong bearish | ${CVD_MOMENTUM_STRONG_BEARISH_BASE} | **${T_USD.CVD_MOMENTUM_STRONG_BEARISH.toExponential(3)}** |

> Lưu ý: nhân BTC_REF làm T_USD rất lớn (~1e11–1e12). Effect chính: **gỡ bias base** trên XRP/SOL; soft/hard tuyệt đối gần như chỉ còn ý nghĩa khi CVD_USD cực đoan. Experiment verify peers không hỏng.

### File / dòng cần sửa nếu approve production (REVIEW ONLY)

| File | Vị trí | Việc cần làm |
|------|--------|--------------|
| \`constants/scoring.ts\` | \`HARD_BLOCK_RULES_V4\` ~L741–745 | Đổi comment + hoặc thêm \`*_USD\` constants; quyết định giữ base legacy hay thay bằng USD |
| \`services/indicators.ts\` | \`CVD_STATE_DEEP_NEGATIVE\` ~L983; momentum ~L984–985; \`evaluateLongCvdHardBlock\` ~L1005–1017; \`classifyCvdState\` ~L995; \`analyzeCVD\` | Nhận CVD đã là USD **hoặc** nhân price trước classify; deep/−20M → USD |
| \`services/scorerV4.ts\` | \`scoreL5aV4\` ~L455–560; call site ~L1192 | Dùng \`currentCvdUsd = currentCvd * price\` trước mọi so ngưỡng; cập nhật reason string hiển thị USD |
| \`services/analysisInput.ts\` / live market bundle | nơi gắn \`cvdPoints\` | Optional: chuẩn hóa một lần tại input SSOT |
| Tests | \`scorerV4.test.ts\`, \`indicators.test.ts\`, \`cvdx.test.ts\` | Cập nhật fixture ngưỡng USD / scale |
| Docs | \`docs/tradeScoreRuleBook.ts\` | Đồng bộ mô tả L5a |

**Chưa apply** — chờ bạn approve sau khi đọc kết quả dưới.

## 2) Kết quả backtest thí nghiệm (V4, 21d, cùng gate ambig+ADX+tradePlan)

### Baseline (CVD base tuyệt đối) vs Experiment (CVD USD-equiv)

| Metric | ${names.join(' | ')} |
|--------|${names.map(() => '---').join('|')}|
| Baseline | ${rows.map((r) => fmt(r.base.all)).join(' | ')} |
| Experiment | ${rows.map((r) => fmt(r.exp.all)).join(' | ')} |
| Δ WR (pp) | ${rows.map(deltaWr).join(' | ')} |
| Δ PF | ${rows.map(deltaPf).join(' | ')} |
| Baseline %Long | ${rows.map((r) => `${r.base.longPct.toFixed(0)}% (L${r.base.longN}/S${r.base.shortN})`).join(' | ')} |
| Experiment %Long | ${rows.map((r) => `${r.exp.longPct.toFixed(0)}% (L${r.exp.longN}/S${r.exp.shortN})`).join(' | ')} |

### Đọc nhanh

- XRP Long%: ${xrp.base.longPct.toFixed(0)}% → **${xrp.exp.longPct.toFixed(0)}%**
- BTC WR: ${btcRow.base.all.wr.toFixed(1)}% → **${btcRow.exp.all.wr.toFixed(1)}%** (Δ ${btcWrDrop.toFixed(1)}pp) — kỳ vọng gần 0 nếu BTC_REF đúng
- Long% range (max−min): ${longRangeBase.toFixed(0)}pp → **${longRangeExp.toFixed(0)}pp**

## 3) Gợi ý quyết định (không thay bạn)

${decisionHint}

**Checklist approve production**
- [ ] BTC/SOL/BNB: WR không giảm đáng kể (mục tiêu ≤ ~5pp)
- [ ] XRP: %Long cân hơn (không còn 0% nếu L5a là nút thắt)
- [ ] Review danh sách file/dòng ở mục 1
- [ ] Bạn trả lời **approve** / **reject** / **adjust factor** trước khi patch

## Artefacts

- Experiment CSV: \`docs/exports/*_v4_cvd_usd_exp_21d_trades.csv\`
- Baseline CSV: \`docs/exports/*_v3v4_trusted_21d_v4_trades.csv\`
- Script: \`scripts/backtest-v4-cvd-usd-experiment.test.ts\`
`;

      fs.writeFileSync(mdPath, md, 'utf8');
      console.log(`[cvd-usd] wrote ${mdPath}`);
      console.log(`[cvd-usd] DECISION HINT: ${decisionHint}`);
    },
  );
});
