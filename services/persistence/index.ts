/**
 * Phase 13.1 — Desktop Event Persistence public API.
 */

export {
  MemoryEventPersistence,
  createMemoryEventPersistence,
} from './eventPersistence';

export {
  FileEventPersistence,
  FileEventPersistenceNotImplementedError,
  createFileEventPersistenceStub,
} from './fileEventPersistence';

export {
  SqliteEventPersistence,
  SqliteEventPersistenceNotImplementedError,
  createSqliteEventPersistenceStub,
} from './sqliteEventPersistence';

export type {
  IEventPersistence,
  MemoryEventPersistenceOptions,
  PersistenceAckInput,
  PersistenceAckResult,
  PersistenceAppendResult,
  PersistenceBackendKind,
  PersistenceFlushResult,
  PersistenceHealth,
  PersistenceHealthStatus,
} from './eventPersistenceTypes';
