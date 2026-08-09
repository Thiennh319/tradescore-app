/**
 * Task 5 verify — V4 trusted-window backtest for full board 8-coin list.
 * Absolute CVD (FORCE) so numbers compare to REPORT_BASELINE_7COIN_V4.
 * Keep symbols hardcoded (avoid importing constants/scoring → RN via tsx).
 * Must match TRADE_SYMBOLS in constants/scoring.ts.
 *
 * Usage: npx tsx scripts/backtest-v4-board-8coin-trusted.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './backtest-v3v4-xrp-trusted-window';
import { computeStats, type TradeRow } from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../docs/exports');
const DAYS = 21;
const OUT_TAG = 'board8';

/** Mirror of TRADE_SYMBOLS after Task 5 — do not import scoring.ts (RN). */
const SYMBOLS = [
  'BTCUSDT',
  'NEARUSDT',
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
    console.log(`\n========== BOARD8 ${symbol} ==========`);
    process.argv = [
      process.argv[0] ?? 'node',
      'backtest-v4-board-8coin-trusted.ts',
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
      `REPORT_BACKTEST_${symbol.replace('USDT', '')}_BOARD8_V4_TRUSTED_${stamp}.md`,
    );
    // trusted-window script names vary by out-tag — prefer board8-named report from main
    const mdAlt = path.join(
      OUT,
      `REPORT_BACKTEST_${symbol.replace('USDT', '')}${OUT_TAG.toUpperCase()}_V4_TRUSTED_${stamp}.md`,
    );
    const mdPath = fs.existsSync(mdWritten)
      ? mdWritten
      : fs.existsSync(mdAlt)
        ? mdAlt
        : mdWritten;
    const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
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
      oiSpan: parseSpan(md, 'OI hist span'),
      lsSpan: parseSpan(md, 'LS hist span'),
      csvPath,
      mdPath,
      verdict: wr > 70 ? 'OK' : 'INVESTIGATE',
    });
    console.log(
      `[board8] ${symbol} n=${stats.n} WR=${wr.toFixed(1)}% → ${wr > 70 ? 'OK' : 'INVESTIGATE'}`,
    );
  }

  const tableBody = rows
    .map((r) => {
      const coin = r.symbol.replace('USDT', '');
      return `| ${coin} | ${r.n} | ${r.wr.toFixed(1)}% | ${fmtPf(r.pf)} | ${r.expR.toFixed(3)} | ${r.longPct.toFixed(0)}% | ${r.verdict} |`;
    })
    .join('\n');

  const report = `# REPORT — Board 8-coin V4 trusted window (Task 5 verify)

**Ngày:** ${stamp}  
**Chạy lúc:** ${endIso}  
**TRADE_SYMBOLS:** \`${SYMBOLS.join(', ')}\`  
**CVD:** \`TRADESCORE_FORCE_ABSOLUTE_CVD=1\` (so sánh với baseline7; production XRP vẫn Option A khi app chạy)  
**Cửa sổ:** \`--days ${DAYS}\` · \`--out-tag ${OUT_TAG}\` · \`--v4-only\`  
**Script:** \`scripts/backtest-v4-board-8coin-trusted.ts\`

## Bảng V4

| Coin | n | WR | PF | E[R] | %Long | Verdict |
|------|--:|---:|---:|------:|------:|---------|
${tableBody}

## Artefacts

${rows
  .map(
    (r) =>
      `- **${r.symbol}:** \`${path.relative(path.resolve(__dirname, '..'), r.csvPath)}\``,
  )
  .join('\n')}
`;

  const reportPath = path.join(OUT, `REPORT_BOARD_8COIN_V4_TRUSTED_${stamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n[board8] wrote ${reportPath}`);
  for (const r of rows) {
    console.log(
      `  ${r.symbol.replace('USDT', '')}: n=${r.n} WR=${r.wr.toFixed(1)}% PF=${fmtPf(r.pf)} → ${r.verdict}`,
    );
  }
}

const isDirect =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
