/**
 * V4.1 RuleBook bottleneck stats — read-only log analysis.
 *
 * Does NOT import or modify reversalDetector / decisionConfig / engine code.
 *
 * Usage:
 *   npx tsx scripts/analyze-v41-rulebook-bottleneck.ts <export-dir> [options]
 *
 * Options:
 *   --days <n>          Only files with Generated At (or mtime) within last n days (default: 30)
 *   --csv <path>        Write rule-stats CSV to path
 *   --csv-tr <path>     Write trend_reversal concurrent-PASS distribution CSV
 *   --recursive         Walk subdirectories (default: on)
 *   --no-recursive      Only the top-level directory
 *   --symbols <list>    Comma list, default: BTCUSDT,NEARUSDT,SOLUSDT,BNBUSDT
 *   --help              Show help
 *
 * Example:
 *   npx tsx scripts/analyze-v41-rulebook-bottleneck.ts "%USERPROFILE%\Downloads" --csv docs/exports/v41-bottleneck.csv
 */

import fs from 'node:fs';
import path from 'node:path';

const STATUSES = ['PASS', 'FAIL', 'WATCH', 'SKIPPED', 'INFO'] as const;
type Status = (typeof STATUSES)[number];

/** Four Trend Reversal signal rules used for ACTIVE (≥3/4) gate analysis. */
const TR_SIGNAL_RULE_IDS = [
  'cvd_flip',
  'volume_confirmation',
  'trend_exhaustion_gate',
  'structure_break',
] as const;

type TrSignalRuleId = (typeof TR_SIGNAL_RULE_IDS)[number];

const DEFAULT_SYMBOLS = ['BTCUSDT', 'NEARUSDT', 'SOLUSDT', 'BNBUSDT'] as const;
const DEFAULT_DAYS = 30;

type CliOptions = {
  dir: string;
  days: number;
  csv: string | null;
  csvTr: string | null;
  recursive: boolean;
  symbols: string[];
  help: boolean;
};

type RuleRow = { ruleId: string; status: Status };

type FileParse = {
  file: string;
  symbol: string | null;
  generatedAt: Date | null;
  mtime: Date;
  effectiveAt: Date;
  rows: RuleRow[];
  trPassCount: number; // 0..4 among TR_SIGNAL_RULE_IDS with PASS
};

function printHelp(): void {
  console.log(`analyze-v41-rulebook-bottleneck.ts

Usage:
  npx tsx scripts/analyze-v41-rulebook-bottleneck.ts <export-dir> [options]

Options:
  --days <n>          Window in days (default ${DEFAULT_DAYS}); uses METADATA "Generated At" if present, else file mtime
  --csv <path>        Save per-rule stats CSV
  --csv-tr <path>     Save trend_reversal concurrent PASS distribution CSV (0/4..4/4)
  --recursive         Walk subfolders (default)
  --no-recursive      Top-level only
  --symbols <list>    e.g. BTCUSDT,SOLUSDT (default: BTC,NEAR,SOL,BNB USDT)
  --help

Input files match: 01_RULEBOOK_V41_<SYMBOL>.md (also accepts suffixes like _LIVE_SCAN.md)
`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const opts: CliOptions = {
    dir: '',
    days: DEFAULT_DAYS,
    csv: null,
    csvTr: null,
    recursive: true,
    symbols: [...DEFAULT_SYMBOLS],
    help: false,
  };

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
      continue;
    }
    if (a === '--recursive') {
      opts.recursive = true;
      continue;
    }
    if (a === '--no-recursive') {
      opts.recursive = false;
      continue;
    }
    if (a === '--days') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid --days: ${args[i]}`);
      opts.days = v;
      continue;
    }
    if (a === '--csv') {
      opts.csv = args[++i];
      if (!opts.csv) throw new Error('--csv requires a path');
      continue;
    }
    if (a === '--csv-tr') {
      opts.csvTr = args[++i];
      if (!opts.csvTr) throw new Error('--csv-tr requires a path');
      continue;
    }
    if (a === '--symbols') {
      const raw = args[++i];
      if (!raw) throw new Error('--symbols requires a comma list');
      opts.symbols = raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .map((s) => (s.endsWith('USDT') ? s : `${s}USDT`));
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    positional.push(a);
  }

  if (positional[0]) opts.dir = path.resolve(positional[0]);
  return opts;
}

function walkFiles(root: string, recursive: boolean): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.warn(`[warn] cannot read dir: ${dir} (${String(e)})`);
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (recursive) stack.push(full);
        continue;
      }
      if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

function symbolFromFilename(name: string, allowed: Set<string>): string | null {
  // 01_RULEBOOK_V41_BTCUSDT.md | 01_RULEBOOK_V41_BTCUSDT_LIVE_SCAN_MIN3.md
  const m = name.match(/^01_RULEBOOK_V41_((?:BTC|NEAR|SOL|BNB)USDT)(?:[_.]|$)/i);
  if (!m) return null;
  const sym = m[1].toUpperCase();
  return allowed.has(sym) ? sym : null;
}

function isRulebookV41Candidate(filePath: string, allowed: Set<string>): boolean {
  const base = path.basename(filePath);
  if (!/^01_RULEBOOK_V41_/i.test(base)) return false;
  if (!base.toLowerCase().endsWith('.md')) return false;
  return symbolFromFilename(base, allowed) != null;
}

function parseGeneratedAt(md: string): Date | null {
  const m = md.match(/Generated At:\s*([^\r\n]+)/i);
  if (!m) return null;
  const d = new Date(m[1].trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRuleEvaluationTable(md: string): RuleRow[] {
  const start = md.search(/^##\s+RULE EVALUATION TABLE\s*$/im);
  if (start < 0) return [];

  const after = md.slice(start);
  const endMatch = after.search(/\n##\s+/);
  const section = endMatch > 0 ? after.slice(0, endMatch) : after;

  const rows: RuleRow[] = [];
  const lineRe =
    /^\|\s*([a-z][a-z0-9_]*)\s*\|\s*[^|]*\|\s*(PASS|FAIL|WATCH|SKIPPED|INFO)\s*\|/i;

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) continue; // separator
    if (/^\|\s*Rule ID\s*\|/i.test(trimmed)) continue; // header

    const m = trimmed.match(lineRe);
    if (!m) continue;
    rows.push({
      ruleId: m[1].toLowerCase(),
      status: m[2].toUpperCase() as Status,
    });
  }
  return rows;
}

function trPassCount(rows: RuleRow[]): number {
  const byId = new Map(rows.map((r) => [r.ruleId, r.status]));
  let n = 0;
  for (const id of TR_SIGNAL_RULE_IDS) {
    if (byId.get(id) === 'PASS') n += 1;
  }
  return n;
}

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return (100 * n) / total;
}

function fmtPct(n: number, total: number): string {
  return `${pct(n, total).toFixed(1)}%`;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function collectFiles(opts: CliOptions): FileParse[] {
  if (!fs.existsSync(opts.dir) || !fs.statSync(opts.dir).isDirectory()) {
    throw new Error(`Not a directory: ${opts.dir}`);
  }

  const allowed = new Set(opts.symbols.map((s) => s.toUpperCase()));
  const cutoff = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  const all = walkFiles(opts.dir, opts.recursive).filter((f) =>
    isRulebookV41Candidate(f, allowed),
  );

  const parsed: FileParse[] = [];
  let skippedOld = 0;
  let skippedEmpty = 0;

  for (const file of all) {
    const st = fs.statSync(file);
    const md = fs.readFileSync(file, 'utf8');
    const generatedAt = parseGeneratedAt(md);
    const mtime = st.mtime;
    const effectiveAt = generatedAt ?? mtime;
    if (effectiveAt.getTime() < cutoff) {
      skippedOld += 1;
      continue;
    }
    const rows = parseRuleEvaluationTable(md);
    if (rows.length === 0) {
      skippedEmpty += 1;
      console.warn(`[warn] no RULE EVALUATION TABLE rows: ${file}`);
      continue;
    }
    parsed.push({
      file,
      symbol: symbolFromFilename(path.basename(file), allowed),
      generatedAt,
      mtime,
      effectiveAt,
      rows,
      trPassCount: trPassCount(rows),
    });
  }

  console.log(
    `Scanned dir=${opts.dir} recursive=${opts.recursive} days=${opts.days}`,
  );
  console.log(
    `Candidates=${all.length} used=${parsed.length} skipped_old=${skippedOld} skipped_empty_table=${skippedEmpty}`,
  );
  return parsed;
}

type RuleStat = {
  ruleId: string;
  n: number;
  pass: number;
  fail: number;
  watch: number;
  skipped: number;
  info: number;
};

function aggregateRules(files: FileParse[]): RuleStat[] {
  const map = new Map<string, RuleStat>();
  for (const f of files) {
    for (const row of f.rows) {
      let s = map.get(row.ruleId);
      if (!s) {
        s = {
          ruleId: row.ruleId,
          n: 0,
          pass: 0,
          fail: 0,
          watch: 0,
          skipped: 0,
          info: 0,
        };
        map.set(row.ruleId, s);
      }
      s.n += 1;
      if (row.status === 'PASS') s.pass += 1;
      else if (row.status === 'FAIL') s.fail += 1;
      else if (row.status === 'WATCH') s.watch += 1;
      else if (row.status === 'SKIPPED') s.skipped += 1;
      else if (row.status === 'INFO') s.info += 1;
    }
  }
  return [...map.values()].sort((a, b) => {
    const fa = pct(a.fail, a.n);
    const fb = pct(b.fail, b.n);
    if (fb !== fa) return fb - fa;
    return b.n - a.n || a.ruleId.localeCompare(b.ruleId);
  });
}

function printRuleTable(stats: RuleStat[]): void {
  const headers = [
    'Rule ID',
    'N',
    'PASS%',
    'FAIL%',
    'WATCH%',
    'SKIP%',
    'INFO%',
    'PASS',
    'FAIL',
    'WATCH',
    'SKIP',
    'INFO',
  ];
  const lines = stats.map((s) => [
    s.ruleId,
    String(s.n),
    fmtPct(s.pass, s.n),
    fmtPct(s.fail, s.n),
    fmtPct(s.watch, s.n),
    fmtPct(s.skipped, s.n),
    fmtPct(s.info, s.n),
    String(s.pass),
    String(s.fail),
    String(s.watch),
    String(s.skipped),
    String(s.info),
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...lines.map((r) => r[i].length)),
  );
  const fmt = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i])).join('  ');

  console.log('\n=== Per-rule status rates (sorted by FAIL% desc) ===\n');
  console.log(fmt(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of lines) console.log(fmt(row));
}

function writeRuleCsv(stats: RuleStat[], outPath: string): void {
  const header = [
    'rule_id',
    'n',
    'pass_n',
    'fail_n',
    'watch_n',
    'skipped_n',
    'info_n',
    'pass_pct',
    'fail_pct',
    'watch_pct',
    'skipped_pct',
    'info_pct',
  ];
  const body = stats.map((s) =>
    [
      s.ruleId,
      s.n,
      s.pass,
      s.fail,
      s.watch,
      s.skipped,
      s.info,
      pct(s.pass, s.n).toFixed(2),
      pct(s.fail, s.n).toFixed(2),
      pct(s.watch, s.n).toFixed(2),
      pct(s.skipped, s.n).toFixed(2),
      pct(s.info, s.n).toFixed(2),
    ]
      .map(csvEscape)
      .join(','),
  );
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, [header.join(','), ...body].join('\n') + '\n', 'utf8');
  console.log(`\nWrote rule CSV: ${outPath}`);
}

function aggregateTrDistribution(files: FileParse[]): {
  bucket: string;
  passCount: number;
  n: number;
  pct: number;
}[] {
  const counts = [0, 0, 0, 0, 0]; // index = pass count 0..4
  for (const f of files) {
    const c = Math.min(4, Math.max(0, f.trPassCount));
    counts[c] += 1;
  }
  const total = files.length;
  return counts.map((n, passCount) => ({
    bucket: `${passCount}/4`,
    passCount,
    n,
    pct: pct(n, total),
  }));
}

function printTrDistribution(
  files: FileParse[],
  dist: ReturnType<typeof aggregateTrDistribution>,
): void {
  const total = files.length;
  const activeN = dist
    .filter((d) => d.passCount >= 3)
    .reduce((a, d) => a + d.n, 0);

  console.log('\n=== Trend Reversal signals — concurrent PASS per scan ===');
  console.log(
    `Rules: ${TR_SIGNAL_RULE_IDS.join(', ')}`,
  );
  console.log(`Scans with table: ${total}`);
  console.log(
    `ACTIVE threshold (≥3/4 PASS): ${activeN}/${total} = ${fmtPct(activeN, total)}\n`,
  );

  const headers = ['Signals PASS', 'Scans', 'Pct'];
  const lines = dist.map((d) => [
    d.bucket,
    String(d.n),
    `${d.pct.toFixed(1)}%`,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...lines.map((r) => r[i].length)),
  );
  const fmt = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of lines) console.log(fmt(row));
}

function writeTrCsv(
  dist: ReturnType<typeof aggregateTrDistribution>,
  total: number,
  outPath: string,
): void {
  const activeN = dist
    .filter((d) => d.passCount >= 3)
    .reduce((a, d) => a + d.n, 0);
  const header = [
    'bucket',
    'pass_count',
    'scans',
    'pct',
    'active_ge_3_of_4_scans',
    'active_ge_3_of_4_pct',
    'total_scans',
  ];
  const body = dist.map((d) =>
    [
      d.bucket,
      d.passCount,
      d.n,
      d.pct.toFixed(2),
      activeN,
      pct(activeN, total).toFixed(2),
      total,
    ]
      .map(csvEscape)
      .join(','),
  );
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, [header.join(','), ...body].join('\n') + '\n', 'utf8');
  console.log(`Wrote TR distribution CSV: ${outPath}`);
}

function main(): void {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(String(e));
    printHelp();
    process.exit(1);
    return;
  }

  if (opts.help || !opts.dir) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
    return;
  }

  const files = collectFiles(opts);
  if (files.length === 0) {
    console.error(
      'No RuleBook V4.1 files in window. Check dir / --days / --symbols.',
    );
    process.exit(2);
    return;
  }

  const bySym = new Map<string, number>();
  for (const f of files) {
    const k = f.symbol ?? '?';
    bySym.set(k, (bySym.get(k) ?? 0) + 1);
  }
  console.log(
    'By symbol: ' +
      [...bySym.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([s, n]) => `${s}=${n}`)
        .join('  '),
  );

  const stats = aggregateRules(files);
  printRuleTable(stats);
  if (opts.csv) writeRuleCsv(stats, path.resolve(opts.csv));

  const dist = aggregateTrDistribution(files);
  printTrDistribution(files, dist);
  if (opts.csvTr) writeTrCsv(dist, files.length, path.resolve(opts.csvTr));
  else if (opts.csv) {
    // Convenience: sibling file when only --csv given
    const sibling = opts.csv.replace(/\.csv$/i, '') + '_tr_pass_distribution.csv';
    writeTrCsv(dist, files.length, path.resolve(sibling));
  }
}

main();
