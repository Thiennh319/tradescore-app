/**
 * Phase 13.1 — Event Persistence types (Desktop/Web storage foundation).
 * Không Business Logic · không Engine / Journal / UI.
 */

import type { TradeEvent } from '../events';
import type { EventAckStatus, StoredTradeEvent } from '../eventStore';

export type PersistenceHealthStatus =
  | 'READY'
  | 'ERROR'
  | 'READONLY'
  | 'SYNCING';

export type PersistenceHealth = {
  status: PersistenceHealthStatus;
  detail?: string;
  checkedAtUtc: string;
  backend: PersistenceBackendKind;
};

export type PersistenceBackendKind = 'MEMORY' | 'SQLITE' | 'FILE' | 'CLOUD';

export type PersistenceAckInput = {
  eventId: string;
  status?: Exclude<EventAckStatus, 'Pending'>;
  incrementRetry?: boolean;
};

export type PersistenceAppendResult =
  | { ok: true; stored: StoredTradeEvent }
  | {
      ok: false;
      code: 'DUPLICATE_EVENT_ID' | 'DUPLICATE_IDEMPOTENCY' | 'READONLY' | 'ERROR';
      message: string;
    };

export type PersistenceAckResult =
  | { ok: true; stored: StoredTradeEvent }
  | { ok: false; code: 'NOT_FOUND' | 'READONLY' | 'ERROR'; message: string };

export type PersistenceFlushResult = {
  ok: boolean;
  flushedCount: number;
  detail?: string;
};

/**
 * Desktop Persistence port — Event Store sẽ phụ thuộc interface này.
 * Append-only. ACK = metadata only.
 */
export interface IEventPersistence {
  append(event: TradeEvent): Promise<PersistenceAppendResult>;
  appendBatch(events: readonly TradeEvent[]): Promise<PersistenceAppendResult[]>;
  read(eventId: string): Promise<StoredTradeEvent | null>;
  readAggregate(aggregateId: string): Promise<StoredTradeEvent[]>;
  readAll(): Promise<StoredTradeEvent[]>;
  ack(eventId: string, input?: Omit<PersistenceAckInput, 'eventId'>): Promise<PersistenceAckResult>;
  flush(): Promise<PersistenceFlushResult>;
  health(): Promise<PersistenceHealth>;
}

export type MemoryEventPersistenceOptions = {
  /** Khi true, append/ack bị từ chối (health READONLY). */
  readOnly?: boolean;
  nowUtc?: () => string;
};
