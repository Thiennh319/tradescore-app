/**
 * Task 12B.2 — Event Store types.
 * Append-only store envelope around Trade Event Contract (12B.1).
 */

import type { TradeEvent, TradeEventType } from '../events';

/** ACK metadata only — không rewrite event business data. */
export type EventAckStatus = 'Pending' | 'Acknowledged' | 'Failed';

/**
 * Record trong Event Store.
 * `event` bất biến sau append; chỉ ackStatus / retryCount được cập nhật.
 */
export type StoredTradeEvent = {
  /** Global monotonic append order (Projector / Sequence). */
  storeSequence: number;
  event: TradeEvent;
  ackStatus: EventAckStatus;
  retryCount: number;
  acknowledgedAtUtc?: string;
};

export type EventStoreAppendErrorCode =
  | 'INVALID_EVENT'
  | 'DUPLICATE_EVENT_ID'
  | 'DUPLICATE_IDEMPOTENCY'
  | 'IMMUTABLE_VIOLATION';

export type EventStoreAppendResult =
  | { ok: true; stored: StoredTradeEvent }
  | {
      ok: false;
      code: EventStoreAppendErrorCode;
      message: string;
      existingEventId?: string;
    };

export type EventStoreAckResult =
  | { ok: true; stored: StoredTradeEvent }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATUS'; message: string };

export type EventIdempotencyTuple = {
  eventType: TradeEventType;
  aggregateId: string;
  idempotencyKey: string;
};

export function buildIdempotencyIndexKey(tuple: EventIdempotencyTuple): string {
  return `${tuple.eventType}\u0000${tuple.aggregateId}\u0000${tuple.idempotencyKey}`;
}

/** Public Event Store API (in-memory foundation). */
export interface IEventStore {
  append(event: TradeEvent): EventStoreAppendResult;
  read(eventId: string): StoredTradeEvent | null;
  readAggregate(aggregateId: string): StoredTradeEvent[];
  readByCorrelation(correlationId: string): StoredTradeEvent[];
  readByType(eventType: TradeEventType): StoredTradeEvent[];
  readAll(): StoredTradeEvent[];
  acknowledge(
    eventId: string,
    status?: Exclude<EventAckStatus, 'Pending'>,
    options?: { incrementRetry?: boolean },
  ): EventStoreAckResult;
  /** Test / diagnostics — không phải persistence API. */
  size(): number;
}
