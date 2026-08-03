/**
 * Phase 13.2 — APK → Desktop Event Sync public API.
 */

export {
  EventSyncCoordinator,
  createEventSyncCoordinator,
  type EventSyncCoordinatorOptions,
} from './eventSyncCoordinator';

export {
  EventSyncQueue,
  createEventSyncQueue,
  type EventSyncQueueOptions,
  type SyncQueueSnapshot,
} from './eventSyncQueue';

export {
  GrpcEventSyncTransportStub,
  HttpEventSyncTransportStub,
  MemoryEventSyncTransport,
  WebSocketEventSyncTransportStub,
  createMemoryEventSyncTransport,
  type MemoryEventSyncTransportOptions,
} from './eventSyncTransport';

export {
  ackedEventIdSet,
  createSyncAck,
  isFullBatchAcked,
} from './eventSyncAck';

export {
  computeNextRetryAtUtc,
  isRetryDue,
  nextBackoffSeconds,
} from './eventSyncRetry';

export {
  DEFAULT_SYNC_BACKOFF_SECONDS,
  RULE_38_APK_NO_JOURNAL,
  RULE_39_APK_QUEUE_ONLY,
  RULE_40_ACK_CLEARS_QUEUE,
  RULE_41_RETRY_SAME_EVENT,
  RULE_42_QUEUE_IMMUTABLE,
  RULE_43_PRESERVE_ORDER,
  RULE_44_NO_BUSINESS_LOGIC,
  RULE_45_TRANSPORT_INTERFACE,
  type EnqueueResult,
  type IEventSyncTransport,
  type SyncAck,
  type SyncBatchFailure,
  type SyncBatchResult,
  type SyncBatchSuccess,
  type SyncCoordinatorHealth,
  type SyncCoordinatorHealthStatus,
  type SyncQueueItem,
  type SyncQueueItemStatus,
  type SyncTickResult,
  type SyncTransportKind,
} from './eventSyncTypes';
