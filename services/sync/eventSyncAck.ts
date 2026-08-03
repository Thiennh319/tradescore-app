/**
 * Phase 13.2 — ACK helpers (Rule #40: ACK mới được xóa Queue).
 */

import type { SyncAck, SyncBatchResult } from './eventSyncTypes';

export function isFullBatchAcked(
  result: SyncBatchResult,
  expectedEventIds: readonly string[],
): result is { ok: true; acks: SyncAck[] } {
  if (!result.ok) return false;
  if (result.acks.length !== expectedEventIds.length) return false;
  const set = new Set(result.acks.map((a) => a.eventId));
  return expectedEventIds.every((id) => set.has(id));
}

export function ackedEventIdSet(acks: readonly SyncAck[]): Set<string> {
  return new Set(acks.filter((a) => a.ok).map((a) => a.eventId));
}

export function createSyncAck(
  eventId: string,
  acknowledgedAtUtc: string,
  duplicate = false,
): SyncAck {
  return {
    eventId,
    ok: true,
    duplicate: duplicate || undefined,
    acknowledgedAtUtc,
  };
}
