/**
 * TASK 16.6 — TradePlan Trace Export public API.
 *
 * buildTradePlanTraceExport(input) -> Markdown (05_TRADE_PLAN.md).
 * Pure and deterministic: same frozen input, byte-identical Markdown.
 */

import { buildTradePlanTrace } from './TradePlanTraceBuilder';
import { formatTradePlanTrace } from './TradePlanTraceFormatter';
import type { TradePlanTraceInput } from './TradePlanTraceTypes';

export function buildTradePlanTraceExport(input: TradePlanTraceInput): string {
  return formatTradePlanTrace(buildTradePlanTrace(input));
}
