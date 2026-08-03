/**
 * Phase 13.2 — APK → Desktop Event Sync types.
 * Sync Layer only — Rule #44: không Business Logic.
 */

import type { TradeEvent } from '../events';

/** Rule ids (Architecture). */
export const RULE_38_APK_NO_JOURNAL = 38 as const;
export const RULE_39_APK_QUEUE_ONLY = 39 as const;
export const RULE_40_ACK_CLEARS_QUEUE = 40 as const;
export const RULE_41_RETRY_SAME_EVENT = 41 as const;
export const RULE_42_QUEUE_IMMUTABLE = 42 as const;
export const RULE_43_PRESERVE_ORDER = 43 as const;
export const RULE_44_NO_BUSINESS_LOGIC = 44 as const;
export const RULE_45_TRANSPORT_INTERFACE = 45 as const;

export type SyncQueueItemStatus =
  | 'PENDING'
  | 'SENDING'
  | 'ACKED'
  | 'FAILED'
  | 'RETRYING';

export type SyncCoordinatorHealthStatus =
  | 'READY'
  | 'OFFLINE'
  | 'SYNCING'
  | 'ERROR';

export type SyncCoordinatorHealth = {
  status: SyncCoordinatorHealthStatus;
  detail?: string;
  checkedAtUtc: string;
  queueDepth: number;
};

/** Queue row — Event immutable (Rule #42). */
export type SyncQueueItem = {
  eventId: string;
  aggregateId: string;
  /** Monotonic enqueue order — Rule #43. */
  eventSequence: number;
  createdAt: string;
  retryCount: number;
  lastRetryAt: string | null;
  status: SyncQueueItemStatus;
  /** Frozen Trade Event — retry gửi lại object này (Rule #41). */
  event: TradeEvent;
  nextRetryAtUtc: string | null;
};

export type SyncAck = {
  eventId: string;
  ok: true;
  duplicate?: boolean;
  acknowledgedAtUtc: string;
};

export type SyncBatchSuccess = {
  ok: true;
  acks: SyncAck[];
};

export type SyncBatchFailure = {
  ok: false;
  code: 'OFFLINE' | 'ATOMIC_FAIL' | 'TRANSPORT_ERROR' | 'EMPTY';
  message: string;
};

export type SyncBatchResult = SyncBatchSuccess | SyncBatchFailure;

export type SyncTransportKind = 'MEMORY' | 'HTTP' | 'WEBSOCKET' | 'GRPC';

/**
 * Rule #45 — Transport Interface.
 * Không phụ thuộc protocol cụ thể.
 */
export interface IEventSyncTransport {
  readonly kind: SyncTransportKind;
  /** true = Desktop không reachable. */
  isOffline(): boolean;
  setOffline?(offline: boolean): void;
  /**
   * Gửi batch theo đúng thứ tự mảng (không reorder).
   * Atomic: ALL SUCCESS (acks) hoặc ALL FAIL (không partial commit).
   */
  sendBatch(events: readonly TradeEvent[]): Promise<SyncBatchResult>;
}

export type EnqueueResult =
  | { ok: true; item: SyncQueueItem }
  | { ok: false; code: 'DUPLICATE_EVENT_ID'; message: string };

export type SyncTickResult = {
  attempted: number;
  acked: number;
  failed: boolean;
  health: SyncCoordinatorHealth;
  detail?: string;
};

/** Backoff seconds: 1,2,5,10,30,60 rồi mỗi 60s. */
export const DEFAULT_SYNC_BACKOFF_SECONDS = [1, 2, 5, 10, 30, 60] as const;
