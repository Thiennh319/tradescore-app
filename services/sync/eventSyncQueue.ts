/**
 * Phase 13.2 — APK Local Sync Queue.
 * Rule #39: chỉ Queue tạm · #42 immutable event · #43 preserve order.
 */

import type { TradeEvent } from '../events';
import type { EnqueueResult, SyncQueueItem, SyncQueueItemStatus } from './eventSyncTypes';

function freezeEvent(event: TradeEvent): TradeEvent {
  return Object.freeze(structuredClone(event)) as TradeEvent;
}

function cloneItem(item: SyncQueueItem): SyncQueueItem {
  return {
    ...item,
    event: freezeEvent(item.event),
  };
}

/** Serializable snapshot for Restart / Recovery (memory persist). */
export type SyncQueueSnapshot = {
  nextSequence: number;
  items: SyncQueueItem[];
};

export type EventSyncQueueOptions = {
  nowUtc?: () => string;
};

export class EventSyncQueue {
  private items: SyncQueueItem[] = [];
  private nextSequence = 1;
  private readonly nowUtc: () => string;

  constructor(options: EventSyncQueueOptions = {}) {
    this.nowUtc = options.nowUtc ?? (() => new Date().toISOString());
  }

  size(): number {
    return this.items.length;
  }

  /**
   * Enqueue — giữ nguyên thứ tự eventSequence.
   * Không sửa event sau khi vào queue (Rule #42).
   */
  enqueue(event: TradeEvent): EnqueueResult {
    if (this.items.some((i) => i.eventId === event.eventId)) {
      return {
        ok: false,
        code: 'DUPLICATE_EVENT_ID',
        message: `Queue already has eventId: ${event.eventId}`,
      };
    }

    const item: SyncQueueItem = {
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      eventSequence: this.nextSequence,
      createdAt: this.nowUtc(),
      retryCount: 0,
      lastRetryAt: null,
      status: 'PENDING',
      event: freezeEvent(event),
      nextRetryAtUtc: null,
    };
    this.nextSequence += 1;
    this.items.push(item);
    return { ok: true, item: cloneItem(item) };
  }

  /** Items sẵn sàng gửi — đúng thứ tự eventSequence (không sort timestamp). */
  peekReady(limit: number, nowUtc: string): SyncQueueItem[] {
    const ready: SyncQueueItem[] = [];
    const ordered = [...this.items].sort((a, b) => a.eventSequence - b.eventSequence);

    for (const item of ordered) {
      if (ready.length >= limit) break;
      if (item.status === 'SENDING' || item.status === 'ACKED') continue;
      if (item.status === 'FAILED') continue;
      if (item.status === 'PENDING') {
        ready.push(cloneItem(item));
        continue;
      }
      if (item.status === 'RETRYING') {
        if (item.nextRetryAtUtc == null || item.nextRetryAtUtc <= nowUtc) {
          ready.push(cloneItem(item));
        }
      }
    }
    return ready;
  }

  markStatus(eventId: string, status: SyncQueueItemStatus): void {
    const item = this.items.find((i) => i.eventId === eventId);
    if (!item) return;
    item.status = status;
  }

  markSending(eventIds: readonly string[]): void {
    for (const id of eventIds) {
      this.markStatus(id, 'SENDING');
    }
  }

  /**
   * Rule #40 — chỉ xóa khi ACK.
   */
  removeAcked(eventIds: readonly string[]): number {
    const set = new Set(eventIds);
    const before = this.items.length;
    for (const id of set) {
      const item = this.items.find((i) => i.eventId === id);
      if (item) item.status = 'ACKED';
    }
    this.items = this.items.filter((i) => !set.has(i.eventId));
    return before - this.items.length;
  }

  markRetry(
    eventIds: readonly string[],
    nextRetryAtUtc: string,
    lastRetryAt: string,
  ): void {
    const set = new Set(eventIds);
    for (const item of this.items) {
      if (!set.has(item.eventId)) continue;
      item.status = 'RETRYING';
      item.retryCount += 1;
      item.lastRetryAt = lastRetryAt;
      item.nextRetryAtUtc = nextRetryAtUtc;
    }
  }

  markFailed(eventIds: readonly string[]): void {
    for (const id of eventIds) {
      this.markStatus(id, 'FAILED');
    }
  }

  /** Trả về items theo eventSequence tăng dần. */
  list(): SyncQueueItem[] {
    return [...this.items]
      .sort((a, b) => a.eventSequence - b.eventSequence)
      .map(cloneItem);
  }

  /** Persist snapshot (Restart recovery). */
  exportSnapshot(): SyncQueueSnapshot {
    return {
      nextSequence: this.nextSequence,
      items: this.list(),
    };
  }

  importSnapshot(snapshot: SyncQueueSnapshot): void {
    this.nextSequence = snapshot.nextSequence;
    this.items = snapshot.items.map((i) => ({
      ...i,
      event: freezeEvent(i.event),
      status: i.status === 'SENDING' ? 'RETRYING' : i.status,
    }));
  }

  clear(): void {
    this.items = [];
  }
}

export function createEventSyncQueue(options?: EventSyncQueueOptions): EventSyncQueue {
  return new EventSyncQueue(options);
}
