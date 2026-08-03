/**
 * Phase 13.1 — SQLite Event Persistence (stub only).
 * Chưa implement SQLite thật — sẵn sàng Phase sau.
 */

import type { TradeEvent } from '../events';
import type {
  IEventPersistence,
  PersistenceAckResult,
  PersistenceAppendResult,
  PersistenceFlushResult,
  PersistenceHealth,
} from './eventPersistenceTypes';

export class SqliteEventPersistenceNotImplementedError extends Error {
  constructor(method: string) {
    super(`SqliteEventPersistence.${method} is not implemented (Phase 13.1 stub)`);
    this.name = 'SqliteEventPersistenceNotImplementedError';
  }
}

/**
 * Stub — Desktop SQLite backend (future).
 */
export class SqliteEventPersistence implements IEventPersistence {
  async append(_event: TradeEvent): Promise<PersistenceAppendResult> {
    throw new SqliteEventPersistenceNotImplementedError('append');
  }

  async appendBatch(_events: readonly TradeEvent[]): Promise<PersistenceAppendResult[]> {
    throw new SqliteEventPersistenceNotImplementedError('appendBatch');
  }

  async read(_eventId: string) {
    throw new SqliteEventPersistenceNotImplementedError('read');
  }

  async readAggregate(_aggregateId: string) {
    throw new SqliteEventPersistenceNotImplementedError('readAggregate');
  }

  async readAll() {
    throw new SqliteEventPersistenceNotImplementedError('readAll');
  }

  async ack(_eventId: string): Promise<PersistenceAckResult> {
    throw new SqliteEventPersistenceNotImplementedError('ack');
  }

  async flush(): Promise<PersistenceFlushResult> {
    throw new SqliteEventPersistenceNotImplementedError('flush');
  }

  async health(): Promise<PersistenceHealth> {
    return {
      status: 'ERROR',
      backend: 'SQLITE',
      checkedAtUtc: new Date().toISOString(),
      detail: 'SQLite backend not implemented (stub)',
    };
  }
}

export function createSqliteEventPersistenceStub(): IEventPersistence {
  return new SqliteEventPersistence();
}
