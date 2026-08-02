/**
 * NEAR-only V4 layer gates (post-score) — không đụng scoreL*V4 / constants shared.
 * SSOT: REPORT_V4_NEAR_SHORT_L3_GATE_ARCHITECTURE_2026-08-02 (Option A).
 */
import type { AppTradeSymbol } from '../constants/scoring';

export type NearV4SignalTag = 'STRONG_L3';

export const NEAR_V4_LAYER_GATES = {
  symbol: 'NEARUSDT' as const satisfies AppTradeSymbol,
  SHORT: {
    /** S1 — hard min L3 raw score (0–2) */
    l3MinHard: 1.5,
    /** S3 — badge only, không block */
    l3StrongLabelAt: 2,
  },
} as const;

export function isNearShortLayerGateSymbol(symbol: string): boolean {
  return symbol === NEAR_V4_LAYER_GATES.symbol;
}

/** S1: hard-block reason khi NEAR SHORT và L3 < 1.5; ngược lại null. */
export function nearShortL3HardBlockReason(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  l3Score: number,
): string | null {
  if (!isNearShortLayerGateSymbol(symbol) || direction !== 'SHORT') return null;
  if (l3Score >= NEAR_V4_LAYER_GATES.SHORT.l3MinHard) return null;
  return `NEAR SHORT — L3 MACD < ${NEAR_V4_LAYER_GATES.SHORT.l3MinHard} (gate NEAR-only)`;
}

/** S3: true khi NEAR SHORT và L3 ≥ 2 (nhãn, không block). */
export function nearShortL3IsStrong(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  l3Score: number,
): boolean {
  if (!isNearShortLayerGateSymbol(symbol) || direction !== 'SHORT') return false;
  return l3Score >= NEAR_V4_LAYER_GATES.SHORT.l3StrongLabelAt;
}

/** Gộp S1 + S3 cho scorer — một chỗ gọi sau scoreL3V4. */
export function resolveNearShortL3Gate(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  l3Score: number,
): {
  hardBlockReason: string | null;
  signalTags: ReadonlyArray<NearV4SignalTag>;
} {
  const hardBlockReason = nearShortL3HardBlockReason(symbol, direction, l3Score);
  const signalTags: NearV4SignalTag[] = nearShortL3IsStrong(symbol, direction, l3Score)
    ? ['STRONG_L3']
    : [];
  return { hardBlockReason, signalTags };
}
