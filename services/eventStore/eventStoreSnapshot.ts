/**
 * Task 12B.2 — Snapshot stub only.
 * Không implement. Chuẩn bị Task sau.
 */

import type { StoredTradeEvent } from './eventStoreTypes';

/** Snapshot of aggregate projection state — STUB. */
export type EventStoreSnapshot = {
  aggregateId: string;
  /** Last included storeSequence. */
  lastStoreSequence: number;
  takenAtUtc: string;
  /** Opaque blob — projector quyết định sau. */
  state: unknown;
};

/**
 * Snapshot port — chưa implement persistence / capture.
 */
export interface IEventStoreSnapshotPort {
  /**
   * @throws luôn ở foundation — chưa implement.
   */
  saveSnapshot(_snapshot: EventStoreSnapshot): Promise<void>;

  /**
   * @throws luôn ở foundation — chưa implement.
   */
  loadSnapshot(_aggregateId: string): Promise<EventStoreSnapshot | null>;

  /**
   * @throws luôn ở foundation — chưa implement.
   */
  buildSnapshotFromEvents(
    _aggregateId: string,
    _events: readonly StoredTradeEvent[],
  ): EventStoreSnapshot;
}

export class EventStoreSnapshotNotImplementedError extends Error {
  constructor(method: string) {
    super(`EventStoreSnapshot.${method} is not implemented (Task 12B.2 stub)`);
    this.name = 'EventStoreSnapshotNotImplementedError';
  }
}

/** Stub implementation — mọi method throw. */
export const eventStoreSnapshotStub: IEventStoreSnapshotPort = {
  async saveSnapshot() {
    throw new EventStoreSnapshotNotImplementedError('saveSnapshot');
  },
  async loadSnapshot() {
    throw new EventStoreSnapshotNotImplementedError('loadSnapshot');
  },
  buildSnapshotFromEvents() {
    throw new EventStoreSnapshotNotImplementedError('buildSnapshotFromEvents');
  },
};
