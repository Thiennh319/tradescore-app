/**
 * V4.1 Foundation — numeric metrics bag.
 * UI must read numbers here; engines must not rely on parsed text.
 */

export interface V41EngineMetrics {
  atr?: number | null;
  atrRatio?: number | null;
  atrRatioPrev?: number | null;
  volume?: number | null;
  volumeRatio?: number | null;
  oi?: number | null;
  oiDeltaPct?: number | null;
  funding?: number | null;
  liquidationPressure?: number | null;
  btcAlignment?: number | null;
  btcTrendStrength?: number | null;
  trendStrength?: number | null;
  trendExhaustion?: number | null;
  marketConfidence?: number | null;
  reversalProbability?: number | null;
  entryQuality?: number | null;
  entryQualityLong?: number | null;
  entryQualityShort?: number | null;
  momentumLong?: number | null;
  momentumShort?: number | null;
  protectionPenalty?: number | null;
  readinessScore?: number | null;
  signalCount?: number | null;
  /** Engine-specific numeric extensions — no free-form text. */
  [key: string]: number | null | undefined;
}
