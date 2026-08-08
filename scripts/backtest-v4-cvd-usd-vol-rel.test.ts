/**
 * Thí nghiệm CVD relative volume:
 *   CVD_USD = CVD_base × price
 *   soft fail LONG nếu CVD_USD < -SOFT_PCT × quote24h
 *   soft fail SHORT nếu CVD_USD > +SOFT_PCT × quote24h (mirror mild)
 *   hard SHORT nếu CVD_USD > +HARD_PCT × quote24h
 *   hard LONG deep nếu CVD_USD < -DEEP_PCT × quote24h + momentum xấu + price < EMA20
 *
 * KHÔNG sửa production.
 *   npx vitest run scripts/backtest-v4-cvd-usd-vol-rel.test.ts
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
  getADXAnalysis,
  type ADXAnalysis,
} from '../services/indicators';
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

/** Soft = 12% × quote; hard SHORT production-ratio → ~48% × quote (= 4× soft). */
const SOFT_PCT = 0.12;

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

function quote24h(win1h: { volume: number; close: number }[]): number {
  const last = win1h.slice(-24);
  return last.reduce((s, k) => s + k.volume * k.close, 0);
}

/**
 * Map vol-rel soft onto production mild threshold so full scoreAnalysisV4
 * (incl. suggestDirection) sees CVD in "equiv base units":
 *   cvd' < -500_000  ⇔  CVD_USD < -SOFT_PCT × quote24h
 * Hard SHORT at +2M base ⇔ CVD_USD > 4×SOFT_PCT × quote24h.
 */
function scaleCvdToVolRelSoft(
  points: { timestamp: number; cvd: number; price: number }[],
  price: number,
  q24: number,
) {
  const softUsd = SOFT_PCT * Math.max(1, q24);
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
    isLong ? entry + (p - entry) * gate.tpMultiplier : entry - (entry - p) * gate.tpMultiplier;
  const scaleSl = (p: number) =>
    isLong ? entry - (entry - p) * gate.slMultiplier : entry + (p - entry) * gate.slMultiplier;
  return {
    ...plan,
    stopLoss: { ...plan.stopLoss, price: scaleSl(plan.stopLoss.price) },
    tp1: { ...plan.tp1, price: scaleTp(plan.tp1.price) },
    tp2: { ...plan.tp2, price: scaleTp(plan.tp2.price) },
    tp3: { ...plan.tp3, price: scaleTp(plan.tp3.price) },
  };
}

function buildBarEvalVolRel(bundle: MarketBundle): BarEval[] {
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
      const q24 = quote24h(win1h);
      const inputVol = {
        ...input,
        cvdPoints: scaleCvdToVolRelSoft(
          input.cvdPoints,
          input.currentPrice,
          q24,
        ),
      };
      const scoring = scoreAnalysisV4(inputVol, todayStats);
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
        score: active.officialTotalScore ?? active.referenceTotalScore,
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

describe('backtest-v4-cvd-usd-vol-rel', () => {
  it(
    'vol-rel %×24h quote vs base + full USD',
    { timeout: 1_200_000 },
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const thr = DEFAULT_AMBIGUITY_THRESHOLD ?? AMBIGUOUS_THRESHOLD;

      type Row = {
        symbol: AppTradeSymbol;
        base: ReturnType<typeof statsOf>;
        full: ReturnType<typeof statsOf>;
        vol: ReturnType<typeof statsOf>;
      };
      const rows: Row[] = [];

      for (const symbol of SYMBOLS) {
        console.log(`[vol] ${symbol}…`);
        const bundle = await loadMarketBundle(symbol, DAYS);
        const short = symbol.replace('USDT', '').toLowerCase();
        const base = statsOf(
          parseCsv(path.join(OUT, `${short}_v3v4_trusted_${DAYS}d_v4_trades.csv`)),
        );
        const full = statsOf(
          parseCsv(path.join(OUT, `${short}_v4_cvd_usd_exp_${DAYS}d_trades.csv`)),
        );
        const trades = simulateV4(bundle, buildBarEvalVolRel(bundle), thr);
        fs.writeFileSync(
          path.join(OUT, `${short}_v4_cvd_volrel_${DAYS}d_trades.csv`),
          [
            'symbol,entryIso,side,resultR,win',
            ...trades.map(
              (r) =>
                `${r.symbol},${r.entryIso},${r.side},${r.resultR},${r.win}`,
            ),
          ].join('\n'),
          'utf8',
        );
        const vol = statsOf(trades);
        rows.push({ symbol, base, full, vol });
        console.log(
          `[vol] ${symbol} base L%${base.longPct.toFixed(0)} WR${base.all.wr.toFixed(1)} | full L%${full.longPct.toFixed(0)} | vol L%${vol.longPct.toFixed(0)} WR${vol.all.wr.toFixed(1)} n=${vol.all.n}`,
        );
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const mdPath = path.join(
        OUT,
        `REPORT_EXPERIMENT_CVD_USD_VOL_REL_21d_${stamp}.md`,
      );
      const names = SYMBOLS.map((s) => s.replace('USDT', ''));
      const btc = rows.find((r) => r.symbol === 'BTCUSDT')!;
      const xrp = rows.find((r) => r.symbol === 'XRPUSDT')!;
      const btcDrop = btc.vol.all.wr - btc.base.all.wr;

      let hint: string;
      if (btcDrop < -5) {
        hint = `**Thận trọng / không recommend** — BTC WR Δ=${btcDrop.toFixed(1)}pp. Tăng SOFT_PCT (nới) rồi chạy lại.`;
      } else if (xrp.vol.longPct >= 15 && btcDrop >= -5) {
        hint =
          '**Ứng viên tốt để approve** — relative %×quote: XRP Long%↑, BTC WR ổn. Xác nhận Soft/Hard/Deep % trước patch.';
      } else {
        hint = '**Xem bảng** — điều chỉnh SOFT/HARD/DEEP % nếu Long% hoặc WR chưa đạt.';
      }

      const md = `# EXPERIMENT — CVD_USD relative volume (% × 24h quote)

**Ngày:** ${stamp}  
**KHÔNG sửa production**  
**Params:** SOFT_PCT=${SOFT_PCT} (hard SHORT ≅ 4×SOFT via production ratio ≈ ${(SOFT_PCT * 4 * 100).toFixed(0)}%×quote; deep LONG ≅ 40×soft via −20M/−0.5M)

## Công thức

\`\`\`
CVD_USD = CVD_base × price
quote24h ≈ Σ(vol×close) last 24×1H

Map vào scorer production (giữ suggestDirection đúng):
  cvd' = CVD_base × price × |CVD_MILD_NEGATIVE| / (SOFT_PCT × quote24h)
  ⇒ soft LONG fail khi CVD_USD < -SOFT_PCT×quote
  ⇒ hard SHORT khi CVD_USD > 4×SOFT_PCT×quote
\`\`\`

## Kết quả V4 21d — Base | Full×BTC_REF | Vol-rel

| Metric | ${names.join(' | ')} |
|--------|${names.map(() => '---').join('|')}|
| Base | ${rows.map((r) => fmt(r.base.all)).join(' | ')} |
| Full USD | ${rows.map((r) => fmt(r.full.all)).join(' | ')} |
| **Vol-rel** | ${rows.map((r) => fmt(r.vol.all)).join(' | ')} |
| Base %Long | ${rows.map((r) => `${r.base.longPct.toFixed(0)}%`).join(' | ')} |
| Full %Long | ${rows.map((r) => `${r.full.longPct.toFixed(0)}%`).join(' | ')} |
| **Vol %Long** | ${rows.map((r) => `${r.vol.longPct.toFixed(0)}%`).join(' | ')} |

## Đọc nhanh

- XRP Long%: ${xrp.base.longPct.toFixed(0)} → full ${xrp.full.longPct.toFixed(0)} → **vol ${xrp.vol.longPct.toFixed(0)}**
- BTC WR: ${btc.base.all.wr.toFixed(1)} → full ${btc.full.all.wr.toFixed(1)} → **vol ${btc.vol.all.wr.toFixed(1)}** (Δ ${btcDrop.toFixed(1)}pp)

## Gợi ý quyết định

${hint}

### Nếu approve vol-rel — production touch list

| File | Việc |
|------|------|
| \`constants/scoring.ts\` | Thêm \`CVD_SOFT_PCT_OF_24H_QUOTE\` etc. (thay ±2M base) |
| \`services/scorerV4.ts\` \`scoreL5aV4\` | CVD_USD + quote24h so % |
| \`services/indicators.ts\` | Deep LONG hard theo % quote + mom % |
| \`analysisInput\` / market bundle | Truyền quote24h hoặc tự tính từ klines |
| Tests + rulebook | Cập nhật |

**Chưa patch** — chờ approve / chỉnh %.
`;
      fs.writeFileSync(mdPath, md, 'utf8');
      console.log(`[vol] ${mdPath}`);
      console.log(`[vol] ${hint}`);
    },
  );
});
