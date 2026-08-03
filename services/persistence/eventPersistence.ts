/**
 * Phase 13.1 — In-memory Event Persistence (Desktop foundation default).
 * Append-only · không update/delete event body · ACK = metadata.
 */

import type { TradeEvent } from '../events';
import type { StoredTradeEvent } from '../eventStore';
import { buildIdempotencyIndexKey } from '../eventStore';
import type {
  IEventPersistence,
  MemoryEventPersistenceOptions,
  PersistenceAckResult,
  PersistenceAppendResult,
  PersistenceFlushResult,
  PersistenceHealth,
} from './eventPersistenceTypes';

function freezeEvent(event: TradeEvent): TradeEvent {
  return Object.freeze(structuredClone(event)) as TradeEvent;
}

function cloneStored(row: StoredTradeEvent): StoredTradeEvent {
  return {
    storeSequence: row.storeSequence,
    event: freezeEvent(row.event),
    ackStatus: row.ackStatus,
    retryCount: row.retryCount,
    acknowledgedAtUtc: row.acknowledgedAtUtc,
  };
}

export class MemoryEventPersistence implements IEventPersistence {
  private readonly records: StoredTradeEvent[] = [];
  private readonly byEventId = new Map<string, number>();
  private readonly byAggregateId = new Map<string, number[]>();
  private readonly byIdempotency = new Map<string, number>();
  private nextSequence = 1;
  private pendingFlush = 0;
  private readOnly: boolean;
  private readonly nowUtc: () => string;

  constructor(options: MemoryEventPersistenceOptions = {}) {
    this.readOnly = options.readOnly === true;
    this.nowUtc = options.nowUtc ?? (() => new Date().toISOString());
  }

  setReadOnly(value: boolean): void {
    this.readOnly = value;
  }

  async append(event: TradeEvent): Promise<PersistenceAppendResult> {
    if (this.readOnly) {
      return {
        ok: false,
        code: 'READONLY',
        message: 'Persistence is READONLY',
      };
    }

    if (this.byEventId.has(event.eventId)) {
      return {
        ok: false,
        code: 'DUPLICATE_EVENT_ID',
        message: `Duplicate eventId: ${event.eventId}`,
      };
    }

    const idemKey = buildIdempotencyIndexKey({
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      idempotencyKey: event.idempotencyKey,
    });
    if (this.byIdempotency.has(idemKey)) {
      return {
        ok: false,
        code: 'DUPLICATE_IDEMPOTENCY',
        message: `Duplicate idempotency for ${event.eventType}/${event.aggregateId}`,
      };
    }

    const stored: StoredTradeEvent = {
      storeSequence: this.nextSequence,
      event: freezeEvent(event),
      ackStatus: 'Pending',
      retryCount: 0,
    };

    this.records.push(stored);
    this.byEventId.set(event.eventId, this.nextSequence);
    const agg = this.byAggregateId.get(event.aggregateId) ?? [];
    agg.push(this.nextSequence);
    this.byAggregateId.set(event.aggregateId, agg);
    this.byIdempotency.set(idemKey, this.nextSequence);
    this.nextSequence += 1;
    this.pendingFlush += 1;

    return { ok: true, stored: cloneStored(stored) };
  }

  async appendBatch(events: readonly TradeEvent[]): Promise<PersistenceAppendResult[]> {
    const results: PersistenceAppendResult[] = [];
    for (const event of events) {
      results.push(await this.append(event));
    }
    return results;
  }

  async read(eventId: string): Promise<StoredTradeEvent | null> {
    const seq = this.byEventId.get(eventId);
    if (seq == null) return null;
    const row = this.records[seq - 1];
    return row ? cloneStored(row) : null;
  }

  async readAggregate(aggregateId: string): Promise<StoredTradeEvent[]> {
    const seqs = this.byAggregateId.get(aggregateId) ?? [];
    return seqs
      .map((seq) => this.records[seq - 1])
      .filter((r): r is StoredTradeEvent => r != null)
      .sort((a, b) => a.storeSequence - b.storeSequence)
      .map(cloneStored);
  }

  async readAll(): Promise<StoredTradeEvent[]> {
    return this.records.map(cloneStored);
  }

  async ack(
    eventId: string,
    input?: { status?: 'Acknowledged' | 'Failed'; incrementRetry?: boolean },
  ): Promise<PersistenceAckResult> {
    if (this.readOnly) {
      return {
        ok: false,
        code: 'READONLY',
        message: 'Persistence is READONLY',
      };
    }

    const seq = this.byEventId.get(eventId);
    if (seq == null) {
      return { ok: false, code: 'NOT_FOUND', message: `Unknown eventId: ${eventId}` };
    }
    const row = this.records[seq - 1];
    if (!row) {
      return { ok: false, code: 'NOT_FOUND', message: `Unknown eventId: ${eventId}` };
    }

    row.ackStatus = input?.status ?? 'Acknowledged';
    if (input?.incrementRetry) {
      row.retryCount += 1;
    }
    row.acknowledgedAtUtc = this.nowUtc();
    this.pendingFlush += 1;

    return { ok: true, stored: cloneStored(row) };
  }

  async flush(): Promise<PersistenceFlushResult> {
    const flushedCount = this.pendingFlush;
    this.pendingFlush = 0;
    return { ok: true, flushedCount };
  }

  async health(): Promise<PersistenceHealth> {
    return {
      status: this.readOnly ? 'READONLY' : 'READY',
      checkedAtUtc: this.nowUtc(),
      backend: 'MEMORY',
      detail: this.readOnly ? 'read-only mode' : `records=${this.records.length}`,
    };
  }
}

export function createMemoryEventPersistence(
  options?: MemoryEventPersistenceOptions,
): IEventPersistence {
  return new MemoryEventPersistence(options);
}
