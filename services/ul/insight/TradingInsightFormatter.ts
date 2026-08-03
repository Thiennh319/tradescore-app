/**
 * Task 15.3 — Insight format helpers (pure).
 */

import type { TradingInsightSeverity } from './TradingInsightTypes';

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export function fmtPct(n: number | null | undefined): string {
  return `${fmtNum(n, 1)}%`;
}

export function severityLabel(s: TradingInsightSeverity): string {
  return s;
}
