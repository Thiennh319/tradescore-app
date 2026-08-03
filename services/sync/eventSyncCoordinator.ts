/**
 * Phase 13.2 — Event Sync Coordinator (APK Client → Desktop).
 *
 * APK Queue → Transport → Desktop Persistence → ACK → Remove Queue
 *
 * Rules #38–#45. Không Business Logic / Engine / Journal.
 */

import type { TradeEvent } from '../events';
import { isFullBatchAcked } from './eventSyncAck';
import {
  createEventSyncQueue,
  type EventSyncQueue,
  type SyncQueueSnapshot,
} from './eventSyncQueue';
import { computeNextRetryAtUtc } from './eventSyncRetry';
import type {
  EnqueueResult,
  IEventSyncTransport,
  SyncCoordinatorHealth,
  SyncTickResult,
} from './eventSyncTypes';

export type EventSyncCoordinatorOptions = {
  transport: IEventSyncTransport;
  queue?: EventSyncQueue;
  batchSize?: number;
  nowUtc?: () => string;
};

export class EventSyncCoordinator {
  readonly queue: EventSyncQueue;
  private readonly transport: IEventSyncTransport;
  private readonly batchSize: number;
  private readonly nowUtc: () => string;
  private lastError: string | null = null;
  private syncing = false;

  constructor(options: EventSyncCoordinatorOptions) {
    this.transport = options.transport;
    this.queue = options.queue ?? createEventSyncQueue({ nowUtc: options.nowUtc });
    this.batchSize = options.batchSize ?? 32;
    this.nowUtc = options.nowUtc ?? (() => new Date().toISOString());
  }

  /** APK đẩy Trade Event vào Queue tạm (Rule #39). */
  enqueue(event: TradeEvent): EnqueueResult {
    return this.queue.enqueue(event);
  }

  health(): SyncCoordinatorHealth {
    const now = this.nowUtc();
    if (this.transport.isOffline()) {
      return {
        status: 'OFFLINE',
        checkedAtUtc: now,
        queueDepth: this.queue.size(),
        detail: 'Desktop offline — queuing',
      };
    }
    if (this.syncing) {
      return {
        status: 'SYNCING',
        checkedAtUtc: now,
        queueDepth: this.queue.size(),
      };
    }
    if (this.lastError) {
      return {
        status: 'ERROR',
        checkedAtUtc: now,
        queueDepth: this.queue.size(),
        detail: this.lastError,
      };
    }
    return {
      status: 'READY',
      checkedAtUtc: now,
      queueDepth: this.queue.size(),
    };
  }

  /**
   * Một vòng sync: lấy batch theo eventSequence → send → ACK → xóa queue.
   * Atomic: không xóa nếu batch fail / ACK thiếu.
   */
  async tick(): Promise<SyncTickResult> {
    const now = this.nowUtc();
    const ready = this.queue.peekReady(this.batchSize, now);

    if (ready.length === 0) {
      this.lastError = null;
      return {
        attempted: 0,
        acked: 0,
        failed: false,
        health: this.health(),
        detail: 'empty',
      };
    }

    if (this.transport.isOffline()) {
      return {
        attempted: 0,
        acked: 0,
        failed: true,
        health: this.health(),
        detail: 'offline',
      };
    }

    this.syncing = true;
    const ids = ready.map((i) => i.eventId);
    this.queue.markSending(ids);

    try {
      // Preserve queue order — ready already by eventSequence
      const events = ready.map((i) => i.event);
      const result = await this.transport.sendBatch(events);

      if (!result.ok || !isFullBatchAcked(result, ids)) {
        const nextRetry = computeNextRetryAtUtc(
          ready[0]?.retryCount ?? 0,
          now,
        );
        this.queue.markRetry(ids, nextRetry, now);
        this.lastError = result.ok
          ? 'Incomplete ACK set'
          : `${result.code}: ${result.message}`;
        return {
          attempted: ready.length,
          acked: 0,
          failed: true,
          health: this.health(),
          detail: this.lastError,
        };
      }

      const removed = this.queue.removeAcked(ids);
      this.lastError = null;
      return {
        attempted: ready.length,
        acked: removed,
        failed: false,
        health: this.health(),
        detail: 'acked',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextRetry = computeNextRetryAtUtc(ready[0]?.retryCount ?? 0, now);
      this.queue.markRetry(ids, nextRetry, now);
      this.lastError = message;
      return {
        attempted: ready.length,
        acked: 0,
        failed: true,
        health: this.health(),
        detail: message,
      };
    } finally {
      this.syncing = false;
    }
  }

  /** Drain queue until empty hoặc offline/fail. */
  async syncUntilIdle(maxTicks = 100): Promise<SyncTickResult[]> {
    const results: SyncTickResult[] = [];
    for (let i = 0; i < maxTicks; i++) {
      const r = await this.tick();
      results.push(r);
      if (r.attempted === 0 && !r.failed) break;
      if (r.failed && this.transport.isOffline()) break;
      if (r.failed) break;
      if (this.queue.size() === 0) break;
    }
    return results;
  }

  /** Restart / Recovery — persist queue snapshot. */
  exportQueue(): SyncQueueSnapshot {
    return this.queue.exportSnapshot();
  }

  importQueue(snapshot: SyncQueueSnapshot): void {
    this.queue.importSnapshot(snapshot);
  }
}

export function createEventSyncCoordinator(
  options: EventSyncCoordinatorOptions,
): EventSyncCoordinator {
  return new EventSyncCoordinator(options);
}
