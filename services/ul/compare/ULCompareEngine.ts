/**
 * Task 15.2 — UL Compare Engine.
 * Compares two metric snapshots. Pure / read-only / O(k) metrics (k fixed).
 */

import { computeCoreMetrics } from '../ULMetrics';
import type { ULCoreMetrics, ULDashboardData, ULTradeInput } from '../types';
import {
  UL_COMPARE_LOWER_IS_BETTER,
  UL_COMPARE_METRIC_KEYS,
  UL_COMPARE_METRIC_LABELS,
  buildCompareSide,
  emptyMetricBag,
  metricBagFromCore,
  metricBagFromDashboard,
  readMetric,
} from './ULCompareBuilder';
import {
  filterTradesByPeriod,
  periodLabel,
  resolvePeriodRange,
} from './ULComparePeriods';
import type {
  ULCompareHighlight,
  ULCompareMetricKey,
  ULCompareMetricRow,
  ULComparePeriodSpec,
  ULCompareReport,
  ULCompareReportInput,
  ULCompareSide,
  ULCompareSummary,
  ULCompareTrend,
} from './ULCompareTypes';
import { UL_COMPARE_VERSION } from './ULCompareTypes';

const FLAT_ABS_EPS = 1e-9;
const FLAT_REL_EPS = 1e-6;

function isMetricBag(v: unknown): v is import('./ULCompareTypes').ULCompareMetricBag {
  return (
    v != null &&
    typeof v === 'object' &&
    'trades' in (v as object) &&
    'winRate' in (v as object) &&
    'netPnl' in (v as object) &&
    !('metrics' in (v as object))
  );
}

function isCompareSide(v: unknown): v is ULCompareSide {
  return v != null && typeof v === 'object' && 'metrics' in (v as object) && 'label' in (v as object);
}

export function normalizeCompareInput(
  input: ULCompareReportInput | ULCoreMetrics | ULDashboardData | null | undefined,
  fallbackLabel: string,
): ULCompareSide {
  if (input == null) {
    return buildCompareSide({ metrics: emptyMetricBag(), label: fallbackLabel });
  }

  if ('kpi' in input && 'metrics' in input && 'fingerprint' in input) {
    const dash = input as ULDashboardData;
    return buildCompareSide({
      metrics: metricBagFromDashboard(dash),
      label: fallbackLabel,
    });
  }

  if ('totalTrades' in input && 'consistencyScore' in input && 'grossProfit' in input) {
    return buildCompareSide({
      metrics: metricBagFromCore(input as ULCoreMetrics),
      label: fallbackLabel,
    });
  }

  if (isCompareSide(input)) {
    return {
      ...input,
      metrics: { ...input.metrics },
    };
  }

  if (isMetricBag(input)) {
    return buildCompareSide({ metrics: { ...input }, label: fallbackLabel });
  }

  const partial = input as {
    label?: string;
    period?: ULComparePeriodSpec | null;
    range?: { startMs: number; endMs: number } | null;
    metrics: import('./ULCompareTypes').ULCompareMetricBag;
  };
  return buildCompareSide({
    metrics: partial.metrics ? { ...partial.metrics } : emptyMetricBag(),
    label: partial.label ?? fallbackLabel,
    period: partial.period ?? null,
    range: partial.range ?? null,
  });
}

export function detectTrend(
  current: number | null,
  previous: number | null,
): ULCompareTrend {
  if (current == null || previous == null) return 'FLAT';
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'FLAT';
  const delta = current - previous;
  const scale = Math.max(Math.abs(previous), Math.abs(current), 1);
  if (Math.abs(delta) <= FLAT_ABS_EPS) return 'FLAT';
  if (Math.abs(delta) / scale <= FLAT_REL_EPS) return 'FLAT';
  if (delta > 0) return 'UP';
  if (delta < 0) return 'DOWN';
  return 'FLAT';
}

export function computeDelta(
  current: number | null,
  previous: number | null,
): { delta: number | null; pctDelta: number | null } {
  if (current == null || previous == null) return { delta: null, pctDelta: null };
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { delta: null, pctDelta: null };
  }
  const delta = current - previous;
  if (Math.abs(previous) < FLAT_ABS_EPS) {
    return { delta, pctDelta: Math.abs(current) < FLAT_ABS_EPS ? 0 : null };
  }
  return { delta, pctDelta: (delta / Math.abs(previous)) * 100 };
}

function isImprovement(row: ULCompareMetricRow): boolean | null {
  if (row.trend === 'FLAT' || row.delta == null) return null;
  if (row.key === 'largestLoss') {
    // Algebraic improvement: -10 is better than -50 (UP).
    return row.trend === 'UP';
  }
  if (row.higherIsBetter) return row.trend === 'UP';
  return row.trend === 'DOWN';
}

function buildRows(current: ULCompareSide, previous: ULCompareSide): ULCompareMetricRow[] {
  const rows: ULCompareMetricRow[] = [];
  for (const key of UL_COMPARE_METRIC_KEYS) {
    const cur = readMetric(current.metrics, key);
    const prev = readMetric(previous.metrics, key);
    const { delta, pctDelta } = computeDelta(cur, prev);
    const higherIsBetter = !UL_COMPARE_LOWER_IS_BETTER.has(key);
    rows.push({
      key,
      label: UL_COMPARE_METRIC_LABELS[key],
      current: cur,
      previous: prev,
      delta,
      pctDelta,
      trend: detectTrend(cur, prev),
      higherIsBetter: key === 'largestLoss' ? true : higherIsBetter,
    });
  }
  return rows;
}

function buildHighlights(rows: readonly ULCompareMetricRow[]): ULCompareHighlight[] {
  const out: ULCompareHighlight[] = [];

  const push = (
    key: ULCompareMetricKey,
    tone: ULCompareHighlight['tone'],
    title: string,
    detail: string,
  ) => {
    out.push({ id: `hl-${key}-${tone}`, tone, title, detail, metricKey: key });
  };

  for (const row of rows) {
    const improved = isImprovement(row);
    if (improved == null) continue;
    const d = row.delta;
    const detail =
      d == null
        ? row.label
        : `${row.label}: ${row.previous ?? '—'} → ${row.current ?? '—'} (Δ ${d >= 0 ? '+' : ''}${d.toFixed(2)})`;

    switch (row.key) {
      case 'winRate':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Win rate improved' : 'Win rate declined',
          detail,
        );
        break;
      case 'maxDrawdown':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Drawdown reduced' : 'Drawdown increased',
          detail,
        );
        break;
      case 'profitFactor':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Profit factor increased' : 'Profit factor decreased',
          detail,
        );
        break;
      case 'consistency':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Consistency higher' : 'Consistency lower',
          detail,
        );
        break;
      case 'recoveryFactor':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Recovery improved' : 'Recovery weakened',
          detail,
        );
        break;
      case 'largestLoss':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Largest loss reduced' : 'Largest loss worsened',
          detail,
        );
        break;
      case 'netPnl':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Net PnL improved' : 'Net PnL declined',
          detail,
        );
        break;
      case 'performanceScore':
        push(
          row.key,
          improved ? 'positive' : 'negative',
          improved ? 'Performance score up' : 'Performance score down',
          detail,
        );
        break;
      default:
        break;
    }
  }

  // Deterministic order: positives first, then negatives, then by key
  const toneRank = { positive: 0, negative: 1, neutral: 2 };
  out.sort((a, b) => {
    const t = toneRank[a.tone] - toneRank[b.tone];
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
  return out.slice(0, 12);
}

function buildSummary(rows: readonly ULCompareMetricRow[]): ULCompareSummary {
  let improvedCount = 0;
  let worsenedCount = 0;
  let flatCount = 0;
  for (const row of rows) {
    const improved = isImprovement(row);
    if (improved == null) flatCount += 1;
    else if (improved) improvedCount += 1;
    else worsenedCount += 1;
  }

  let headline = 'Performance is largely unchanged.';
  if (improvedCount > worsenedCount) headline = 'Overall performance improved vs prior period.';
  else if (worsenedCount > improvedCount) headline = 'Overall performance weakened vs prior period.';

  return { improvedCount, worsenedCount, flatCount, headline };
}

/**
 * Primary API — compare two sides (metrics / dashboard / side objects).
 * Never throws; null/empty → zero bags.
 */
export function buildULComparisonReport(
  current: ULCompareReportInput | ULCoreMetrics | ULDashboardData | null | undefined,
  previous: ULCompareReportInput | ULCoreMetrics | ULDashboardData | null | undefined,
): ULCompareReport {
  const cur = normalizeCompareInput(current, 'Current');
  const prev = normalizeCompareInput(previous, 'Previous');
  const rows = buildRows(cur, prev);
  return {
    version: UL_COMPARE_VERSION,
    current: cur,
    previous: prev,
    rows,
    summary: buildSummary(rows),
    highlights: buildHighlights(rows),
  };
}

/**
 * Convenience: filter trades by period (O(n) each) → core metrics → compare.
 * Does not mutate trades.
 */
export function buildULComparisonReportForPeriods(
  trades: readonly ULTradeInput[],
  currentPeriod: ULComparePeriodSpec,
  previousPeriod: ULComparePeriodSpec,
  nowMs: number,
): ULCompareReport {
  const currentTrades = filterTradesByPeriod(trades, currentPeriod, nowMs);
  const previousTrades = filterTradesByPeriod(trades, previousPeriod, nowMs);
  const currentMetrics = computeCoreMetrics(currentTrades);
  const previousMetrics = computeCoreMetrics(previousTrades);
  return buildULComparisonReport(
    {
      label: periodLabel(currentPeriod),
      period: currentPeriod,
      range: resolvePeriodRange(currentPeriod, nowMs),
      metrics: metricBagFromCore(currentMetrics),
    },
    {
      label: periodLabel(previousPeriod),
      period: previousPeriod,
      range: resolvePeriodRange(previousPeriod, nowMs),
      metrics: metricBagFromCore(previousMetrics),
    },
  );
}
