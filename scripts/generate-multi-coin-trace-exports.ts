/**
 * Generate 5 Trace files × NEAR / SOL / BNB from a real scanAllSignalRows snapshot.
 * Uses context.coin to force the symbol (no BTC-first pickFrozenRow default).
 *
 * Usage: npx tsx scripts/generate-multi-coin-trace-exports.ts
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
  type AppTradeSymbol,
} from '../constants/scoring';
import {
  exportTraceOrReviewMarkdown,
  type TraceReviewExportKind,
} from '../services/exportTraceReviewWire';
import { scanAllSignalRows, type SignalRow } from '../services/signalBoardScan';

const TARGET_COINS: AppTradeSymbol[] = ['NEARUSDT', 'SOLUSDT', 'BNBUSDT'];

const TRACE_KINDS: readonly {
  kind: TraceReviewExportKind;
  prefix: string;
}[] = [
  { kind: 'trace-rulebook', prefix: '01_RULEBOOK' },
  { kind: 'trace-score', prefix: '02_SCORE_ENGINE' },
  { kind: 'trace-entry', prefix: '03_ENTRY_DECISION' },
  { kind: 'trace-position', prefix: '04_POSITION_ADVISER' },
  { kind: 'trace-tradeplan', prefix: '05_TRADE_PLAN' },
];

const OUT_DIR = path.join(process.cwd(), 'docs', 'exports', 'multi-coin-trace');

type CoinReport = {
  coin: AppTradeSymbol;
  ok: boolean;
  error?: string;
  rowSummary?: {
    symbol: string;
    price: number;
    error?: string;
    hasV4: boolean;
    hasPlanV4: boolean;
  };
  files: Array<{
    path: string;
    kind: TraceReviewExportKind;
    bytes: number;
    coinMetadata: string | null;
    coinMatch: boolean | null;
    structuralNotes: string[];
  }>;
};

function extractCoinLine(markdown: string): string | null {
  const m = markdown.match(/^Coin:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function structuralChecks(markdown: string, kind: TraceReviewExportKind): string[] {
  const notes: string[] = [];
  if (!markdown || markdown.trim().length < 40) {
    notes.push('Markdown quá ngắn / rỗng');
  }
  if (markdown.includes('undefined')) {
    notes.push('Chứa literal "undefined"');
  }
  if (/\bNaN\b/.test(markdown)) {
    notes.push('Chứa NaN');
  }
  // Section headers expected per kind (loose)
  const expected: Record<string, string[]> = {
    'trace-rulebook': ['# METADATA', '# RULE'],
    'trace-score': ['# METADATA', '# SCORE'],
    'trace-entry': ['# METADATA', '# ENTRY'],
    'trace-position': ['# METADATA'],
    'trace-tradeplan': ['# METADATA', '# ENTRY PLAN'],
  };
  for (const h of expected[kind] ?? []) {
    if (!markdown.includes(h)) {
      notes.push(`Thiếu section gần đúng: ${h}`);
    }
  }
  // Truncation heuristic: ends mid-word without newline often still ok; check abrupt cut
  if (markdown.trimEnd().endsWith('...') && markdown.length < 200) {
    notes.push('Có vẻ bị cắt cụt');
  }
  return notes;
}

async function main() {
  console.log('Scanning TRADE_SYMBOLS via scanAllSignalRows (live Binance)...');
  const emptyScanContext = {
    consecutiveLosses: 0,
    consecutiveLossesIn24h: 0,
    lossStreakLocked: false,
    lossStreakLockUntil: null as number | null,
    dailyLossUSDT: 0,
    recentJournal: [] as { outcome: unknown }[],
  };

  let rows: SignalRow[];
  try {
    rows = await scanAllSignalRows(
      '1h',
      DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
      emptyScanContext,
    );
  } catch (e) {
    console.error('scanAllSignalRows FAILED:', e);
    process.exit(1);
  }

  const scannedAt = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const snapshotPath = path.join(OUT_DIR, `_scan_snapshot_${scannedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        scannedAt,
        symbols: rows.map((r) => ({
          symbol: r.symbol,
          price: r.price,
          error: r.error,
          hasV4: r.v4 != null,
          hasPlanV4: r.planV4 != null,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log('Snapshot meta:', snapshotPath);

  const reports: CoinReport[] = [];
  const exportedAt = scannedAt;

  for (const coin of TARGET_COINS) {
    const row = rows.find((r) => r.symbol === coin);
    const report: CoinReport = { coin, ok: false, files: [] };

    if (row == null) {
      report.error = `Không có row cho ${coin} trong kết quả scan (chưa từng scan / thiếu symbol).`;
      reports.push(report);
      console.error(report.error);
      continue;
    }

    report.rowSummary = {
      symbol: row.symbol,
      price: row.price,
      error: row.error,
      hasV4: row.v4 != null,
      hasPlanV4: row.planV4 != null,
    };

    if (row.error) {
      report.error = `Row ${coin} đang lỗi — không generate mock. error=${row.error}`;
      reports.push(report);
      console.error(report.error);
      continue;
    }

    const context = {
      rows,
      scorerVersion: 'v4' as const,
      exportedAt,
      coin,
      openTrades: [] as const,
    };

    let allOk = true;
    for (const { kind, prefix } of TRACE_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, context);
      if (!result.ok) {
        allOk = false;
        report.files.push({
          path: '',
          kind,
          bytes: 0,
          coinMetadata: null,
          coinMatch: null,
          structuralNotes: [`export failed: ${result.message}`],
        });
        continue;
      }

      const fileName = `${prefix}_${coin}.md`;
      const filePath = path.join(OUT_DIR, fileName);
      fs.writeFileSync(filePath, result.markdown, 'utf8');

      const coinLine = extractCoinLine(result.markdown);
      const coinMatch = coinLine != null ? coinLine === coin : null;
      const notes = structuralChecks(result.markdown, kind);
      if (coinMatch === false) {
        notes.push(`Coin metadata lệch: expected ${coin}, got ${coinLine}`);
      }
      if (coinMatch === null) {
        notes.push('Không tìm thấy dòng Coin: trong markdown');
      }

      report.files.push({
        path: filePath,
        kind,
        bytes: Buffer.byteLength(result.markdown, 'utf8'),
        coinMetadata: coinLine,
        coinMatch,
        structuralNotes: notes,
      });
    }

    report.ok = allOk && report.files.every((f) => f.path && f.coinMatch !== false);
    reports.push(report);
  }

  const summaryPath = path.join(OUT_DIR, 'GENERATE_REPORT.md');
  const summaryJson = path.join(OUT_DIR, 'GENERATE_REPORT.json');
  fs.writeFileSync(summaryJson, JSON.stringify({ scannedAt, snapshotPath, reports }, null, 2), 'utf8');

  const mdLines: string[] = [
    '# Multi-coin Trace Export Generate Report',
    '',
    `**Scanned at:** ${scannedAt}`,
    `**Snapshot meta:** \`${path.relative(process.cwd(), snapshotPath)}\``,
    `**Output dir:** \`${path.relative(process.cwd(), OUT_DIR)}\``,
    '',
    '## Per coin',
    '',
  ];

  for (const r of reports) {
    mdLines.push(`### ${r.coin} — ${r.ok ? 'OK' : 'FAILED / SKIPPED'}`);
    mdLines.push('');
    if (r.error) mdLines.push(`- **Error:** ${r.error}`);
    if (r.rowSummary) {
      mdLines.push(`- Price: ${r.rowSummary.price}`);
      mdLines.push(`- hasV4: ${r.rowSummary.hasV4}, hasPlanV4: ${r.rowSummary.hasPlanV4}`);
    }
    mdLines.push('');
    for (const f of r.files) {
      const rel = f.path ? path.relative(process.cwd(), f.path) : '(not written)';
      mdLines.push(
        `- \`${rel}\` (${f.bytes} B) Coin:=${f.coinMetadata ?? 'MISSING'} match=${String(f.coinMatch)}`,
      );
      for (const n of f.structuralNotes) {
        mdLines.push(`  - warning: ${n}`);
      }
    }
    mdLines.push('');
  }

  const written = reports.flatMap((r) => r.files.filter((f) => f.path).map((f) => f.path));
  mdLines.push('## Totals');
  mdLines.push('');
  mdLines.push(`- Files written: **${written.length}** / 15 expected`);
  mdLines.push(`- Coins OK: ${reports.filter((r) => r.ok).map((r) => r.coin).join(', ') || '(none)'}`);
  mdLines.push('');

  fs.writeFileSync(summaryPath, mdLines.join('\n'), 'utf8');
  console.log(mdLines.join('\n'));
  console.log('Wrote', summaryPath);

  if (written.length < 15 || reports.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
