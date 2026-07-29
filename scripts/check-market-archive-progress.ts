/**
 * Check forward archive progress for NEARUSDT OI/LS/funding.
 *
 * Run: npx tsx scripts/check-market-archive-progress.ts
 * Optional: --symbol NEARUSDT --ready-days 90 --min-coverage 95
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MS_1H = 3_600_000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = path.resolve(__dirname, '../data/market-archive/nearusdt_1h.csv');

type Row = {
  timestamp: number;
  status: string;
  oi: number | null;
  ls_top_ratio: number | null;
};

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function loadRows(csvPath: string): Row[] {
  if (!fs.existsSync(csvPath)) return [];
  const lines = fs
    .readFileSync(csvPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  const out: Row[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const timestamp = Number(c[0]);
    if (!Number.isFinite(timestamp)) continue;
    out.push({
      timestamp,
      status: c[8] ?? '',
      oi: c[3] === '' || c[3] == null ? null : Number(c[3]),
      ls_top_ratio: c[4] === '' || c[4] == null ? null : Number(c[4]),
    });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

function isUseful(r: Row): boolean {
  return r.status === 'ok' || (r.oi != null && r.ls_top_ratio != null);
}

function fmtIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function analyzeArchive(
  rows: Row[],
  opts: { readyDays: number; minCoverage: number },
): {
  n: number;
  first_ts: number | null;
  last_ts: number | null;
  expected_hours: number;
  actual_ok_hours: number;
  coverage_pct: number;
  gap_list: Array<{ start: string; end: string; hours: number }>;
  ready_90d: boolean;
  span_days: number;
} {
  const useful = rows.filter(isUseful);
  if (useful.length === 0) {
    return {
      n: 0,
      first_ts: null,
      last_ts: null,
      expected_hours: 0,
      actual_ok_hours: 0,
      coverage_pct: 0,
      gap_list: [],
      ready_90d: false,
      span_days: 0,
    };
  }

  const first = useful[0]!.timestamp;
  const last = useful[useful.length - 1]!.timestamp;
  const expected = Math.floor((last - first) / MS_1H) + 1;
  const set = new Set(useful.map((r) => r.timestamp));
  let actual = 0;
  const gaps: Array<{ start: string; end: string; hours: number }> = [];
  let gapStart: number | null = null;

  for (let ts = first; ts <= last; ts += MS_1H) {
    if (set.has(ts)) {
      actual += 1;
      if (gapStart != null) {
        const gapEnd = ts - MS_1H;
        const hours = Math.floor((gapEnd - gapStart) / MS_1H) + 1;
        gaps.push({ start: fmtIso(gapStart), end: fmtIso(gapEnd), hours });
        gapStart = null;
      }
    } else if (gapStart == null) {
      gapStart = ts;
    }
  }
  if (gapStart != null) {
    const hours = Math.floor((last - gapStart) / MS_1H) + 1;
    gaps.push({ start: fmtIso(gapStart), end: fmtIso(last), hours });
  }

  const coverage = expected > 0 ? (actual / expected) * 100 : 0;
  const spanDays = (last - first) / 86_400_000;
  const ready =
    spanDays >= opts.readyDays - 0.01 && coverage >= opts.minCoverage && gaps.length === 0
      ? true
      : spanDays >= opts.readyDays - 0.01 && coverage >= opts.minCoverage;

  return {
    n: useful.length,
    first_ts: first,
    last_ts: last,
    expected_hours: expected,
    actual_ok_hours: actual,
    coverage_pct: coverage,
    gap_list: gaps,
    ready_90d: ready,
    span_days: spanDays,
  };
}

function parseArgs(argv: string[]): {
  csv: string;
  readyDays: number;
  minCoverage: number;
} {
  let csv = DEFAULT_CSV;
  let readyDays = 90;
  let minCoverage = 95;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--csv') csv = path.resolve(argv[++i] ?? csv);
    if (argv[i] === '--ready-days') readyDays = Number(argv[++i] ?? readyDays);
    if (argv[i] === '--min-coverage') minCoverage = Number(argv[++i] ?? minCoverage);
  }
  return { csv, readyDays, minCoverage };
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const rows = loadRows(opts.csv);
  const r = analyzeArchive(rows, {
    readyDays: opts.readyDays,
    minCoverage: opts.minCoverage,
  });

  console.log('=== Market archive progress ===');
  console.log(`csv: ${opts.csv}`);
  console.log(`rows_useful: ${r.n}`);
  console.log(`first_ts: ${r.first_ts == null ? 'n/a' : fmtIso(r.first_ts)}`);
  console.log(`last_ts:  ${r.last_ts == null ? 'n/a' : fmtIso(r.last_ts)}`);
  console.log(`span_days: ${r.span_days.toFixed(2)}`);
  console.log(`expected_hours: ${r.expected_hours}`);
  console.log(`actual_ok_hours: ${r.actual_ok_hours}`);
  console.log(`coverage_pct: ${r.coverage_pct.toFixed(2)}%`);
  console.log(`gaps: ${r.gap_list.length}`);
  for (const g of r.gap_list.slice(0, 20)) {
    console.log(`  - ${g.start} → ${g.end} (${g.hours}h)`);
  }
  if (r.gap_list.length > 20) {
    console.log(`  … +${r.gap_list.length - 20} more`);
  }
  console.log(
    `ready_${opts.readyDays}d (≥${opts.minCoverage}% coverage): ${r.ready_90d ? 'YES' : 'NO'}`,
  );
}

const isDirectRun =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
