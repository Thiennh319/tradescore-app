/**
 * V4.1 Market Intelligence Trace — Builder.
 * Copy-only from frozen MarketIntelligenceSnapshot. No engine calls.
 */

import { resolveV41ExportMeta } from '../types/V41ExportMeta';
import type {
  MarketIntelligenceExportInput,
  MarketIntelligenceTrace,
} from './Types';

/** Build normalized MI trace document from a frozen snapshot. */
export function buildMarketIntelligenceTrace(
  input: MarketIntelligenceExportInput,
): MarketIntelligenceTrace {
  const { snapshot } = input;
  return {
    metadata: resolveV41ExportMeta(input.metadata),
    symbol: input.symbol != null && String(input.symbol).trim() !== '' ? String(input.symbol) : '',
    summary: {
      trendStrength: snapshot.trendStrength,
      trendDirection: snapshot.trendDirection,
      trendExhaustion: snapshot.trendExhaustion,
      volumeDivergencePts: snapshot.volumeDivergencePts,
      reversalProbability: snapshot.reversalProbability,
      rsiDivergenceScore: snapshot.rsiDivergenceScore,
      cvdDivergenceScore: snapshot.cvdDivergenceScore,
      marketConfidence: snapshot.marketConfidence,
      btcAlignmentFactor: snapshot.btcAlignmentFactor,
      btcDirection: snapshot.btcDirection,
      marketState: snapshot.marketState,
      scanTimestamp: snapshot.scanTimestamp,
    },
    detail: snapshot.detail ?? null,
  };
}
