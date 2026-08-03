/**
 * Task 15.2 — UL Compare Engine public API.
 */

export { UL_COMPARE_VERSION } from './ULCompareTypes';
export type {
  ULCompareTrend,
  ULComparePeriodId,
  ULComparePeriodSpec,
  ULCompareMetricKey,
  ULCompareMetricBag,
  ULCompareSide,
  ULCompareMetricRow,
  ULCompareHighlight,
  ULCompareSummary,
  ULCompareReport,
  ULCompareReportInput,
} from './ULCompareTypes';

export {
  periodLabel,
  resolvePeriodRange,
  filterTradesByPeriod,
  periodSpec,
  customPeriod,
} from './ULComparePeriods';

export {
  UL_COMPARE_METRIC_KEYS,
  UL_COMPARE_METRIC_LABELS,
  UL_COMPARE_LOWER_IS_BETTER,
  metricBagFromCore,
  metricBagFromDashboard,
  emptyMetricBag,
  buildCompareSide,
  readMetric,
} from './ULCompareBuilder';

export {
  formatCompareTrendArrow,
  formatCompareDelta,
  formatComparePctDelta,
} from './ULCompareFormatter';

export {
  buildULComparisonReport,
  buildULComparisonReportForPeriods,
  detectTrend,
  computeDelta,
  normalizeCompareInput,
} from './ULCompareEngine';
