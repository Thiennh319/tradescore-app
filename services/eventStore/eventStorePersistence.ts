/**
 * Task 12B.2 — Persistence abstraction only.
 * Chưa SQLite / File. Không implement storage.
 */

import type { StoredTradeEvent } from './eventStoreTypes';

/**
 * Persistence port cho Event Store.
 * In-memory foundation không bắt buộc dùng port này.
 */
export interface IEventStorePersistence {
  /**
   * Append một record đã validated.
   * Append-only — không update/delete event business data.
   */
  append(record: StoredTradeEvent): Promise<void>;

  loadAll(): Promise<StoredTradeEvent[]>;

  loadByEventId(eventId: string): Promise<StoredTradeEvent | null>;

  loadByAggregateId(aggregateId: string): Promise<StoredTradeEvent[]>;

  /**
   * Chỉ cập nhật ACK metadata (status / retryCount) — không rewrite event.
   */
  updateAckMeta(
    eventId: string,
    patch: Pick<StoredTradeEvent, 'ackStatus' | 'retryCount' | 'acknowledgedAtUtc'>,
  ): Promise<void>;
}

export class EventStorePersistenceNotImplementedError extends Error {
  constructor(method: string) {
    super(`IEventStorePersistence.${method} is not implemented (Task 12B.2)`);
    this.name = 'EventStorePersistenceNotImplementedError';
  }
}

/** Stub — throw. Dùng khi chưa gắn SQLite/File. */
export const eventStorePersistenceStub: IEventStorePersistence = {
  async append() {
    throw new EventStorePersistenceNotImplementedError('append');
  },
  async loadAll() {
    throw new EventStorePersistenceNotImplementedError('loadAll');
  },
  async loadByEventId() {
    throw new EventStorePersistenceNotImplementedError('loadByEventId');
  },
  async loadByAggregateId() {
    throw new EventStorePersistenceNotImplementedError('loadByAggregateId');
  },
  async updateAckMeta() {
    throw new EventStorePersistenceNotImplementedError('updateAckMeta');
  },
};
