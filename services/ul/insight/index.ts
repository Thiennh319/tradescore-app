/**
 * Task 15.3 — Trading Insight Engine public API.
 */

export { TRADING_INSIGHT_VERSION, TRADING_INSIGHT_SEVERITY_RANK } from './TradingInsightTypes';
export type {
  TradingInsightCategory,
  TradingInsightSeverity,
  TradingInsight,
  TradingInsightBucket,
  TradingInsightSummary,
  TradingInsightReport,
} from './TradingInsightTypes';

export { INSIGHT_RULES } from './TradingInsightRules';
export { clampConfidence, fmtNum, fmtPct, severityLabel } from './TradingInsightFormatter';
export { evaluateInsightRules } from './TradingInsightBuilder';
export { buildTradingInsightReport } from './TradingInsightEngine';
