/**
 * Phase 13.2 — Retry backoff (Rule #41: không sinh Event mới).
 */

import { DEFAULT_SYNC_BACKOFF_SECONDS } from './eventSyncTypes';

/**
 * Delay giây trước retry kế tiếp theo retryCount (0-based sau lần fail đầu).
 * 1s → 2s → 5s → 10s → 30s → 60s → 60s…
 */
export function nextBackoffSeconds(
  retryCount: number,
  schedule: readonly number[] = DEFAULT_SYNC_BACKOFF_SECONDS,
): number {
  if (retryCount < 0) return schedule[0] ?? 1;
  if (retryCount < schedule.length) return schedule[retryCount]!;
  return schedule[schedule.length - 1] ?? 60;
}

export function computeNextRetryAtUtc(
  retryCount: number,
  nowUtc: string,
  schedule?: readonly number[],
): string {
  const delaySec = nextBackoffSeconds(retryCount, schedule);
  const ms = Date.parse(nowUtc);
  const base = Number.isFinite(ms) ? ms : Date.now();
  return new Date(base + delaySec * 1000).toISOString();
}

export function isRetryDue(
  nextRetryAtUtc: string | null,
  nowUtc: string,
): boolean {
  if (nextRetryAtUtc == null) return true;
  return nextRetryAtUtc <= nowUtc;
}
