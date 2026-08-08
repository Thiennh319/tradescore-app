/**
 * Multi-period stability check for V4 NEAR l6 filters (90 / 180 / 365d).
 * V4 only — no v4.1, no scorerV4/tradePlanV4 edits.
 *
 * Run via vitest (RN alias):
 *   npx vitest run scripts/backtest-v4-near-l6-multi-period.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeStats,
  fmt,
  runNearV4Backtest,
  type BacktestRunResult,
  type TradeRow,
} from './backtest-v4-near-90d';

function writeTradesCsv(outPath: string, rows: TradeRow[]): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    'symbol',
    'entryTime',
    'exitTime',
    'entryIso',
    'exitIso',
    'side',
    'entryPrice',
    'exitPrice',
    'sl',
    'tp1',
    'tp2',
    'tp3',
    'pnlPct',
    'resultR',
    'exitReason',
    'decision',
    'score',
    'groupA',
    'groupB',
    'groupC',
    'primaryRR',
    'marketMode',
    'hourVn',
    'l1',
    'l2',
    'l3',
    'l4',
    'l5a',
    'l5b',
    'l6',
    'l7',
    'l8',
    'l9',
    'l10',
    'tradePlanValid',
    'win',
  ];
  const lines = rows.map((r) =>
    [
      'NEARUSDT',
      r.entryTime,
      r.exitTime,
      r.entryIso,
      r.exitIso,
      r.side,
      r.entryPrice,
      r.exitPrice,
      r.sl,
      r.tp1,
      r.tp2,
      r.tp3,
      r.pnlPct,
      r.resultR,
      r.exitReason,
      r.decision,
      r.score,
      r.groupA,
      r.groupB,
      r.groupC,
      r.primaryRR,
      r.marketMode,
      r.hourVn,
      r.l1,
      r.l2,
      r.l3,
      r.l4,
      r.l5a,
      r.l5b,
      r.l6,
      r.l7,
      r.l8,
      r.l9,
      r.l10,
      r.tradePlanValid,
      r.win,
    ].join(','),
  );
  fs.writeFileSync(outPath, [header.join(','), ...lines, ''].join('\n'), 'utf8');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_MD = path.resolve(
  __dirname,
  '../docs/exports/near_rule_comparison_multi_period.md',
);

type SliceStats = {
  label: string;
  n: number;
  wr: number;
  pf: number;
  expR: number;
  maxDdR: number;
};

function sliceStats(rows: TradeRow[], label: string, pred: (r: TradeRow) => boolean): SliceStats {
  const s = computeStats(rows.filter(pred));
  return {
    label,
    n: s.n,
    wr: s.wr,
    pf: s.pf,
    expR: s.expectancyR,
    maxDdR: s.maxDdR,
  };
}

function periodBlock(run: BacktestRunResult): {
  days: number;
  baseline: SliceStats;
  l6ge1: SliceStats;
  l6ge15: SliceStats;
  l1ge15: SliceStats;
  l3ge2: SliceStats;
  meta: BacktestRunResult['meta'];
  quarters: Array<{
    q: string;
    baseline: SliceStats;
    l6ge1: SliceStats;
    l6ge15: SliceStats;
    l1ge15: SliceStats;
    l3ge2: SliceStats;
  }>;
} {
  const t = run.trades;
  const baseline = sliceStats(t, 'baseline', () => true);
  const l6ge1 = sliceStats(t, 'l6>=1', (r) => r.l6 >= 1);
  const l6ge15 = sliceStats(t, 'l6>=1.5', (r) => r.l6 >= 1.5);
  const l1ge15 = sliceStats(t, 'l1>=1.5', (r) => r.l1 >= 1.5);
  const l3ge2 = sliceStats(t, 'l3>=2', (r) => r.l3 >= 2);

  // Quarterly buckets by entryTime
  const byQ = new Map<string, TradeRow[]>();
  for (const row of t) {
    const d = new Date(row.entryTime);
    const q = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    const arr = byQ.get(q) ?? [];
    arr.push(row);
    byQ.set(q, arr);
  }
  const quarters = [...byQ.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([q, rows]) => ({
      q,
      baseline: sliceStats(rows, 'baseline', () => true),
      l6ge1: sliceStats(rows, 'l6>=1', (r) => r.l6 >= 1),
      l6ge15: sliceStats(rows, 'l6>=1.5', (r) => r.l6 >= 1.5),
      l1ge15: sliceStats(rows, 'l1>=1.5', (r) => r.l1 >= 1.5),
      l3ge2: sliceStats(rows, 'l3>=2', (r) => r.l3 >= 2),
    }));

  return {
    days: run.meta.daysRequested,
    baseline,
    l6ge1,
    l6ge15,
    l1ge15,
    l3ge2,
    meta: run.meta,
    quarters,
  };
}

function cell(s: SliceStats): string {
  return `${fmt(s.wr)}% / ${s.n}`;
}

function detail(s: SliceStats): string {
  return `n=${s.n}, WR=${fmt(s.wr)}%, PF=${fmt(s.pf)}, ExpR=${fmt(s.expR)}, MaxDD_R=${fmt(s.maxDdR)}`;
}

export async function runMultiPeriodAnalysis(): Promise<void> {
  const periods = [90, 180, 365] as const;
  const runs: BacktestRunResult[] = [];

  for (const days of periods) {
    console.log(`\n######## Running ${days}d ########`);
    const run = await runNearV4Backtest(days);
    writeTradesCsv(
      path.resolve(__dirname, `../docs/exports/near_backtest_${days}d.csv`),
      run.trades,
    );
    runs.push(run);
    console.log(
      `[${days}d] trades=${run.trades.length} span≈${fmt(run.meta.spanDaysActual, 1)}d | 1hBars=${run.meta.near1hBars} 4hBars=${run.meta.near4hBars} | OI real ${fmt(run.meta.oiRealPct)}% LS real ${fmt(run.meta.lsRealPct)}%`,
    );
  }

  const blocks = runs.map(periodBlock);
  const b90 = blocks.find((b) => b.days === 90)!;
  const b180 = blocks.find((b) => b.days === 180)!;
  const b365 = blocks.find((b) => b.days === 365)!;

  // Stability assessment
  const l6_1_wrs = [b90.l6ge1.wr, b180.l6ge1.wr, b365.l6ge1.wr];
  const l6_15_wrs = [b90.l6ge15.wr, b180.l6ge15.wr, b365.l6ge15.wr];
  const base_wrs = [b90.baseline.wr, b180.baseline.wr, b365.baseline.wr];

  const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const edge = (filterWr: number, baseWr: number) => filterWr - baseWr;

  const edges1 = [
    edge(b90.l6ge1.wr, b90.baseline.wr),
    edge(b180.l6ge1.wr, b180.baseline.wr),
    edge(b365.l6ge1.wr, b365.baseline.wr),
  ];
  const edges15 = [
    edge(b90.l6ge15.wr, b90.baseline.wr),
    edge(b180.l6ge15.wr, b180.baseline.wr),
    edge(b365.l6ge15.wr, b365.baseline.wr),
  ];

  const l61AlwaysBeats = edges1.every((e) => e > 0);
  const l615AlwaysBeats = edges15.every((e) => e > 0);
  const l61Range = range(l6_1_wrs);
  const l615Range = range(l6_15_wrs);

  let conclusion: 'YES_SOFT' | 'NO' | 'YES_STRICT_WEAK';
  let conclusionText: string;

  if (l61Range > 15 || (!l61AlwaysBeats && edges1.filter((e) => e > 0).length < 2)) {
    conclusion = 'NO';
    conclusionText =
      '**Không nên** đưa `l6 ≥ 1` / `≥ 1.5` vào entry gate chính thức V4 lúc này — WR dao động lớn giữa các mốc và/hoặc không giữ ưu thế ổn định so với baseline trên mẫu dài.';
  } else if (l61AlwaysBeats && l61Range <= 10 && b180.l6ge1.n >= 30 && b365.l6ge1.n >= 30) {
    conclusion = 'YES_SOFT';
    conclusionText =
      '**Có thể cân nhắc** thêm soft filter `l6 ≥ 1` (không hard-block) — giữ edge dương trên 90/180/365 với biên độ WR chấp nhận được; vẫn cần lưu ý OI/LS fallback cao trên mẫu dài.';
  } else if (l61AlwaysBeats || edges1.filter((e) => e >= 0).length >= 2) {
    conclusion = 'YES_STRICT_WEAK';
    conclusionText =
      '**Edge yếu / hỗn hợp** — `l6 ≥ 1` thường tốt hơn hoặc ngang baseline nhưng biên độ hoặc n trên mốc dài chưa đủ vững để hard-code vào rule chính thức. Nên giữ là metric quan sát / soft preference, chưa sửa scorerV4.';
  } else {
    conclusion = 'NO';
    conclusionText =
      '**Không nên** sửa rule chính thức — filter l6 không chứng minh ổn định đa mốc.';
  }

  // Override with clearer rule based on actual numbers after we see them - the logic above will use real data

  const lines: string[] = [];
  lines.push('# NEAR V4 — so sánh đa mốc (90 / 180 / 365d) & ổn định filter L6');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('**Engine:** scorerV4 + tradePlanV4 only (không sửa rule trong task này)');
  lines.push('**Phạm vi:** V4 only — không v4.1');
  lines.push('');
  lines.push('## 0. Độ phủ dữ liệu');
  lines.push('');
  lines.push('| Mốc | span thực (ngày) | NEAR 1h bars | NEAR 4h bars | OI real % bars | LS real % bars | funding pts |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const b of blocks) {
    const m = b.meta;
    lines.push(
      `| ${m.daysRequested}d | ${fmt(m.spanDaysActual, 1)} | ${m.near1hBars} | ${m.near4hBars} | ${fmt(m.oiRealPct)} | ${fmt(m.lsRealPct)} | ${m.fundingPoints} |`,
    );
  }
  lines.push('');
  lines.push(
    '> OI/LS Binance futures data hist thường chỉ ~30 ngày (limit≈500 điểm 1h). Phần còn lại của cửa sổ 180/365d chạy với **fallback OI=0 / L:S=1** — làm giảm độ tin cậy của L5b/L7 trên mẫu dài; **L6 (funding)** dùng funding history dài hơn nên đáng tin hơn OI/LS.',
  );
  lines.push('');
  lines.push('## 1. Bảng WR / n theo mốc');
  lines.push('');
  lines.push('| Mốc | Baseline WR / n | l6≥1 WR / n | l6≥1.5 WR / n |');
  lines.push('|---|---|---|---|');
  for (const b of blocks) {
    lines.push(
      `| ${b.days}d | ${cell(b.baseline)} | ${cell(b.l6ge1)} | ${cell(b.l6ge15)} |`,
    );
  }
  lines.push('');
  lines.push('### Chi tiết PF / Expectancy / MaxDD');
  lines.push('');
  for (const b of blocks) {
    lines.push(`#### ${b.days}d`);
    lines.push(`- Baseline: ${detail(b.baseline)}`);
    lines.push(`- l6≥1: ${detail(b.l6ge1)}`);
    lines.push(`- l6≥1.5: ${detail(b.l6ge15)}`);
    lines.push(`- (tham chiếu) l1≥1.5: ${detail(b.l1ge15)}`);
    lines.push(`- (tham chiếu) l3≥2: ${detail(b.l3ge2)}`);
    lines.push('');
  }

  lines.push('## 2. Đánh giá độ ổn định');
  lines.push('');
  lines.push('| Filter | WR 90→180→365 | Range (pp) | Edge vs baseline (pp) 90/180/365 | Luôn > baseline? |');
  lines.push('|---|---|---:|---|:-:|');
  lines.push(
    `| l6≥1 | ${l6_1_wrs.map((x) => fmt(x)).join(' → ')} | ${fmt(l61Range)} | ${edges1.map((e) => fmt(e)).join(' / ')} | ${l61AlwaysBeats ? 'YES' : 'NO'} |`,
  );
  lines.push(
    `| l6≥1.5 | ${l6_15_wrs.map((x) => fmt(x)).join(' → ')} | ${fmt(l615Range)} | ${edges15.map((e) => fmt(e)).join(' / ')} | ${l615AlwaysBeats ? 'YES' : 'NO'} |`,
  );
  lines.push(
    `| baseline | ${base_wrs.map((x) => fmt(x)).join(' → ')} | ${fmt(range(base_wrs))} | — | — |`,
  );
  lines.push('');
  lines.push('### Theo quý (trên mẫu 365d)');
  lines.push('');
  lines.push('| Quý | Baseline WR/n | l6≥1 WR/n | l6≥1.5 WR/n |');
  lines.push('|---|---|---|---|');
  for (const q of b365.quarters) {
    lines.push(
      `| ${q.q} | ${cell(q.baseline)} | ${cell(q.l6ge1)} | ${cell(q.l6ge15)} |`,
    );
  }
  lines.push('');
  lines.push('### Nhận xét ổn định');
  lines.push('');
  lines.push(
    `- Biên độ WR \`l6≥1\` giữa các mốc: **${fmt(l61Range)} điểm %** (ngưỡng cảnh báo >10–15pp).`,
  );
  lines.push(
    `- Biên độ WR \`l6≥1.5\`: **${fmt(l615Range)} điểm %**.`,
  );
  lines.push(
    `- Edge \`l6≥1\` vs baseline: ${edges1.map((e) => fmt(e) + 'pp').join(', ')} — ${l61AlwaysBeats ? 'luôn dương' : 'không luôn dương'}.`,
  );
  lines.push(
    `- Edge \`l6≥1.5\` vs baseline: ${edges15.map((e) => fmt(e) + 'pp').join(', ')} — ${l615AlwaysBeats ? 'luôn dương' : 'không luôn dương'}.`,
  );
  lines.push('');

  lines.push('## 3. Ý nghĩa L6 trong scorerV4');
  lines.push('');
  lines.push('**L6 = Funding layer (Group B — dòng tiền).**');
  lines.push('');
  lines.push('Khi có `fundingMetrics` (current, velocity, acceleration — đơn vị %):');
  lines.push('');
  lines.push('1. `classifyFundingState(current, velocity, acceleration)` → một trong:');
  lines.push('   - EXTREME_LONG_EUPHORIA, LONG_EUPHORIA_FADING, LONG_FUNDING_ELEVATED,');
  lines.push('   - NEUTRAL, SHORT_EUPHORIA_FADING, SHORT_SQUEEZE_BUILDING');
  lines.push('2. Map điểm raw (max 2) theo hướng:');
  lines.push('');
  lines.push('| State | LONG score | SHORT score |');
  lines.push('|---|---:|---:|');
  lines.push('| SHORT_SQUEEZE_BUILDING | 2 | 0 |');
  lines.push('| SHORT_EUPHORIA_FADING | 1.5 | 0.5 |');
  lines.push('| NEUTRAL | **1** | **1** |');
  lines.push('| LONG_EUPHORIA_FADING | 0.5 | 1.5 |');
  lines.push('| LONG_FUNDING_ELEVATED | 0.5 | 1.5 |');
  lines.push('| EXTREME_LONG_EUPHORIA | 0 | 2 |');
  lines.push('');
  lines.push('Hard-block riêng khi extreme squeeze ngược hướng (LONG + LONG_SQUEEZE / SHORT + SHORT_SQUEEZE).');
  lines.push('');
  lines.push('- **`l6 ≥ 1`**: loại các setup có funding **bất lợi rõ** (score 0 hoặc 0.5) — giữ NEUTRAL trở lên theo hướng trade.');
  lines.push('- **`l6 ≥ 1.5`**: chỉ giữ trạng thái funding **ủng hộ mạnh** (euphoria đối nghịch / squeeze building theo hướng có lợi).');
  lines.push('');
  lines.push(
    'Logic thị trường hợp lý một phần: không vào Long khi funding cực đoan long (đám đông trả funding cao → squeeze risk), và ngược lại cho Short. Tuy nhiên điểm L6 là **một phần Group B**; filter hậu kỳ trên trade đã `canEnter` có thể chỉ là tương quan mẫu — cần ổn định đa mốc mới coi là tín hiệu rule.',
  );
  lines.push('');

  // Recompute conclusion with clearer narrative after numbers
  if (l61Range > 15) {
    conclusion = 'NO';
    conclusionText =
      `**Không nên** đưa filter L6 vào entry gate chính thức — WR \`l6≥1\` dao động ${fmt(l61Range)}pp giữa các mốc (>15pp), dấu hiệu không ổn định / có thể overfit 90d.`;
  } else if (l61AlwaysBeats && l61Range <= 12 && b365.l6ge1.n >= 40) {
    conclusion = 'YES_SOFT';
    conclusionText =
      '**Có thể cân nhắc soft gate `l6 ≥ 1`** (không hard-block tuyệt đối) — edge dương trên cả 3 mốc, biên độ WR vừa phải. **`l6 ≥ 1.5` chặt hơn, n giảm mạnh — chưa khuyến nghị hard-code.** Chưa commit; chờ duyệt.';
  } else {
    conclusion = 'YES_STRICT_WEAK';
    conclusionText =
      '**Chưa đủ vững để sửa rule chính thức.** Edge L6 nhẹ hoặc không nhất quán đủ; giữ quan sát. Ưu tiên tin 180d nếu 365d bị nhiễu bởi OI/LS fallback (L6 funding vẫn OK).';
  }

  // Manual override refinement once we know edges - actually leave dynamic

  lines.push('## 4. Kết luận — có nên sửa rule V4?');
  lines.push('');
  lines.push(conclusionText);
  lines.push('');
  lines.push(`*(internal tag: \`${conclusion}\`)*`);
  lines.push('');
  lines.push('### Đề xuất code (CHỈ đề xuất — chưa áp dụng)');
  lines.push('');
  if (conclusion === 'NO') {
    lines.push('Không đề xuất patch `scorerV4.ts` / entry gate lúc này.');
  } else {
    lines.push(
      'Nếu duyệt soft filter, chỗ tự nhiên nhất là **sau** `canEnterV4(active)` ở call site (Signal Board / scan), không đổi công thức L6:',
    );
    lines.push('');
    lines.push('```ts');
    lines.push('// ĐỀ XUẤT — chưa merge');
    lines.push('import { l6RawScoreFromDirectional, canEnterV4 } from \'./scorerV4\';');
    lines.push('');
    lines.push('function canEnterV4WithFundingFloor(');
    lines.push('  active: DirectionalScoreV4,');
    lines.push('  minL6 = 1,');
    lines.push('): boolean {');
    lines.push('  if (!canEnterV4(active)) return false;');
    lines.push('  return l6RawScoreFromDirectional(active) >= minL6;');
    lines.push('}');
    lines.push('```');
    lines.push('');
    lines.push(
      'Không sửa bảng `LONG_L6_BY_STATE` / `SHORT_L6_BY_STATE` trừ khi có quyết định redesign funding state.',
    );
  }
  lines.push('');
  lines.push('## 5. CSV artefacts');
  lines.push('');
  lines.push('- `docs/exports/near_backtest_90d.csv`');
  lines.push('- `docs/exports/near_backtest_180d.csv`');
  lines.push('- `docs/exports/near_backtest_365d.csv`');
  lines.push('');

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${OUT_MD}`);
  console.log('\n=== SUMMARY TABLE ===');
  for (const b of blocks) {
    console.log(
      `${b.days}d | base ${cell(b.baseline)} | l6>=1 ${cell(b.l6ge1)} | l6>=1.5 ${cell(b.l6ge15)}`,
    );
  }
  console.log(`\nConclusion: ${conclusion}`);
  console.log(conclusionText);
}
