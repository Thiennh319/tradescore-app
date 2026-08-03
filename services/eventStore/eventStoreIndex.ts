/**
 * Task 12B.2 — In-memory indexes for Event Store.
 * Chuẩn bị Journal Projector (12B.3).
 */

import type { TradeEventType } from '../events';
import type { StoredTradeEvent } from './eventStoreTypes';
import { buildIdempotencyIndexKey } from './eventStoreTypes';

export type EventStoreIndexes = {
  byEventId: Map<string, number>;
  byAggregateId: Map<string, number[]>;
  byCorrelationId: Map<string, number[]>;
  byEventType: Map<TradeEventType, number[]>;
  /** createdAtUtc → storeSequence[] (stable sort by sequence on read) */
  byCreatedAtUtc: Map<string, number[]>;
  /** eventType+aggregateId+idempotencyKey → storeSequence */
  byIdempotency: Map<string, number>;
};

export function createEmptyEventStoreIndexes(): EventStoreIndexes {
  return {
    byEventId: new Map(),
    byAggregateId: new Map(),
    byCorrelationId: new Map(),
    byEventType: new Map(),
    byCreatedAtUtc: new Map(),
    byIdempotency: new Map(),
  };
}

function pushIndex(map: Map<string, number[]>, key: string, seq: number): void {
  const list = map.get(key);
  if (list) list.push(seq);
  else map.set(key, [seq]);
}

function pushTypeIndex(
  map: Map<TradeEventType, number[]>,
  key: TradeEventType,
  seq: number,
): void {
  const list = map.get(key);
  if (list) list.push(seq);
  else map.set(key, [seq]);
}

/** Index một record mới (append-only — không xoá index). */
export function indexStoredEvent(
  indexes: EventStoreIndexes,
  stored: StoredTradeEvent,
): void {
  const { event, storeSequence } = stored;
  indexes.byEventId.set(event.eventId, storeSequence);
  pushIndex(indexes.byAggregateId, event.aggregateId, storeSequence);
  pushIndex(indexes.byCorrelationId, event.correlationId, storeSequence);
  pushTypeIndex(indexes.byEventType, event.eventType, storeSequence);
  pushIndex(indexes.byCreatedAtUtc, event.createdAtUtc, storeSequence);
  indexes.byIdempotency.set(
    buildIdempotencyIndexKey({
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      idempotencyKey: event.idempotencyKey,
    }),
    storeSequence,
  );
}

export function resolveBySequences(
  records: readonly StoredTradeEvent[],
  sequences: readonly number[] | undefined,
): StoredTradeEvent[] {
  if (!sequences || sequences.length === 0) return [];
  return sequences
    .map((seq) => records[seq - 1])
    .filter((r): r is StoredTradeEvent => r != null)
    .sort((a, b) => a.storeSequence - b.storeSequence);
}
