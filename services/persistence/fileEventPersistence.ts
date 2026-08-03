/**
 * Phase 13.1 — File Event Persistence (stub only).
 * Chưa implement file/jsonl thật — sẵn sàng Phase sau.
 */

import type { TradeEvent } from '../events';
import type {
  IEventPersistence,
  PersistenceAckResult,
  PersistenceAppendResult,
  PersistenceFlushResult,
  PersistenceHealth,
} from './eventPersistenceTypes';

export class FileEventPersistenceNotImplementedError extends Error {
  constructor(method: string) {
    super(`FileEventPersistence.${method} is not implemented (Phase 13.1 stub)`);
    this.name = 'FileEventPersistenceNotImplementedError';
  }
}

/**
 * Stub — Desktop/Web file backend (future).
 */
export class FileEventPersistence implements IEventPersistence {
  async append(_event: TradeEvent): Promise<PersistenceAppendResult> {
    throw new FileEventPersistenceNotImplementedError('append');
  }

  async appendBatch(_events: readonly TradeEvent[]): Promise<PersistenceAppendResult[]> {
    throw new FileEventPersistenceNotImplementedError('appendBatch');
  }

  async read(_eventId: string) {
    throw new FileEventPersistenceNotImplementedError('read');
  }

  async readAggregate(_aggregateId: string) {
    throw new FileEventPersistenceNotImplementedError('readAggregate');
  }

  async readAll() {
    throw new FileEventPersistenceNotImplementedError('readAll');
  }

  async ack(_eventId: string): Promise<PersistenceAckResult> {
    throw new FileEventPersistenceNotImplementedError('ack');
  }

  async flush(): Promise<PersistenceFlushResult> {
    throw new FileEventPersistenceNotImplementedError('flush');
  }

  async health(): Promise<PersistenceHealth> {
    return {
      status: 'ERROR',
      backend: 'FILE',
      checkedAtUtc: new Date().toISOString(),
      detail: 'File backend not implemented (stub)',
    };
  }
}

export function createFileEventPersistenceStub(): IEventPersistence {
  return new FileEventPersistence();
}
