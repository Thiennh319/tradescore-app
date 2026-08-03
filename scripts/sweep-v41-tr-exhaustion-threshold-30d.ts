/**
 * Sweep TREND_REVERSAL_EXHAUSTION_MIN alternatives from existing CSVs.
 * No production changes; report-only.
 */
import fs from 'node:fs';

const exhPath = 'docs/exports/v41-tr-exhaustion-1h-vs-4h-30d.csv';
const chkPath = 'docs/exports/v41-reversal-checklist-scoring-30d-4h.csv';
const outCsv = 'docs/exports/v41-tr-exhaustion-threshold-sweep-30d.csv';
const outJson = 'docs/exports/v41-tr-exhaustion-threshold-sweep-30d-summary.json';
const outMd = 'docs/REPORT_V41_TR_EXHAUSTION_THRESHOLD_SWEEP_2026-08-01.md';

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = cols[i] ?? '';
    });
    return o;
  });
}

function pct(n: number, d: number): string {
  return ((n / d) * 100).toFixed(1) + '%';
}

const exhRows = parseCsv(fs.readFileSync(exhPath, 'utf8'));
const chkRows = parseCsv(fs.readFileSync(chkPath, 'utf8'));
const chkByTs = new Map(chkRows.map((r) => [r.timestamp, r]));

type Joined = {
  timestamp: string;
  trendDirection: string;
  exh_1h: number;
  cvd: number;
  vol: number;
  structure: number;
};

const joined: Joined[] = [];
let missing = 0;
for (const e of exhRows) {
  const c = chkByTs.get(e.timestamp!);
  if (!c) {
    missing++;
    continue;
  }
  joined.push({
    timestamp: e.timestamp!,
    trendDirection: e.trendDirection!,
    exh_1h: Number(e.exh_1h),
    cvd: Number(c.cvd_flip),
    vol: Number(c.volume_confirm),
    structure: Number(c.structure_break),
  });
}

const thresholds = [20, 25, 30, 35, 40, 45, 50];
const all = joined;
const directed = joined.filter((r) => r.trendDirection !== 'NEUTRAL');

function sweepAt(th: number) {
  const passAll = all.filter((r) => r.exh_1h >= th).length;
  const passDir = directed.filter((r) => r.exh_1h >= th).length;
  const ge3 = all.filter((r) => {
    const exh = r.exh_1h >= th ? 1 : 0;
    return r.cvd + r.vol + exh + r.structure >= 3;
  }).length;
  const ge3Dir = directed.filter((r) => {
    const exh = r.exh_1h >= th ? 1 : 0;
    return r.cvd + r.vol + exh + r.structure >= 3;
  }).length;
  return {
    threshold: th,
    pass_exh_n179: passAll,
    pass_exh_pct_179: (passAll / all.length) * 100,
    pass_exh_nonNeutral_n131: passDir,
    pass_exh_pct_nonNeutral: (passDir / directed.length) * 100,
    tr_signal_ge3_n179: ge3,
    tr_signal_ge3_pct_179: (ge3 / all.length) * 100,
    tr_signal_ge3_nonNeutral: ge3Dir,
  };
}

const results = thresholds.map(sweepAt);
const bas55 = sweepAt(55);

const csvHeader =
  'threshold,pass_exh_n179,pass_exh_pct_179,pass_exh_nonNeutral,pass_exh_pct_nonNeutral,tr_ge3_n179,tr_ge3_pct_179,tr_ge3_nonNeutral';
const csvBody = [...results, bas55]
  .map((r) =>
    [
      r.threshold,
      r.pass_exh_n179,
      r.pass_exh_pct_179.toFixed(2),
      r.pass_exh_nonNeutral_n131,
      r.pass_exh_pct_nonNeutral.toFixed(2),
      r.tr_signal_ge3_n179,
      r.tr_signal_ge3_pct_179.toFixed(2),
      r.tr_signal_ge3_nonNeutral,
    ].join(','),
  )
  .join('\n');
fs.writeFileSync(outCsv, csvHeader + '\n' + csvBody + '\n');

const summary = {
  n_joined: all.length,
  n_nonNeutral: directed.length,
  missing_join: missing,
  sources: { exh: exhPath, checklist: chkPath },
  note: 'TR ≥3/4 = cvdFlip + volumeConfirmation + (exh_1h>=threshold) + structureBreak. Confidence≥70 NOT applied here.',
  baseline_threshold_55: bas55,
  sweep: results,
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));

const md: string[] = [];
md.push('# REPORT — V4.1 TR Exhaustion threshold sweep (NEAR 30d)');
md.push('');
md.push('**Date:** 2026-08-01');
md.push('**Scope:** V4.1 only — không sửa production / không chọn ngưỡng cuối');
md.push(
  '**Data:** join `v41-tr-exhaustion-1h-vs-4h-30d.csv` (exh_1h) × `v41-reversal-checklist-scoring-30d-4h.csv` (cvd/volume/structure) theo timestamp',
);
md.push(
  `**n joined:** ${all.length} · non-neutral: ${directed.length} · missing join: ${missing}`,
);
md.push('');
md.push('## Bảng sweep');
md.push('');
md.push(
  '| Ngưỡng Exhaustion | Pass Exhaustion (n=179) | Pass Exhaustion (non-neutral n=131) | Số nến đạt ≥3/4 signal TR sau đổi ngưỡng |',
);
md.push(
  '|-------------------|-------------------------|-------------------------------------|----------------------------------------|',
);
for (const r of results) {
  md.push(
    `| ${r.threshold} | ${r.pass_exh_n179} (${pct(r.pass_exh_n179, all.length)}) | ${r.pass_exh_nonNeutral_n131} (${pct(r.pass_exh_nonNeutral_n131, directed.length)}) | ${r.tr_signal_ge3_n179} (${pct(r.tr_signal_ge3_n179, all.length)}) |`,
  );
}
md.push(
  `| **55 (baseline hiện tại)** | ${bas55.pass_exh_n179} (${pct(bas55.pass_exh_n179, all.length)}) | ${bas55.pass_exh_nonNeutral_n131} (${pct(bas55.pass_exh_nonNeutral_n131, directed.length)}) | ${bas55.tr_signal_ge3_n179} (${pct(bas55.tr_signal_ge3_n179, all.length)}) |`,
);
md.push('');
md.push('## Ghi chú');
md.push('');
md.push(
  '- ≥3/4 = `cvd + volume + exhaustion(≥th) + structure` — **chưa** áp `confidence ≥ 70` (điều kiện ACTIVE đầy đủ còn thêm bước đó).',
);
md.push('- Exhaustion 1H max quan sát = 50 → ngưỡng 55 luôn 0 pass (xác nhận lại).');
md.push('- Không khuyến nghị ngưỡng trong báo cáo này.');
md.push('');
md.push('## Artefacts');
md.push('');
md.push('- `docs/exports/v41-tr-exhaustion-threshold-sweep-30d.csv`');
md.push('- `docs/exports/v41-tr-exhaustion-threshold-sweep-30d-summary.json`');

fs.writeFileSync(outMd, md.join('\n') + '\n');
console.log(JSON.stringify({ n: all.length, directed: directed.length, missing, results, bas55 }, null, 2));
console.log('wrote', outMd, outCsv, outJson);
