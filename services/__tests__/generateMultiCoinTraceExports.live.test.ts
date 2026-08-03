/**
 * Live generate: 5 Trace files × NEAR/SOL/BNB from real scanAllSignalRows.
 * Not a unit assertion suite — writes docs/exports/multi-coin-trace/*.md
 *
 * Run: npx vitest run services/__tests__/generateMultiCoinTraceExports.live.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST, type AppTradeSymbol } from '../../constants/scoring';
import {
  exportTraceOrReviewMarkdown,
  type TraceReviewExportKind,
} from '../exportTraceReviewWire';
import { scanAllSignalRows, type SignalRow } from '../signalBoardScan';

const TARGET_COINS: AppTradeSymbol[] = ['NEARUSDT', 'SOLUSDT', 'BNBUSDT'];

const TRACE_KINDS: readonly { kind: TraceReviewExportKind; prefix: string }[] = [
  { kind: 'trace-rulebook', prefix: '01_RULEBOOK' },
  { kind: 'trace-score', prefix: '02_SCORE_ENGINE' },
  { kind: 'trace-entry', prefix: '03_ENTRY_DECISION' },
  { kind: 'trace-position', prefix: '04_POSITION_ADVISER' },
  { kind: 'trace-tradeplan', prefix: '05_TRADE_PLAN' },
];

const OUT_DIR = path.join(process.cwd(), 'docs', 'exports', 'multi-coin-trace');

function extractCoinLine(markdown: string): string | null {
  const m = markdown.match(/^Coin:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

describe('generate multi-coin 5-file Trace exports (live scan)', () => {
  it(
    'scans live and writes 15 files for NEAR/SOL/BNB via context.coin',
    { timeout: 180_000 },
    async () => {
      const emptyScanContext = {
        consecutiveLosses: 0,
        consecutiveLossesIn24h: 0,
        lossStreakLocked: false,
        lossStreakLockUntil: null as number | null,
        dailyLossUSDT: 0,
        recentJournal: [] as Array<{ outcome: { status: string } }>,
      };

      let rows: SignalRow[];
      try {
        rows = await scanAllSignalRows(
          '1h',
          DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
          emptyScanContext,
        );
      } catch (e) {
        expect.fail(`scanAllSignalRows failed (network?): ${String(e)}`);
      }

      const scannedAt = new Date().toISOString();
      fs.mkdirSync(OUT_DIR, { recursive: true });

      const snapshotPath = path.join(
        OUT_DIR,
        `_scan_snapshot_${scannedAt.replace(/[:.]/g, '-')}.json`,
      );
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

      type FileInfo = {
        path: string;
        kind: TraceReviewExportKind;
        bytes: number;
        coinMetadata: string | null;
        coinMatch: boolean | null;
        structuralNotes: string[];
      };

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
        files: FileInfo[];
      };

      const reports: CoinReport[] = [];
      const exportedAt = scannedAt;

      for (const coin of TARGET_COINS) {
        const row = rows.find((r) => r.symbol === coin);
        const report: CoinReport = { coin, ok: false, files: [] };

        if (row == null) {
          report.error = `Không có row cho ${coin} trong kết quả scan.`;
          reports.push(report);
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
          report.error = `Row ${coin} đang lỗi — không mock. error=${row.error}`;
          reports.push(report);
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
          const notes: string[] = [];
          if (!markdownHasMeta(result.markdown)) notes.push('Thiếu # METADATA');
          if (result.markdown.includes('undefined')) notes.push('Chứa literal undefined');
          if (/\bNaN\b/.test(result.markdown)) notes.push('Chứa NaN');
          if (coinMatch === false) {
            notes.push(`Coin lệch: expected ${coin}, got ${coinLine}`);
          }
          if (coinMatch === null) notes.push('Không tìm thấy dòng Coin:');

          report.files.push({
            path: filePath,
            kind,
            bytes: Buffer.byteLength(result.markdown, 'utf8'),
            coinMetadata: coinLine,
            coinMatch,
            structuralNotes: notes,
          });
        }

        report.ok =
          allOk &&
          report.files.length === 5 &&
          report.files.every((f) => f.path && f.coinMatch === true);
        reports.push(report);
      }

      const summaryJson = path.join(OUT_DIR, 'GENERATE_REPORT.json');
      const summaryMd = path.join(OUT_DIR, 'GENERATE_REPORT.md');
      fs.writeFileSync(
        summaryJson,
        JSON.stringify({ scannedAt, snapshotPath, reports }, null, 2),
        'utf8',
      );

      const written = reports.flatMap((r) => r.files.filter((f) => f.path).map((f) => f.path));
      const md: string[] = [
        '# Multi-coin Trace Export Generate Report',
        '',
        `**Scanned at:** ${scannedAt}`,
        `**Snapshot:** \`${path.relative(process.cwd(), snapshotPath)}\``,
        `**Output:** \`${path.relative(process.cwd(), OUT_DIR)}\``,
        '',
        `**Files written:** ${written.length} / 15`,
        '',
      ];

      for (const r of reports) {
        md.push(`## ${r.coin} — ${r.ok ? 'OK' : 'FAILED / SKIPPED'}`, '');
        if (r.error) md.push(`- **Error:** ${r.error}`);
        if (r.rowSummary) {
          md.push(
            `- price=${r.rowSummary.price} hasV4=${r.rowSummary.hasV4} hasPlanV4=${r.rowSummary.hasPlanV4}`,
          );
        }
        md.push('');
        for (const f of r.files) {
          const rel = f.path ? path.relative(process.cwd(), f.path) : '(not written)';
          md.push(
            `- \`${rel}\` (${f.bytes} B) Coin=${f.coinMetadata ?? 'MISSING'} match=${String(f.coinMatch)}`,
          );
          for (const n of f.structuralNotes) md.push(`  - ${n}`);
        }
        md.push('');
      }

      fs.writeFileSync(summaryMd, md.join('\n'), 'utf8');
      // eslint-disable-next-line no-console
      console.log(md.join('\n'));

      for (const r of reports) {
        expect(r.error, `${r.coin}: ${r.error}`).toBeUndefined();
        expect(r.ok, `${r.coin} report.ok`).toBe(true);
        expect(r.files).toHaveLength(5);
        for (const f of r.files) {
          expect(f.coinMatch, `${r.coin} ${f.kind}`).toBe(true);
          expect(f.structuralNotes.filter((n) => n.includes('lệch'))).toHaveLength(0);
        }
      }
      expect(written).toHaveLength(15);
    },
  );
});

function markdownHasMeta(md: string): boolean {
  return md.includes('# METADATA') || md.includes('Coin:');
}
