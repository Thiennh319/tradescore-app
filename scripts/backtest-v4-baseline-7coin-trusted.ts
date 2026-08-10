/**
 * TASK 2/9 — Baseline V4 absolute CVD, 7-coin trusted window (~21d / OI∩LS ~20.8d).
 *
 * Does NOT apply XRP Option A (FORCE_ABSOLUTE_CVD=1).
 * Writes CSVs under *_baseline7_* so prior peer CSVs are not overwritten.
 *
 * Usage:
 *   npx tsx scripts/backtest-v4-baseline-7coin-trusted.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './backtest-v3v4-xrp-trusted-window';
import { computeStats, type TradeRow } from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/exports');
const DAYS = 21;
const OUT_TAG = 'baseline7';
/** Same order as request: BTC, SOL, BNB, XRP, ETH, LINK, AVAX */
const SYMBOLS = [
  'BTCUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'ETHUSDT',
  'LINKUSDT',
  'AVAXUSDT',
] as const;

type Row = {
  symbol: string;
  n: number;
  wr: number;
  pf: number;
  expR: number;
  longPct: number;
  topHard: string;
  oiSpan: number | null;
  lsSpan: number | null;
  csvPath: string;
  mdPath: string;
  verdict: 'OK' | 'INVESTIGATE';
};

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

function topHardLayers(md: string): string {
  const engineIdx = md.indexOf('### V4');
  if (engineIdx < 0) return 'n/a';
  const section = md.slice(engineIdx);
  const marker = '**Hard-block layer contributors';
  const hi = section.indexOf(marker);
  if (hi < 0) return 'n/a';
  const after = section.slice(hi);
  const tableMatch = after.match(
    /\| Layer \| Hits \|\r?\n\|[-:\s|]+\|\r?\n((?:\|[^\n]+\|\r?\n)+)/,
  );
  if (!tableMatch) return 'n/a';
  const rows = tableMatch[1]
    .trim()
    .split(/\r?\n/)
    .map((l) => {
      const parts = l.split('|').map((p) => p.trim()).filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}(${parts[1]})` : '';
    })
    .filter(Boolean);
  return rows.slice(0, 3).join(', ') || 'n/a';
}

function parseSpan(md: string, label: 'OI hist span' | 'LS hist span'): number | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([0-9.]+)d`);
  const m = md.match(re);
  return m ? Number(m[1]) : null;
}

function longPct(rows: TradeRow[]): number {
  if (rows.length === 0) return 0;
  return (rows.filter((r) => r.side === 'LONG').length / rows.length) * 100;
}

function fmtPf(pf: number): string {
  return Number.isFinite(pf) ? pf.toFixed(2) : '∞';
}

export async function run(): Promise<void> {
  process.env.TRADESCORE_FORCE_ABSOLUTE_CVD = '1';
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const endIso = new Date().toISOString();
  const rows: Row[] = [];

  for (const symbol of SYMBOLS) {
    console.log(`\n========== BASELINE7 ${symbol} ==========`);
    process.argv = [
      process.argv[0] ?? 'node',
      'backtest-v4-baseline-7coin-trusted.ts',
      '--symbol',
      symbol,
      '--days',
      String(DAYS),
      '--out-tag',
      OUT_TAG,
      '--v4-only',
      '--force-absolute-cvd',
    ];
    await main();

    const short = symbol.replace('USDT', '').toLowerCase();
    const csvPath = path.join(
      OUT,
      `${short}_${OUT_TAG}_v3v4_trusted_${DAYS}d_v4_trades.csv`,
    );
    const mdWritten = path.join(
      OUT,
      `REPORT_BACKTEST_${symbol.replace('USDT', '')}_BASELINE7_V4_TRUSTED_${stamp}.md`,
    );
    const md = fs.existsSync(mdWritten) ? fs.readFileSync(mdWritten, 'utf8') : '';
    const trades = parseCsv(csvPath);
    const stats = computeStats(trades);
    const wr = stats.wr;
    rows.push({
      symbol,
      n: stats.n,
      wr,
      pf: stats.pf,
      expR: stats.expectancyR,
      longPct: longPct(trades),
      topHard: topHardLayers(md),
      oiSpan: parseSpan(md, 'OI hist span'),
      lsSpan: parseSpan(md, 'LS hist span'),
      csvPath,
      mdPath: mdWritten,
      verdict: wr > 70 ? 'OK' : 'INVESTIGATE',
    });
    console.log(
      `[baseline7] ${symbol} n=${stats.n} WR=${wr.toFixed(1)}% → ${wr > 70 ? 'OK' : 'INVESTIGATE'}`,
    );
  }

  const trustedMin = Math.min(
    ...rows.map((r) => Math.min(r.oiSpan ?? DAYS, r.lsSpan ?? DAYS)),
  );

  const tableBody = rows
    .map((r) => {
      const coin = r.symbol.replace('USDT', '');
      const flag =
        r.verdict === 'OK'
          ? 'OK, không cần sửa gì'
          : 'Cần điều tra ở Task 3';
      return `| ${coin} | ${r.n} | ${r.wr.toFixed(1)}% | ${fmtPf(r.pf)} | ${r.expR.toFixed(3)} | ${r.longPct.toFixed(0)}% | ${r.topHard} | ${flag} |`;
    })
    .join('\n');

  const report = `# REPORT — Baseline 7-coin V4 (absolute CVD) trusted window

**Ngày:** ${stamp}  
**Chạy lúc (Date.now end):** ${endIso}  
**Task:** 2/9 — baseline so sánh công bằng, **chưa** áp dụng XRP Option A 9%  
**Logic:** \`scoreAnalysisV4\` + \`canEnterV4\` + \`calculateTradePlanV4\` + ambiguity **2.5** + ADX gate  
**CVD:** \`TRADESCORE_FORCE_ABSOLUTE_CVD=1\` → ngưỡng CVD tuyệt đối gốc cho **tất cả 7 coin** (kể cả XRP)  
**Cửa sổ yêu cầu:** \`--days ${DAYS}\` (Task 1 trusted ~20.8d OI∩LS; min OI/LS đo được trong run ≈ **${trustedMin.toFixed(2)}d**)  
**Script:** \`scripts/backtest-v4-baseline-7coin-trusted.ts\` → \`backtest-v3v4-xrp-trusted-window.ts --v4-only --out-tag baseline7\`  
**Không:** sửa production rule (flag chỉ tắt Option A trong research), không V41, không Task 3

## Bảng baseline V4

| Coin | n | WR | PF | E[R] | %Long | Top hard-block layer | Verdict |
|------|--:|---:|---:|------:|------:|----------------------|---------|
${tableBody}

### Quy ước đánh dấu

- **WR > 70%** → \`OK, không cần sửa gì\`
- **WR ≤ 70%** → \`Cần điều tra ở Task 3\`

### Span OI/LS từng coin (đối chiếu)

| Coin | OI span (d) | LS span (d) |
|------|------------:|------------:|
${rows
  .map(
    (r) =>
      `| ${r.symbol.replace('USDT', '')} | ${r.oiSpan?.toFixed(2) ?? 'n/a'} | ${r.lsSpan?.toFixed(2) ?? 'n/a'} |`,
  )
  .join('\n')}

## Artefacts (CSV riêng — không ghi đè \`*_v3v4_trusted_21d_*\` cũ)

${rows
  .map(
    (r) =>
      `- **${r.symbol}:** \`${path.relative(path.resolve(__dirname, '..'), r.csvPath)}\` · md \`${path.relative(path.resolve(__dirname, '..'), r.mdPath)}\``,
  )
  .join('\n')}

## Dừng

Task 2/9 xong — **chờ review trước Task 3**.
`;

  const reportPath = path.join(OUT, `REPORT_BASELINE_7COIN_V4_${stamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n[baseline7] wrote ${reportPath}`);
  for (const r of rows) {
    console.log(
      `  ${r.symbol.replace('USDT', '')}: n=${r.n} WR=${r.wr.toFixed(1)}% PF=${fmtPf(r.pf)} E[R]=${r.expR.toFixed(3)} L%=${r.longPct.toFixed(0)} → ${r.verdict}`,
    );
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('backtest-v4-baseline-7coin-trusted.ts') ||
    process.argv[1].endsWith('backtest-v4-baseline-7coin-trusted.js'));

if (isDirectRun) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}