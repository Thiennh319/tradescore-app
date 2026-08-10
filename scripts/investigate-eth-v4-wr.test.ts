/**
 * TASK 3/9 — Investigate ETH V4 WR 64.3% (absolute CVD baseline).
 * Method mirrors XRP CVD+GROUP+L5a investigation. NO production changes.
 *
 *   npx vitest run scripts/investigate-eth-v4-wr.test.ts
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
import { MARKET_KLINE_LIMIT } from '../services/marketAnalysisFetch';
import {
  analyzeCVD,
  buildCVDPointsFromKlines,
  evaluateLongCvdHardBlock,
  getEMAAnalysisV3,
  getMACDAnalysisV3,
} from '../services/indicators';
import {
  buildTodayStatsFromJournalV4,
  canEnterV4,
  scoreAnalysisV4,
  suggestDirectionV4,
  type DirectionalScoreV4,
} from '../services/scorerV4';
import { calculateTradePlanV4 } from '../services/tradePlanV4';
import {
  buildInput,
  loadMarketBundle,
  sliceUpTo,
  WARMUP_1H,
  withSimulatedNow,
  type MarketBundle,
} from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/exports');
const DAYS = 21;
const CVD_DEEP_LONG = -20_000_000;

type CoinCvdStats = {
  symbol: string;
  bars: number;
  meanCvd: number;
  medianCvd: number;
  p10Cvd: number;
  p90Cvd: number;
  minCvd: number;
  maxCvd: number;
  pctBelowNeg2M: number;
  pctBelowNeg500K: number;
  pctBelowNeg20M: number;
  pctAbovePos2M: number;
  pctLongHardBlockReal: number;
  meanAbsCvd: number;
  meanBarVolumeBase: number;
  mean24hQuoteUsd: number;
  meanCvdUsd: number;
  medianCvdUsd: number;
  meanAbsCvdOver24hVol: number;
};

type BarSnap = {
  openTime: number;
  direction: 'LONG' | 'SHORT';
  hardBlocks: string[];
  groupBlocks: string[];
  rawLayerScores: Record<number, number>;
  groupScores: { A: number; B: number; C: number };
  longDir: DirectionalScoreV4;
  shortDir: DirectionalScoreV4;
  l3Score: number;
  h1: number;
  h4: number;
  macd1hTurning: boolean;
  macd4hTurning: boolean;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[i];
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmtM(n: number): string {
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function analyzeCvd(bundle: MarketBundle): CoinCvdStats {
  const { symbol, sym1h, windowStartMs, endMs } = bundle;
  const startIdx = sym1h.findIndex((k) => k.openTime >= windowStartMs);
  const cvds: number[] = [];
  const cvdUsds: number[] = [];
  const absOverVol: number[] = [];
  let below2M = 0;
  let below500K = 0;
  let below20M = 0;
  let above2M = 0;
  let longHb = 0;
  let bars = 0;
  const volumes: number[] = [];
  const quote24hs: number[] = [];

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;
    const win1h = sym1h.slice(0, i + 1);
    const cvdSlice =
      win1h.length > MARKET_KLINE_LIMIT
        ? win1h.slice(-MARKET_KLINE_LIMIT)
        : win1h;
    if (cvdSlice.length < 30) continue;

    const points = buildCVDPointsFromKlines(cvdSlice);
    if (points.length === 0) continue;
    const currentCvd = points[points.length - 1].cvd;
    const price = candle.close;
    const cvdUsd = currentCvd * price;
    const analysis = analyzeCVD(points, 'LONG');
    const ema = getEMAAnalysisV3(cvdSlice);
    const longMsg = evaluateLongCvdHardBlock({
      currentCvd,
      cvdMomentum24h: analysis.cvdMomentum24h,
      currentPrice: price,
      ema20: ema.ema20,
    });

    bars += 1;
    cvds.push(currentCvd);
    cvdUsds.push(cvdUsd);
    volumes.push(candle.volume);
    const last24 = win1h.slice(-24);
    const q24 = last24.reduce((s, k) => s + k.volume * k.close, 0);
    quote24hs.push(q24);
    if (q24 > 0) absOverVol.push(Math.abs(cvdUsd) / q24);

    if (currentCvd < HARD_BLOCK_RULES_V4.CVD_LONG_HARD_BLOCK) below2M += 1;
    if (currentCvd < HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE) below500K += 1;
    if (currentCvd < CVD_DEEP_LONG) below20M += 1;
    if (currentCvd > HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK) above2M += 1;
    if (longMsg) longHb += 1;
  }

  const sorted = [...cvds].sort((a, b) => a - b);
  const sortedUsd = [...cvdUsds].sort((a, b) => a - b);
  const pct = (n: number) => (bars > 0 ? (n / bars) * 100 : 0);

  return {
    symbol,
    bars,
    meanCvd: mean(cvds),
    medianCvd: percentile(sorted, 50),
    p10Cvd: percentile(sorted, 10),
    p90Cvd: percentile(sorted, 90),
    minCvd: sorted[0] ?? 0,
    maxCvd: sorted[sorted.length - 1] ?? 0,
    pctBelowNeg2M: pct(below2M),
    pctBelowNeg500K: pct(below500K),
    pctBelowNeg20M: pct(below20M),
    pctAbovePos2M: pct(above2M),
    pctLongHardBlockReal: pct(longHb),
    meanAbsCvd: mean(cvds.map(Math.abs)),
    meanBarVolumeBase: mean(volumes),
    mean24hQuoteUsd: mean(quote24hs),
    meanCvdUsd: mean(cvdUsds),
    medianCvdUsd: percentile(sortedUsd, 50),
    meanAbsCvdOver24hVol: mean(absOverVol),
  };
}

function buildEthBars(bundle: MarketBundle): BarSnap[] {
  process.env.TRADESCORE_FORCE_ABSOLUTE_CVD = '1';
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
  const todayStats = buildTodayStatsFromJournalV4(0, 0);
  const out: BarSnap[] = [];

  for (let i = Math.max(startIdx, WARMUP_1H); i < sym1h.length - 1; i++) {
    const candle = sym1h[i];
    if (candle.openTime > endMs) break;
    const win1h = sym1h.slice(0, i + 1);
    const win4h = sliceUpTo(sym4h, candle.openTime);
    if (win4h.length < 30) continue;

    const snap = withSimulatedNow(candle.openTime, () => {
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
      // Force plan build so we don't change L3/path — just touch canEnter to ensure scoring ran
      if (canEnterV4(active)) {
        calculateTradePlanV4(
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
      const macd1h = getMACDAnalysisV3(win1h);
      const macd4h = getMACDAnalysisV3(win4h);
      return {
        direction,
        hardBlocks: [...active.hardBlocks],
        groupBlocks: [...active.groupBlocks],
        rawLayerScores: { ...active.rawLayerScores },
        groupScores: { ...active.groupScores },
        longDir: scoring.long,
        shortDir: scoring.short,
        l3Score: active.rawLayerScores[3] ?? 0,
        h1: macd1h.histogram ?? 0,
        h4: macd4h.histogram ?? 0,
        macd1hTurning: !!(macd1h.isTurningUp || macd1h.isTurningDown),
        macd4hTurning: !!(macd4h.isTurningUp || macd4h.isTurningDown),
      };
    });

    out.push({
      openTime: candle.openTime,
      ...snap,
    });
  }
  return out;
}

function hardLayerHint(msg: string): string {
  const m = msg.match(/\bL(\d{1,2}[ab]?)\b/i);
  if (m) return `L${m[1]}`;
  if (/CVD/i.test(msg)) return 'L5a';
  if (/Group\s*[ABC]|nhóm\s*[ABC]/i.test(msg)) return 'GROUP';
  if (/MACD/i.test(msg)) return 'L3';
  if (/Phiên|session/i.test(msg)) return 'L9';
  return 'OTHER';
}

function culpritSort(map: Record<string, number>): string {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join(', ');
}

describe('investigate-eth-v4-wr', () => {
  it(
    'ETH CVD + volume vs BTC + GROUP + L3 investigation',
    { timeout: 900_000 },
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);
      process.env.TRADESCORE_FORCE_ABSOLUTE_CVD = '1';

      const symbols: AppTradeSymbol[] = [
        'ETHUSDT' as AppTradeSymbol,
        'BTCUSDT',
        'XRPUSDT',
      ];
      const cvdStats: CoinCvdStats[] = [];
      for (const s of symbols) {
        console.log(`[eth-invest] CVD/vol load ${s}…`);
        cvdStats.push(analyzeCvd(await loadMarketBundle(s, DAYS)));
      }
      const ethCvd = cvdStats.find((s) => s.symbol === 'ETHUSDT')!;
      const btcCvd = cvdStats.find((s) => s.symbol === 'BTCUSDT')!;
      const xrpCvd = cvdStats.find((s) => s.symbol === 'XRPUSDT')!;

      console.log('[eth-invest] ETH bar scoring + GROUP/L3…');
      const ethBundle = await loadMarketBundle('ETHUSDT' as AppTradeSymbol, DAYS);
      const bars = buildEthBars(ethBundle);

      // --- Hard-block named layers (active side) ---
      const hardHits: Record<string, number> = {};
      let hardBlockBars = 0;
      for (const b of bars) {
        if (b.hardBlocks.length === 0) continue;
        hardBlockBars += 1;
        for (const msg of b.hardBlocks) {
          const k = hardLayerHint(msg);
          hardHits[k] = (hardHits[k] ?? 0) + 1;
        }
      }

      // --- GROUP A/B/C ---
      const minA = SCORING_GROUPS_V4.GROUP_A_TREND.minRequired;
      const minB = SCORING_GROUPS_V4.GROUP_B_FLOW.minRequired;
      const minC = SCORING_GROUPS_V4.GROUP_C_CONTEXT.minRequired;
      let barsAnyGroup = 0;
      let failA = 0;
      let failB = 0;
      let failC = 0;
      const aCulprit: Record<string, number> = {};
      const bCulprit: Record<string, number> = {};
      const cCulprit: Record<string, number> = {};
      let bFailAndL5aWeak = 0;
      let groupBlockBars = 0;

      const bump = (m: Record<string, number>, k: string) => {
        m[k] = (m[k] ?? 0) + 1;
      };

      for (const bar of bars) {
        if (bar.groupBlocks.length > 0) groupBlockBars += 1;
        const d = bar.direction === 'LONG' ? bar.longDir : bar.shortDir;
        const fA = d.groupScores.A < minA;
        const fB = d.groupScores.B < minB;
        const fC = d.groupScores.C < minC;
        if (!fA && !fB && !fC) continue;
        barsAnyGroup += 1;
        if (fA) {
          failA += 1;
          const layers = [
            ['L1', d.rawLayerScores[1] ?? 0],
            ['L2', d.rawLayerScores[2] ?? 0],
            ['L3', d.rawLayerScores[3] ?? 0],
            ['L4', d.rawLayerScores[4] ?? 0],
          ] as const;
          bump(aCulprit, [...layers].sort((x, y) => x[1] - y[1])[0][0]);
        }
        if (fB) {
          failB += 1;
          const layers = [
            ['L5a', d.rawLayerScores[5] ?? 0],
            ['L5b', d.rawLayerScores[LAYER_L5B_ID] ?? 0],
            ['L6', d.rawLayerScores[6] ?? 0],
            ['L7', d.rawLayerScores[7] ?? 0],
          ] as const;
          bump(bCulprit, [...layers].sort((x, y) => x[1] - y[1])[0][0]);
          if ((d.rawLayerScores[5] ?? 0) < 1) bFailAndL5aWeak += 1;
        }
        if (fC) {
          failC += 1;
          const layers = [
            ['L8', d.rawLayerScores[8] ?? 0],
            ['L9', d.rawLayerScores[9] ?? 0],
            ['L10', d.rawLayerScores[10] ?? 0],
          ] as const;
          bump(cCulprit, [...layers].sort((x, y) => x[1] - y[1])[0][0]);
        }
      }

      // --- L3 MACD diagnostics ---
      let l3HardBars = 0;
      let l3ZeroScore = 0;
      let l3ScoreSum = 0;
      let histBothWrongLong = 0; // LONG bias: both hist < 0
      let histBothWrongShort = 0; // SHORT bias: both hist > 0
      let histSignFlip1h = 0;
      let longBars = 0;
      let shortBars = 0;
      const l3ScoreDist: Record<string, number> = {
        '0': 0,
        '1': 0,
        '1.5': 0,
        '2': 0,
        other: 0,
      };

      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (b.hardBlocks.some((m) => /L3|MACD/i.test(m))) l3HardBars += 1;
        if (b.l3Score < 1) l3ZeroScore += 1;
        l3ScoreSum += b.l3Score;
        const key =
          b.l3Score === 0
            ? '0'
            : b.l3Score === 1
              ? '1'
              : b.l3Score === 1.5
                ? '1.5'
                : b.l3Score === 2
                  ? '2'
                  : 'other';
        l3ScoreDist[key] += 1;

        if (b.direction === 'LONG') {
          longBars += 1;
          if (b.h1 < 0 && b.h4 < 0) histBothWrongLong += 1;
        } else {
          shortBars += 1;
          if (b.h1 > 0 && b.h4 > 0) histBothWrongShort += 1;
        }
        if (i > 0) {
          const prev = bars[i - 1];
          if (Math.sign(prev.h1) !== 0 && Math.sign(b.h1) !== 0 && Math.sign(prev.h1) !== Math.sign(b.h1)) {
            histSignFlip1h += 1;
          }
        }
      }

      // Compare MACD flip rate on BTC for contrast
      console.log('[eth-invest] BTC MACD flip baseline…');
      const btcBundle = await loadMarketBundle('BTCUSDT', DAYS);
      const btcBars = buildEthBars(btcBundle);
      let btcFlip = 0;
      let btcL3Hard = 0;
      let btcL3Zero = 0;
      for (let i = 1; i < btcBars.length; i++) {
        const a = btcBars[i - 1];
        const b = btcBars[i];
        if (Math.sign(a.h1) !== 0 && Math.sign(b.h1) !== 0 && Math.sign(a.h1) !== Math.sign(b.h1)) {
          btcFlip += 1;
        }
        if (b.hardBlocks.some((m) => /L3|MACD/i.test(m))) btcL3Hard += 1;
        if (b.l3Score < 1) btcL3Zero += 1;
      }

      // Losing trades from baseline7 CSV (if present)
      const ethCsv = path.join(
        OUT,
        'eth_baseline7_v3v4_trusted_21d_v4_trades.csv',
      );
      let tradeNote = '_CSV baseline7 chưa có — bỏ qua breakdown trades._';
      if (fs.existsSync(ethCsv)) {
        const lines = fs.readFileSync(ethCsv, 'utf8').trim().split(/\r?\n/);
        const header = lines[0].split(',');
        const trades = lines.slice(1).map((line) => {
          const cols = line.split(',');
          const row: Record<string, string> = {};
          header.forEach((h, i) => {
            row[h] = cols[i] ?? '';
          });
          return row;
        });
        const wins = trades.filter((t) => Number(t.win) === 1).length;
        const losses = trades.filter((t) => Number(t.win) === 0);
        const longN = trades.filter((t) => t.side === 'LONG').length;
        const shortN = trades.filter((t) => t.side === 'SHORT').length;
        const longWins = trades.filter(
          (t) => t.side === 'LONG' && Number(t.win) === 1,
        ).length;
        const shortWins = trades.filter(
          (t) => t.side === 'SHORT' && Number(t.win) === 1,
        ).length;
        const exitReasons: Record<string, number> = {};
        for (const t of losses) {
          const r = t.exitReason || '?';
          exitReasons[r] = (exitReasons[r] ?? 0) + 1;
        }
        tradeNote = `| n | ${trades.length} |
| WR (baseline7) | ${((wins / trades.length) * 100).toFixed(1)}% |
| Long / Short | ${longN} / ${shortN} |
| Long WR | ${longN ? ((longWins / longN) * 100).toFixed(1) : 'n/a'}% |
| Short WR | ${shortN ? ((shortWins / shortN) * 100).toFixed(1) : 'n/a'}% |
| Loss exit reasons | ${Object.entries(exitReasons)
  .map(([k, v]) => `${k}(${v})`)
  .join(', ')} |`;
      }

      const quoteRatioBtcEth =
        ethCvd.mean24hQuoteUsd > 0
          ? btcCvd.mean24hQuoteUsd / ethCvd.mean24hQuoteUsd
          : 0;

      // Verdict: same CVD denomination root as XRP?
      const ethLikeXrpDenom =
        ethCvd.pctBelowNeg2M >= 40 &&
        btcCvd.pctBelowNeg2M < 15 &&
        ethCvd.pctBelowNeg500K >= 50;
      const ethCvdMildVsBtc =
        ethCvd.pctBelowNeg500K > btcCvd.pctBelowNeg500K + 20;
      const groupDominatedByB = failB >= failA && failB >= failC;
      const bPrimarilyL5a =
        failB > 0 && bFailAndL5aWeak / failB >= 0.5;
      const l3Elevated =
        (hardHits['L3'] ?? 0) >= 15 ||
        l3HardBars / Math.max(1, bars.length) >
          btcL3Hard / Math.max(1, btcBars.length) + 0.03;

      let rootCause: string;
      let recommendAdd: string;

      if (ethLikeXrpDenom && groupDominatedByB && bPrimarilyL5a) {
        rootCause =
          'CÙNG gốc CVD denomination như XRP: base CVD thường xuyên dưới −500K/−2M → L5a yếu → GROUP-B fail.';
        recommendAdd =
          'Có thể cân nhắc patch ETH-only vol-rel tương tự Option A **sau** approve riêng — nhưng cần sweep SOFT% + peer fingerprint trước khi ship.';
      } else if (!ethLikeXrpDenom && l3Elevated && failA >= failB * 0.5) {
        rootCause =
          'KHÔNG cùng gốc denomination XRP. ETH bị kéo xuống chủ yếu bởi **Group A / L3 MACD** (+ L9 session trong hard tally), không phải L5a CVD base scale.';
        recommendAdd =
          '**Không nên thêm ETH lúc này** nếu mục tiêu là copy XRP-style CVD fix — nguyên nhân khác, sửa L3/session rủi ro peer + overfitting cửa sổ ngắn. Để xem xét lại ở phiên riêng (gate L3 / whitelist) nếu cần.';
      } else if (!ethLikeXrpDenom && groupDominatedByB && !bPrimarilyL5a) {
        rootCause =
          'KHÔNG cùng gốc denomination XRP. GROUP-B fail chủ yếu do layer flow khác L5a (L5b/L6/L7) — hoặc pha thị trường, không phải volume-base CVD scale.';
        recommendAdd =
          'Không đề xuất CVD override cho ETH. Cân nhắc **không thêm ETH** đến khi có mẫu dài hơn hoặc hiểu rõ L5b/L7/session.';
      } else {
        rootCause =
          'Hỗn hợp / không khớp fingerprint XRP. Xem bảng CVD + GROUP + L3 bên dưới trước khi đề xuất sửa.';
        recommendAdd =
          'Mặc định thận trọng: **chưa thêm ETH** cho đến khi nguyên nhân đơn giản rõ (CVD hoặc L3) và có proposal có kiểm chứng peers.';
      }

      const row = (label: string, pick: (s: CoinCvdStats) => string) =>
        `| ${label} | ${cvdStats.map(pick).join(' | ')} |`;

      const md = `# INVESTIGATE — ETH V4 WR 64.3% (Trusted 21d, absolute CVD)

**Ngày:** ${stamp}  
**Phạm vi:** CHỈ ETHUSDT (+ BTC/XRP đối chiếu CVD) — **KHÔNG** điều tra BTC/BNB WR, **KHÔNG** thử nghiệm sửa  
**Baseline Task 2:** ETH n=28 WR=64.3% PF=2.09 E[R]=0.197 L%=57% — **Cần điều tra**  
**CVD:** absolute base (\`TRADESCORE_FORCE_ABSOLUTE_CVD=1\`) — cùng điều kiện baseline7  
**Pipeline:** \`buildCVDPointsFromKlines\` @ \`MARKET_KLINE_LIMIT=${MARKET_KLINE_LIMIT}\`; GROUP via \`scoreAnalysisV4\` active side

---

## 1) CVD raw (base) — tần suất chạm ngưỡng

| Metric | ETH | BTC | XRP (đối chiếu denomination) |
|--------|-----|-----|------------------------------|
${row('Bars', (s) => String(s.bars))}
${row('Mean CVD', (s) => fmtM(s.meanCvd))}
${row('Median CVD', (s) => fmtM(s.medianCvd))}
${row('P10 / P90', (s) => `${fmtM(s.p10Cvd)} / ${fmtM(s.p90Cvd)}`)}
${row('Min / Max', (s) => `${fmtM(s.minCvd)} / ${fmtM(s.maxCvd)}`)}
${row('% CVD < −2M', (s) => `${s.pctBelowNeg2M.toFixed(1)}%`)}
${row('% CVD < −500K (mild soft Long)', (s) => `${s.pctBelowNeg500K.toFixed(1)}%`)}
${row('% CVD < −20M (deep)', (s) => `${s.pctBelowNeg20M.toFixed(1)}%`)}
${row('% CVD > +2M (hard SHORT)', (s) => `${s.pctAbovePos2M.toFixed(1)}%`)}
${row('% Long hard REAL (−20M+mom+EMA)', (s) => `${s.pctLongHardBlockReal.toFixed(1)}%`)}

### Đọc CVD vs XRP fingerprint

- XRP lúc investigate trước: \`% < −2M\` ~92%, \`% < −500K\` ~95% — **denomination signature**.
- ETH fingerprint giống XRP? **${ethLikeXrpDenom ? 'CÓ dấu hiệu giống' : 'KHÔNG — không khớp signature denomination XRP'}**  
  (ETH −2M=${ethCvd.pctBelowNeg2M.toFixed(1)}% / −500K=${ethCvd.pctBelowNeg500K.toFixed(1)}% vs BTC −2M=${btcCvd.pctBelowNeg2M.toFixed(1)}% / −500K=${btcCvd.pctBelowNeg500K.toFixed(1)}%; XRP −2M=${xrpCvd.pctBelowNeg2M.toFixed(1)}% / −500K=${xrpCvd.pctBelowNeg500K.toFixed(1)}%)

---

## 2) Volume / thanh khoản ETH vs BTC

| Metric | ETH | BTC | XRP |
|--------|-----|-----|-----|
${row('Mean 1H volume (base)', (s) => s.meanBarVolumeBase.toFixed(0))}
${row('Mean 24h quote≈USD', (s) => fmtUsd(s.mean24hQuoteUsd))}
${row('Mean |CVD| (base)', (s) => fmtM(s.meanAbsCvd))}
${row('Mean CVD×price (USD-ish)', (s) => fmtUsd(s.meanCvdUsd))}
${row('Mean |CVD×px| / 24h quote', (s) => s.meanAbsCvdOver24hVol.toFixed(3))}

**BTC / ETH 24h quote:** ≈ **${quoteRatioBtcEth.toFixed(2)}×** (BTC thanh khoản USD ${(quoteRatioBtcEth >= 1 ? 'cao hơn' : 'thấp hơn')} ETH).

> Nếu ETH lệch denomination kiểu XRP: base volume lớn + \`%CVD < −500K\` cao trong khi \|CVD×px\|/quote vẫn “bình thường”.  
> \`ethCvdMildVsBtc\` = ${ethCvdMildVsBtc} (ETH soft-hit nhiều hơn BTC ≥20pp).

---

## 3) GROUP-block breakdown (active side)

Ngưỡng V4: A≥${minA}, B≥${minB}, C≥${minC}  
Bars scored: **${bars.length}**  
Bars \`groupBlocks.length>0\`: **${groupBlockBars}**  
Bars bất kỳ nhóm fail: **${barsAnyGroup}**

| Nhóm | Số bar fail | Culprit layer (raw thấp nhất) |
|------|------------:|-------------------------------|
| A (L1–L4) | ${failA} | ${culpritSort(aCulprit) || 'n/a'} |
| B (L5a–L7) | ${failB} | ${culpritSort(bCulprit) || 'n/a'} |
| C (L8–L10) | ${failC} | ${culpritSort(cCulprit) || 'n/a'} |

Trong bar **B fail**: L5a raw &lt; 1 đồng thời = **${bFailAndL5aWeak}** / ${failB || 0} (${failB ? ((bFailAndL5aWeak / failB) * 100).toFixed(0) : 0}%)

### Hard-block named hits (active side messages)

Bars có ≥1 hardBlock: **${hardBlockBars}**  
Top layers: ${culpritSort(hardHits) || 'n/a'}

> Baseline Task 2 top: GROUP(124) → L9(64) → L3(25). Khớp nếu bảng trên cũng dẫn GROUP/L9/L3.

**GROUP vs CVD:** nhóm B chiếm ưu thế? **${groupDominatedByB}**; B chủ yếu L5a? **${bPrimarilyL5a}**.

---

## 4) L3 (MACD) — đặc thù ETH?

Hard L3 khi \`scoreL3V4\` = 0 → push \`L3 MACD vi phạm\` (\`scorerV4.ts\`).

| Metric | ETH | BTC (đối chiếu) |
|--------|-----|-----------------|
| Bars | ${bars.length} | ${btcBars.length} |
| Bars L3 hard-block | ${l3HardBars} (${((l3HardBars / bars.length) * 100).toFixed(1)}%) | ${btcL3Hard} (${((btcL3Hard / btcBars.length) * 100).toFixed(1)}%) |
| Bars L3 score &lt; 1 | ${l3ZeroScore} (${((l3ZeroScore / bars.length) * 100).toFixed(1)}%) | ${btcL3Zero} (${((btcL3Zero / btcBars.length) * 100).toFixed(1)}%) |
| Mean L3 score (active) | ${(l3ScoreSum / Math.max(1, bars.length)).toFixed(2)} | — |
| L3 score dist | 0=${l3ScoreDist['0']}, 1=${l3ScoreDist['1']}, 1.5=${l3ScoreDist['1.5']}, 2=${l3ScoreDist['2']}, other=${l3ScoreDist.other} | — |
| Active LONG bars / both hist&lt;0 | ${longBars} / ${histBothWrongLong} (${longBars ? ((histBothWrongLong / longBars) * 100).toFixed(1) : 0}%) | — |
| Active SHORT bars / both hist&gt;0 | ${shortBars} / ${histBothWrongShort} (${shortBars ? ((histBothWrongShort / shortBars) * 100).toFixed(1) : 0}%) | — |
| 1H hist sign-flips (bar→bar) | ${histSignFlip1h} (${((histSignFlip1h / Math.max(1, bars.length - 1)) * 100).toFixed(1)}% of steps) | ${btcFlip} (${((btcFlip / Math.max(1, btcBars.length - 1)) * 100).toFixed(1)}%) |

**L3 elevated vs BTC?** ${l3Elevated}

Khi active=LONG mà cả 1H+4H histogram âm → L3=0 hard (LONG). Khi SHORT mà cả 2 dương → L3=0 hard (SHORT).  
A-culprit có L3 dẫn đầu → GROUP-A fail một phần do MACD, **không liên quan CVD**.

---

## 5) Baseline7 trades (ETH) — ngữ cảnh WR

${tradeNote}

---

## 6) Kết luận

### Root cause

${rootCause}

### Có nên thêm / sửa riêng ETH?

${recommendAdd}

### Checklist so với XRP (tóm tắt)

| Check | XRP (trước) | ETH (task này) |
|-------|-------------|----------------|
| % CVD &lt; −2M cao vs BTC | Có (~92%) | ${ethCvd.pctBelowNeg2M.toFixed(1)}% (BTC ${btcCvd.pctBelowNeg2M.toFixed(1)}%) |
| % CVD &lt; −500K rất cao | Có (~95%) | ${ethCvd.pctBelowNeg500K.toFixed(1)}% |
| GROUP-B + L5a yếu đa số | Có (~71% B-fail) | B-fail L5a yếu ${failB ? ((bFailAndL5aWeak / failB) * 100).toFixed(0) : 0}% |
| L3 trong top hard | Không nổi | ${l3Elevated ? 'Có dấu hiệu nổi' : 'Không nổi hơn BTC đáng kể'} |

**CHƯA** thử nghiệm sửa / patch / backtest option. Dừng chờ review trước Task tiếp.

## Artefacts

- Report: \`docs/exports/REPORT_INVESTIGATE_ETH_V4_2026-08-09.md\`
- Script: \`scripts/investigate-eth-v4-wr.test.ts\`
- Baseline CSV: \`docs/exports/eth_baseline7_v3v4_trusted_21d_v4_trades.csv\`
`;

      const mdPath = path.join(OUT, `REPORT_INVESTIGATE_ETH_V4_${stamp}.md`);
      fs.writeFileSync(mdPath, md, 'utf8');
      console.log(`[eth-invest] wrote ${mdPath}`);
      console.log(`[eth-invest] root: ${rootCause.slice(0, 120)}…`);
    },
  );
});
