/**
 * V4.1 Market Intelligence Trace — frozen export contracts.
 * Fields mirror services/v41/types.ts MarketIntelligenceSnapshot (+ detail).
 * Export layer copies only — never recompute engines.
 */

import type {
  MarketIntelligenceDetail,
  MarketIntelligenceSnapshot,
  MarketState,
  TrendDirection,
} from '../../v41/types';
import type { V41ExportMeta, V41ExportMetaInput } from '../types/V41ExportMeta';

export type {
  MarketIntelligenceDetail,
  MarketIntelligenceSnapshot,
  MarketState,
  TrendDirection,
};

/** Caller supplies a frozen MI snapshot (+ optional meta / symbol). */
export interface MarketIntelligenceExportInput {
  snapshot: MarketIntelligenceSnapshot;
  metadata?: V41ExportMetaInput | null;
  /** Display symbol (e.g. BTCUSDT) — not part of MI snapshot type. */
  symbol?: string | null;
}

/** Normalized, display-ready document for the formatter. */
export interface MarketIntelligenceTrace {
  metadata: V41ExportMeta;
  symbol: string;
  /** Top-level MI fields (copy of snapshot scalars). */
  summary: {
    trendStrength: number;
    trendDirection: TrendDirection;
    trendExhaustion: number;
    volumeDivergencePts: 0 | 20;
    reversalProbability: number;
    rsiDivergenceScore: 0 | 50 | 100;
    cvdDivergenceScore: 0 | 50 | 100;
    marketConfidence: number;
    btcAlignmentFactor: number;
    btcDirection: TrendDirection;
    marketState: MarketState;
    scanTimestamp: number;
  };
  /** Engine 1–4 breakdown when present on the frozen snapshot. */
  detail: MarketIntelligenceDetail | null;
}
