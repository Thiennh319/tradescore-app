/**
 * Compare: drop Exhaustion (A) vs lower Exhaustion threshold (B) for TR gate.
 * Report-only — no production changes.
 */
import fs from 'node:fs';

const exhPath = 'docs/exports/v41-tr-exhaustion-1h-vs-4h-30d.csv';
const chkPath = 'docs/exports/v41-reversal-checklist-scoring-30d-4h.csv';
const confPath = 'docs/exports/v41-market-confidence-30d-4h.csv';
const outCsv = 'docs/exports/v41-exhaustion-drop-vs-lower-comparison-30d.csv';
const outJson = 'docs/exports/v41-exhaustion-drop-vs-lower-comparison-30d-summary.json';
const outMd = 'docs/REPORT_V41_EXHAUSTION_DROP_VS_LOWER_COMPARISON_2026-08-01.md';

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
const confRows = parseCsv(fs.readFileSync(confPath, 'utf8'));
const chkByTs = new Map(chkRows.map((r) => [r.timestamp, r]));
const confByTs = new Map(confRows.map((r) => [r.timestamp, r]));

type Joined = {
  timestamp: string;
  trendDirection: string;
  exh_1h: number;
  cvd: number;
  vol: number;
  structure: number;
  marketConfidence: number;
};

const joined: Joined[] = [];
let missingChk = 0;
let missingConf = 0;
for (const e of exhRows) {
  const c = chkByTs.get(e.timestamp!);
  const conf = confByTs.get(e.timestamp!);
  if (!c) {
    missingChk++;
    continue;
  }
  if (!conf) {
    missingConf++;
    continue;
  }
  joined.push({
    timestamp: e.timestamp!,
    trendDirection: e.trendDirection!,
    exh_1h: Number(e.exh_1h),
    cvd: Number(c.cvd_flip),
    vol: Number(c.volume_confirm),
    structure: Number(c.structure_break),
    marketConfidence: Number(conf.marketConfidence),
  });
}

const all = joined;
const directed = joined.filter((r) => r.trendDirection !== 'NEUTRAL');

type Row = {
  plan: string;
  signal_condition: string;
  pass_signal_n179: number;
  pass_signal_nonNeutral: number;
  pass_signal_and_conf70_n179: number;
  pass_signal_and_conf70_nonNeutral: number;
};

function count(
  plan: string,
  signal_condition: string,
  passFn: (r: Joined) => boolean,
): Row {
  const passAll = all.filter(passFn);
  const passDir = directed.filter(passFn);
  const confOk = (r: Joined) => passFn(r) && r.marketConfidence >= 70;
  return {
    plan,
    signal_condition,
    pass_signal_n179: passAll.length,
    pass_signal_nonNeutral: passDir.length,
    pass_signal_and_conf70_n179: all.filter(confOk).length,
    pass_signal_and_conf70_nonNeutral: directed.filter(confOk).length,
  };
}

const rows: Row[] = [
  count('A', '≥2/3 (bỏ Exhaustion)', (r) => r.cvd + r.vol + r.structure >= 2),
  count('A', '≥3/3 (bỏ Exhaustion)', (r) => r.cvd + r.vol + r.structure >= 3),
  count('B', '≥3/4, exhaustion≥10', (r) => {
    const exh = r.exh_1h >= 10 ? 1 : 0;
    return r.cvd + r.vol + exh + r.structure >= 3;
  }),
  count('B', '≥3/4, exhaustion≥15', (r) => {
    const exh = r.exh_1h >= 15 ? 1 : 0;
    return r.cvd + r.vol + exh + r.structure >= 3;
  }),
  count('B', '≥3/4, exhaustion≥20', (r) => {
    const exh = r.exh_1h >= 20 ? 1 : 0;
    return r.cvd + r.vol + exh + r.structure >= 3;
  }),
  count('Baseline', '≥3/4, exhaustion≥55 (hiện tại)', (r) => {
    const exh = r.exh_1h >= 55 ? 1 : 0;
    return r.cvd + r.vol + exh + r.structure >= 3;
  }),
];

const csvHeader =
  'plan,signal_condition,pass_signal_n179,pass_signal_nonNeutral,pass_signal_and_conf70_n179,pass_signal_and_conf70_nonNeutral';
const csvBody = rows
  .map((r) =>
    [
      r.plan,
      `"${r.signal_condition}"`,
      r.pass_signal_n179,
      r.pass_signal_nonNeutral,
      r.pass_signal_and_conf70_n179,
      r.pass_signal_and_conf70_nonNeutral,
    ].join(','),
  )
  .join('\n');
fs.writeFileSync(outCsv, csvHeader + '\n' + csvBody + '\n');

const confDist = {
  n179_conf_ge70: all.filter((r) => r.marketConfidence >= 70).length,
  nonNeutral_conf_ge70: directed.filter((r) => r.marketConfidence >= 70).length,
  conf_min: Math.min(...all.map((r) => r.marketConfidence)),
  conf_max: Math.max(...all.map((r) => r.marketConfidence)),
};

const summary = {
  n_joined: all.length,
  n_nonNeutral: directed.length,
  missing_checklist: missingChk,
  missing_confidence: missingConf,
  sources: { exh: exhPath, checklist: chkPath, confidence: confPath },
  note:
    'confidence proxy = marketConfidence from v41-market-confidence-30d-4h.csv (per task). Production TR uses computeTrendReversalConfidence(signals), not marketConfidence.',
  confidence_overview: confDist,
  comparison: rows,
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));

const md: string[] = [];
md.push('# REPORT — V4.1 Exhaustion: Drop vs Lower threshold (NEAR 30d)');
md.push('');
md.push('**Date:** 2026-08-01');
md.push('**Scope:** V4.1 only — không sửa production / không chọn phương án');
md.push(
  '**Data:** join `v41-tr-exhaustion-1h-vs-4h-30d.csv` × `v41-reversal-checklist-scoring-30d-4h.csv` × `v41-market-confidence-30d-4h.csv` theo timestamp',
);
md.push(
  `**n joined:** ${all.length} · non-neutral: ${directed.length} · missing checklist: ${missingChk} · missing confidence: ${missingConf}`,
);
md.push('');
md.push('## Định nghĩa');
md.push('');
md.push(
  '- **A:** bỏ Exhaustion khỏi tổ hợp — chỉ `cvd + volume + structure` (mẫu số 3).',
);
md.push(
  '- **B:** giữ ≥3/4 với Exhaustion 1H ≥ mốc (10 / 15 / 20).',
);
md.push(
  '- **Baseline:** ≥3/4, Exhaustion ≥55 (constant production hiện tại).',
);
md.push(
  '- **confidence≥70:** cột `marketConfidence` (CSV market-confidence 30d).',
);
md.push(
  `- Overview confidence≥70: n=179 → ${confDist.n179_conf_ge70}; non-neutral n=131 → ${confDist.nonNeutral_conf_ge70} (min=${confDist.conf_min}, max=${confDist.conf_max}).`,
);
md.push('');
md.push('## Bảng so sánh');
md.push('');
md.push(
  '| Phương án | Điều kiện signal | Pass signal-gate (n=179) | Pass signal-gate (non-neutral n=131) | Pass CẢ signal-gate + confidence≥70 |',
);
md.push(
  '|---|---|---|---|---|',
);
for (const r of rows) {
  md.push(
    `| ${r.plan} | ${r.signal_condition} | ${r.pass_signal_n179} (${pct(r.pass_signal_n179, all.length)}) | ${r.pass_signal_nonNeutral} (${pct(r.pass_signal_nonNeutral, directed.length)}) | ${r.pass_signal_and_conf70_n179} (${pct(r.pass_signal_and_conf70_n179, all.length)}) |`,
  );
}
md.push('');
md.push('## Quan sát (không phải khuyến nghị)');
md.push('');
md.push(
  '- Cột cuối gần nhất với “sẽ ACTIVE bao nhiêu lệnh / 30 ngày” nếu chỉ đổi signal-gate + giữ `confidence≥70` (chưa mô phỏng bước khác của pipeline).',
);
md.push(
  '- A ≥3/3 và Baseline ≥3/4@55 đều dựa trên 3 signal CVD/Volume/Structure khi Exhaustion không bao giờ pass ở 55 — nếu trùng số, đó là kỳ vọng từ dữ liệu trước.',
);
md.push('- Không khuyến nghị / không chọn phương án trong báo cáo này.');
md.push('');
md.push('## Artefacts');
md.push('');
md.push('- `docs/exports/v41-exhaustion-drop-vs-lower-comparison-30d.csv`');
md.push('- `docs/exports/v41-exhaustion-drop-vs-lower-comparison-30d-summary.json`');

fs.writeFileSync(outMd, md.join('\n') + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log('wrote', outMd, outCsv, outJson);
