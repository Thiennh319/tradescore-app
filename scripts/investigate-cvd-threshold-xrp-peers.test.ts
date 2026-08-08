/**
 * Điều tra CVD raw + volume 4 coin (21d) — KHÔNG sửa production.
 * So sánh ngưỡng HARD_BLOCK_RULES_V4 (±2M base) và hard LONG thực tế (−20M + momentum).
 *
 *   npx vitest run scripts/investigate-cvd-threshold-xrp-peers.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { HARD_BLOCK_RULES_V4, type AppTradeSymbol } from '../constants/scoring';
import { MARKET_KLINE_LIMIT } from '../services/marketAnalysisFetch';
import {
  analyzeCVD,
  buildCVDPointsFromKlines,
  evaluateLongCvdHardBlock,
  getEMAAnalysisV3,
} from '../services/indicators';
import {
  loadMarketBundle,
  WARMUP_1H,
  type MarketBundle,
} from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/exports');
const SYMBOLS: AppTradeSymbol[] = ['XRPUSDT', 'BTCUSDT', 'SOLUSDT', 'BNBUSDT'];
const DAYS = 21;

/** Deep LONG hard (thực tế trong evaluateLongCvdHardBlock) — không phải −2M. */
const CVD_DEEP_LONG = -20_000_000;

type CoinCvdStats = {
  symbol: string;
  bars: number;
  /** CVD raw (base asset units) tại cuối cửa sổ rolling MARKET_KLINE_LIMIT */
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
  /** Long hard block path thật: STRONG_BEARISH + price < EMA20 */
  pctLongHardBlockReal: number;
  /** Short hard: CVD > +2M */
  pctShortHardBlock2M: number;
  meanAbsCvd: number;
  meanBarVolumeBase: number;
  mean24hQuoteUsd: number;
  /** CVD × price (USD-ish notional of cumulative delta) */
  meanCvdUsd: number;
  medianCvdUsd: number;
  pctCvdUsdBelowNeg2M: number;
  pctCvdUsdAbovePos2M: number;
  meanAbsCvdOver24hVol: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function analyzeCoin(bundle: MarketBundle): CoinCvdStats {
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
  let shortHb = 0;
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

    // 24h quote volume ≈ sum(vol*close) over last 24 closed 1H bars
    const last24 = win1h.slice(-24);
    const q24 = last24.reduce((s, k) => s + k.volume * k.close, 0);
    quote24hs.push(q24);
    if (q24 > 0) absOverVol.push(Math.abs(currentCvd * price) / q24);

    if (currentCvd < HARD_BLOCK_RULES_V4.CVD_LONG_HARD_BLOCK) below2M += 1;
    if (currentCvd < HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE) below500K += 1;
    if (currentCvd < CVD_DEEP_LONG) below20M += 1;
    if (currentCvd > HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK) above2M += 1;
    if (longMsg) longHb += 1;
    if (currentCvd > HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK) shortHb += 1;
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
    pctShortHardBlock2M: pct(shortHb),
    meanAbsCvd: mean(cvds.map(Math.abs)),
    meanBarVolumeBase: mean(volumes),
    mean24hQuoteUsd: mean(quote24hs),
    meanCvdUsd: mean(cvdUsds),
    medianCvdUsd: percentile(sortedUsd, 50),
    pctCvdUsdBelowNeg2M: pct(cvdUsds.filter((v) => v < -2_000_000).length),
    pctCvdUsdAbovePos2M: pct(cvdUsds.filter((v) => v > 2_000_000).length),
    meanAbsCvdOver24hVol: mean(absOverVol),
  };
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

describe('investigate-cvd-threshold-xrp-peers', () => {
  it(
    'CVD raw + volume compare 4 coins 21d',
    { timeout: 600_000 },
    async () => {
      const stats: CoinCvdStats[] = [];
      for (const symbol of SYMBOLS) {
        console.log(`[cvd-invest] load ${symbol}…`);
        const bundle = await loadMarketBundle(symbol, DAYS);
        stats.push(analyzeCoin(bundle));
      }

      const xrp = stats.find((s) => s.symbol === 'XRPUSDT')!;
      const peers = stats.filter((s) => s.symbol !== 'XRPUSDT');
      const volRatioVsBtc =
        xrp.mean24hQuoteUsd > 0 && peers[0]
          ? peers.find((p) => p.symbol === 'BTCUSDT')!.mean24hQuoteUsd /
            xrp.mean24hQuoteUsd
          : 0;

      // Verdict logic
      const xrpHitsNeg2MOften = xrp.pctBelowNeg2M >= 40;
      const btcRarelyNeg2M =
        (peers.find((p) => p.symbol === 'BTCUSDT')?.pctBelowNeg2M ?? 0) < 15;
      const xrpDeepLongHbRare = xrp.pctLongHardBlockReal < 5;
      const xrpSoftNegOften = xrp.pctBelowNeg500K >= 50;

      let verdict: string;
      let proposalNeeded: boolean;

      if (xrpHitsNeg2MOften && btcRarelyNeg2M && xrp.meanAbsCvdOver24hVol < 0.5) {
        verdict =
          'NGƯỠNG TUYỆT ĐỐI (±2M **base asset**) đang scale kém theo thanh khoản: ' +
          'XRP (volume base lớn) dễ vượt −2M/đủ để soft-block L5a hơn BTC. ' +
          'Hard LONG thật (−20M + STRONG_BEARISH) có thể ít hơn soft — kiểm tra bảng. ' +
          '→ Nên cân nhắc ngưỡng tương đối / theo nhóm thanh khoản — **chưa sửa code**.';
        proposalNeeded = true;
      } else if (xrp.pctBelowNeg20M > 30 && xrp.pctLongHardBlockReal > 15) {
        verdict =
          'CVD XRP âm sâu thật (−20M+) + hard LONG path kích hoạt thường xuyên → ' +
          'rule đang phản ánh dòng tiền rút / bán áp đảo, **không phải chỉ lỗi ngưỡng −2M**. ' +
          'Không cần sửa threshold chỉ vì 0% Long sample này.';
        proposalNeeded = false;
      } else if (xrpSoftNegOften && xrp.pctLongHardBlockReal < 5) {
        verdict =
          'Soft path (CVD < −500K / L5a < 1) và/hoặc −2M base đang siết Long XRP nhiều, ' +
          'trong khi hard LONG (−20M) ít — lệch soft-threshold tuyệt đối theo base volume. ' +
          'Đề xuất relative threshold; hard −20M có thể giữ nếu ít kích hoạt.';
        proposalNeeded = true;
      } else {
        verdict =
          'Hỗn hợp: xem số liệu bảng. Kiểm tra CVD USD-normalized trước khi đổi constants.';
        proposalNeeded = true;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const mdPath = path.join(
        OUT,
        `REPORT_INVESTIGATE_CVD_THRESHOLD_XRP_PEERS_21d_${stamp}.md`,
      );

      const row = (label: string, pick: (s: CoinCvdStats) => string) =>
        `| ${label} | ${stats.map(pick).join(' | ')} |`;

      const md = `# INVESTIGATE — CVD ngưỡng tuyệt đối vs XRP / BTC / SOL / BNB (21d)

**Ngày:** ${stamp}  
**Phạm vi:** đọc số liệu — **KHÔNG sửa code**  
**CVD pipeline:** \`buildCVDPointsFromKlines\` trên rolling \`MARKET_KLINE_LIMIT=${MARKET_KLINE_LIMIT}\` (giống live \`buildInput\`)  
**Đơn vị CVD:** tích lũy **base asset volume delta** (taker buy − sell), **không phải USD**

## Clarification ngưỡng (quan trọng)

| Hằng / path | Giá trị | Dùng thực tế |
|-------------|---------|--------------|
| \`HARD_BLOCK_RULES_V4.CVD_LONG_HARD_BLOCK\` | **−2M** | **Không** gọi trong \`evaluateLongCvdHardBlock\` — gần như “mồ côi” cho hard LONG |
| \`HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK\` | **+2M** | Hard-block **SHORT** khi \`currentCvd > +2M\` |
| \`CVD_MILD_NEGATIVE\` | **−500K** | Soft scoring Long (L5a score 0 → soft-block \`blockReasons\`) |
| Hard LONG thật | **CVD < −20M** + momentum \`STRONG_BEARISH\` + price < EMA20 | \`evaluateLongCvdHardBlock\` trong \`indicators.ts\` |

User hỏi −2M ở \`scoring.ts:741-742\`: đó là \`CVD_LONG_HARD_BLOCK\`, nhưng **hard LONG live không dùng −2M**. Soft Long và hard Short (+2M) vẫn dùng ngưỡng tuyệt đối base — scale theo coin.

## 1) CVD raw (base) — tần suất chạm ngưỡng

| Metric | ${SYMBOLS.map((s) => s.replace('USDT', '')).join(' | ')} |
|--------|${SYMBOLS.map(() => '---').join('|')}|
${row('Bars', (s) => String(s.bars))}
${row('Mean CVD', (s) => fmtM(s.meanCvd))}
${row('Median CVD', (s) => fmtM(s.medianCvd))}
${row('P10 / P90', (s) => `${fmtM(s.p10Cvd)} / ${fmtM(s.p90Cvd)}`)}
${row('Min / Max', (s) => `${fmtM(s.minCvd)} / ${fmtM(s.maxCvd)}`)}
${row('% CVD < −2M (CVD_LONG_HARD_BLOCK)', (s) => `${s.pctBelowNeg2M.toFixed(1)}%`)}
${row('% CVD < −500K (mild soft Long)', (s) => `${s.pctBelowNeg500K.toFixed(1)}%`)}
${row('% CVD < −20M (deep, hard-LONG candidate)', (s) => `${s.pctBelowNeg20M.toFixed(1)}%`)}
${row('% CVD > +2M (hard SHORT)', (s) => `${s.pctAbovePos2M.toFixed(1)}%`)}
${row('% Long hard REAL (STRONG_BEARISH+EMA)', (s) => `${s.pctLongHardBlockReal.toFixed(1)}%`)}

## 2) Volume / thanh khoản cùng cửa sổ

| Metric | ${SYMBOLS.map((s) => s.replace('USDT', '')).join(' | ')} |
|--------|${SYMBOLS.map(() => '---').join('|')}|
${row('Mean 1H volume (base)', (s) => s.meanBarVolumeBase.toFixed(0))}
${row('Mean 24h quote≈USD', (s) => fmtUsd(s.mean24hQuoteUsd))}
${row('Mean |CVD|', (s) => fmtM(s.meanAbsCvd))}
${row('Mean CVD×price (USD-ish)', (s) => fmtUsd(s.meanCvdUsd))}
${row('Median CVD×price', (s) => fmtUsd(s.medianCvdUsd))}
${row('% (CVD×px) < −$2M', (s) => `${s.pctCvdUsdBelowNeg2M.toFixed(1)}%`)}
${row('% (CVD×px) > +$2M', (s) => `${s.pctCvdUsdAbovePos2M.toFixed(1)}%`)}
${row('Mean |CVD×px| / 24h quote', (s) => s.meanAbsCvdOver24hVol.toFixed(3))}

**XRP 24h quote vs BTC:** BTC/XRP ≈ **${volRatioVsBtc.toFixed(1)}×** (BTC thanh khoản USD cao hơn bấy nhiêu lần trên cửa sổ này).

## 3) Verdict

${verdict}

**proposalNeeded:** ${proposalNeeded}

## 4) Đề xuất (CHỈ đề xuất — chưa sửa)

${
  proposalNeeded
    ? `### Option A — Ngưỡng CVD tương đối theo volume
- Soft: thay −500K / −2M bằng % cumulative delta / rolling 24h base (hoặc quote) volume, cùng percentile target trên BTC làm chuẩn.
- Hard SHORT: \`currentCvd > k * vol24hBase\` thay vì \`> 2_000_000\`.
- Hard LONG (−20M): scale tương tự theo median \`|CVD|\` từng symbol hoặc theo quote USD.

### Option B — Nhóm thanh khoản
- **Tier1 BTC (và ETH nếu có):** giữ ±2M / −20M gần như hiện tại.
- **Tier2 large alt (SOL/BNB):** ngưỡng base × hệ số theo median volume ratio vs BTC.
- **Tier3 mid alt (XRP/NEAR…):** ngưỡng thấp hơn theo base (vì volume base lớn) **hoặc** chuyển hết sang USD-notional CVD.

### Ước cải thiện / rủi ro
- Kỳ vọng: Long XRP có tỷ lệ pass L5a soft tăng; giảm false hard SHORT khi CVD base dương nhỏ so với USD.
- Rủi ro: nới quá → nhiều Long yếu khi thật sự distribution; cần backtest peers lại 21d+ trước khi ship.
- L5a xuất hiện top hard-block XRP (không ở peers) khớp giả thuyết **scale tuyệt đối** nếu bảng trên cho thấy XRP \`% < −2M\` / soft cao hơn rõ.
`
    : `Không đề xuất đổi threshold. Ghi nhận: CVD XRP phản ánh bán/áp lực thật trong sample — tránh “sửa nhầm” làm loãng Short edge đang có.
`
}

## Artefacts / code refs

- Soft Long: \`CVD_MILD_NEGATIVE\` + L5a score&lt;1 → \`blockReasons\` (\`scorerV4.ts\`)
- Hard Short: \`CVD_SHORT_HARD_BLOCK\` +2M
- Hard Long: \`evaluateLongCvdHardBlock\` (−20M deep) — **không** dùng \`CVD_LONG_HARD_BLOCK\` −2M
`;

      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(mdPath, md, 'utf8');
      const jsonPath = path.join(
        OUT,
        `investigate_cvd_threshold_xrp_peers_21d_${stamp}.json`,
      );
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({ verdict, proposalNeeded, stats }, null, 2),
        'utf8',
      );
      console.log(`[cvd-invest] ${mdPath}`);
      for (const s of stats) {
        console.log(
          `[cvd-invest] ${s.symbol} medCVD=${fmtM(s.medianCvd)} %<-2M=${s.pctBelowNeg2M.toFixed(1)} %<-20M=${s.pctBelowNeg20M.toFixed(1)} %+2M=${s.pctAbovePos2M.toFixed(1)} longHB=${s.pctLongHardBlockReal.toFixed(1)} vol24h=${fmtUsd(s.mean24hQuoteUsd)}`,
        );
      }
      console.log(`[cvd-invest] VERDICT: ${verdict.slice(0, 200)}…`);
    },
  );
});
