/**
 * Task 12B.4 — Dual Write types.
 * Transition: Event Store (SoT) + Journal View (UI primary).
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { TradeEvent } from '../events';
import type { EventStoreAppendErrorCode, StoredTradeEvent } from '../eventStore';
import type { TradeProjectionVersion } from '../projector';

/** Debug metadata — không ghi vào Journal schema. */
export type ProjectionDebugMetadata = {
  tradeId: string;
  projectionVersion: TradeProjectionVersion;
  projectedAtUtc: string;
  eventCount: number;
  lastEventId: string | null;
  lastSequence: number | null;
};

export type DualWriteMismatch = {
  tradeId: string;
  atUtc: string;
  projectedJson: string;
  journalJson: string;
};

/**
 * Adapter ghi View Journal — không đổi JournalService / schema.
 * Production có thể bọc useTradeStore; tests dùng in-memory.
 */
export type JournalViewWriter = {
  upsert(entry: AiTradeJournalEntry): Promise<void>;
  getById(id: string): Promise<AiTradeJournalEntry | null>;
};

export type DualWriteStatus =
  | 'OK'
  | 'EVENT_STORE_REJECTED'
  | 'JOURNAL_WRITE_FAILED'
  | 'PROJECT_EMPTY'
  | 'DUPLICATE_APPLIED';

export type DualWriteResult = {
  status: DualWriteStatus;
  eventId: string;
  aggregateId: string;
  stored: StoredTradeEvent | null;
  journalEntry: AiTradeJournalEntry | null;
  projectionMeta: ProjectionDebugMetadata | null;
  eventStoreError?: {
    code: EventStoreAppendErrorCode | 'UNKNOWN';
    message: string;
  };
  journalError?: string;
  mismatch?: DualWriteMismatch;
};

export type DualWriteCoordinatorOptions = {
  /** Log mismatch — không tự sửa. */
  onMismatch?: (mismatch: DualWriteMismatch) => void;
  /** Clock for projectedAtUtc (tests). */
  nowUtc?: () => string;
  /**
   * Khi append bị duplicate idempotency/eventId:
   * vẫn project + sync Journal (default true).
   */
  syncOnDuplicate?: boolean;
};

export type PublishTradeEventInput = {
  event: TradeEvent;
};
