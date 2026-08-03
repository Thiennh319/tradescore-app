/**
 * Task 12B.2 — Event Store Foundation public API.
 * Không Projector / Journal / UI / DB implementation.
 */

export {
  InMemoryEventStore,
  createEventStore,
} from './eventStore';

export {
  createEmptyEventStoreIndexes,
  indexStoredEvent,
  resolveBySequences,
  type EventStoreIndexes,
} from './eventStoreIndex';

export {
  eventStorePersistenceStub,
  EventStorePersistenceNotImplementedError,
  type IEventStorePersistence,
} from './eventStorePersistence';

export {
  eventStoreSnapshotStub,
  EventStoreSnapshotNotImplementedError,
  type EventStoreSnapshot,
  type IEventStoreSnapshotPort,
} from './eventStoreSnapshot';

export {
  buildIdempotencyIndexKey,
  type EventAckStatus,
  type EventIdempotencyTuple,
  type EventStoreAckResult,
  type EventStoreAppendErrorCode,
  type EventStoreAppendResult,
  type IEventStore,
  type StoredTradeEvent,
} from './eventStoreTypes';
