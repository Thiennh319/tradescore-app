/**
 * Task 12B.2 — In-memory Append-Only Event Store (Source of Truth foundation).
 *
 * Không Update / Delete / Rewrite event business data.
 * ACK chỉ đổi store metadata (status / retryCount).
 */

import {
  validateTradeEvent,
  type TradeEvent,
  type TradeEventType,
} from '../events';
import {
  createEmptyEventStoreIndexes,
  indexStoredEvent,
  resolveBySequences,
  type EventStoreIndexes,
} from './eventStoreIndex';
import type {
  EventAckStatus,
  EventStoreAckResult,
  EventStoreAppendResult,
  IEventStore,
  StoredTradeEvent,
} from './eventStoreTypes';
import { buildIdempotencyIndexKey } from './eventStoreTypes';

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const obj = value as object;
  if (Object.isFrozen(obj)) return value;
  for (const key of Reflect.ownKeys(obj)) {
    const child = (obj as Record<string | symbol, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

function cloneEvent(event: TradeEvent): TradeEvent {
  return deepFreeze(structuredClone(event)) as TradeEvent;
}

function cloneStored(stored: StoredTradeEvent): StoredTradeEvent {
  return {
    storeSequence: stored.storeSequence,
    event: cloneEvent(stored.event),
    ackStatus: stored.ackStatus,
    retryCount: stored.retryCount,
    acknowledgedAtUtc: stored.acknowledgedAtUtc,
  };
}

export class InMemoryEventStore implements IEventStore {
  private readonly records: StoredTradeEvent[] = [];
  private readonly indexes: EventStoreIndexes = createEmptyEventStoreIndexes();
  private nextSequence = 1;

  append(event: TradeEvent): EventStoreAppendResult {
    const validated = validateTradeEvent(event);
    if (!validated.ok) {
      return {
        ok: false,
        code: 'INVALID_EVENT',
        message: validated.issues.map((i) => i.message).join('; '),
      };
    }

    const e = validated.event;

    if (this.indexes.byEventId.has(e.eventId)) {
      return {
        ok: false,
        code: 'DUPLICATE_EVENT_ID',
        message: `Duplicate eventId: ${e.eventId}`,
        existingEventId: e.eventId,
      };
    }

    const idemKey = buildIdempotencyIndexKey({
      eventType: e.eventType,
      aggregateId: e.aggregateId,
      idempotencyKey: e.idempotencyKey,
    });
    const existingSeq = this.indexes.byIdempotency.get(idemKey);
    if (existingSeq != null) {
      const existing = this.records[existingSeq - 1];
      return {
        ok: false,
        code: 'DUPLICATE_IDEMPOTENCY',
        message: `Duplicate idempotency (${e.eventType}, ${e.aggregateId}, ${e.idempotencyKey})`,
        existingEventId: existing?.event.eventId,
      };
    }

    const frozen = cloneEvent(e);
    const stored: StoredTradeEvent = {
      storeSequence: this.nextSequence,
      event: frozen,
      ackStatus: 'Pending',
      retryCount: 0,
    };

    this.records.push(stored);
    indexStoredEvent(this.indexes, stored);
    this.nextSequence += 1;

    return { ok: true, stored: cloneStored(stored) };
  }

  read(eventId: string): StoredTradeEvent | null {
    const seq = this.indexes.byEventId.get(eventId);
    if (seq == null) return null;
    const row = this.records[seq - 1];
    return row ? cloneStored(row) : null;
  }

  readAggregate(aggregateId: string): StoredTradeEvent[] {
    return resolveBySequences(
      this.records,
      this.indexes.byAggregateId.get(aggregateId),
    ).map(cloneStored);
  }

  readByCorrelation(correlationId: string): StoredTradeEvent[] {
    return resolveBySequences(
      this.records,
      this.indexes.byCorrelationId.get(correlationId),
    ).map(cloneStored);
  }

  readByType(eventType: TradeEventType): StoredTradeEvent[] {
    return resolveBySequences(
      this.records,
      this.indexes.byEventType.get(eventType),
    ).map(cloneStored);
  }

  readAll(): StoredTradeEvent[] {
    return this.records.map(cloneStored);
  }

  acknowledge(
    eventId: string,
    status: Exclude<EventAckStatus, 'Pending'> = 'Acknowledged',
    options?: { incrementRetry?: boolean },
  ): EventStoreAckResult {
    if (status !== 'Acknowledged' && status !== 'Failed') {
      return {
        ok: false,
        code: 'INVALID_STATUS',
        message: `Invalid ack status: ${String(status)}`,
      };
    }

    const seq = this.indexes.byEventId.get(eventId);
    if (seq == null) {
      return { ok: false, code: 'NOT_FOUND', message: `Unknown eventId: ${eventId}` };
    }

    const row = this.records[seq - 1];
    if (!row) {
      return { ok: false, code: 'NOT_FOUND', message: `Unknown eventId: ${eventId}` };
    }

    // Chỉ cập nhật ACK metadata — không đụng event payload / envelope nghiệp vụ.
    row.ackStatus = status;
    if (options?.incrementRetry) {
      row.retryCount += 1;
    }
    row.acknowledgedAtUtc = new Date().toISOString();

    return { ok: true, stored: cloneStored(row) };
  }

  size(): number {
    return this.records.length;
  }
}

/** Factory — in-memory SoT foundation (chưa persistence). */
export function createEventStore(): IEventStore {
  return new InMemoryEventStore();
}
