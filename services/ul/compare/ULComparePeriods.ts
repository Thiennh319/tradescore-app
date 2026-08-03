/**
 * Task 15.2 — Period window helpers (O(1) resolve, O(n) filter).
 */

import type { ULTradeInput } from '../types';
import type { ULComparePeriodId, ULComparePeriodSpec } from './ULCompareTypes';

const DAY_MS = 86_400_000;

export function periodLabel(spec: ULComparePeriodSpec): string {
  switch (spec.id) {
    case 'today':
      return 'Today';
    case '7d':
      return '7 Days';
    case '30d':
      return '30 Days';
    case '90d':
      return '90 Days';
    case '180d':
      return '180 Days';
    case '365d':
      return '365 Days';
    case 'all':
      return 'All Time';
    case 'custom':
      return 'Custom Range';
    default:
      return 'Period';
  }
}

/** Inclusive [startMs, endMs] for closedAt filtering. `all` → null (no filter). */
export function resolvePeriodRange(
  spec: ULComparePeriodSpec,
  nowMs: number,
): { startMs: number; endMs: number } | null {
  if (!Number.isFinite(nowMs)) return null;
  if (spec.id === 'all') return null;
  if (spec.id === 'custom') {
    const start = Math.min(spec.startMs, spec.endMs);
    const end = Math.max(spec.startMs, spec.endMs);
    return { startMs: start, endMs: end };
  }

  const endMs = nowMs;
  if (spec.id === 'today') {
    const d = new Date(nowMs);
    const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return { startMs, endMs };
  }

  const days: Record<Exclude<ULComparePeriodId, 'today' | 'all' | 'custom'>, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '180d': 180,
    '365d': 365,
  };
  const n = days[spec.id];
  return { startMs: endMs - n * DAY_MS, endMs };
}

/** O(n) — does not mutate input. */
export function filterTradesByPeriod(
  trades: readonly ULTradeInput[],
  spec: ULComparePeriodSpec,
  nowMs: number,
): ULTradeInput[] {
  const range = resolvePeriodRange(spec, nowMs);
  if (range == null) return [...trades];
  const { startMs, endMs } = range;
  const out: ULTradeInput[] = [];
  for (const t of trades) {
    if (t.closedAt >= startMs && t.closedAt <= endMs) out.push(t);
  }
  return out;
}

export function periodSpec(id: Exclude<ULComparePeriodId, 'custom'>): ULComparePeriodSpec {
  return { id };
}

export function customPeriod(startMs: number, endMs: number): ULComparePeriodSpec {
  return { id: 'custom', startMs, endMs };
}
