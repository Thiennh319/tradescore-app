/**
 * V4.1 Market Intelligence Trace — public export API.
 * Pipeline: frozen input → Builder → Formatter → Markdown string.
 */

import { buildMarketIntelligenceTrace } from './Builder';
import { formatMarketIntelligenceTrace } from './Formatter';
import type { MarketIntelligenceExportInput } from './Types';

/** Frozen MI snapshot → 01_MARKET_INTELLIGENCE.md Markdown. */
export function buildMarketIntelligenceExport(input: MarketIntelligenceExportInput): string {
  return formatMarketIntelligenceTrace(buildMarketIntelligenceTrace(input));
}
