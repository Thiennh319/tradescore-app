/**
 * Task 12B.4 — Dual Write Coordinator.
 *
 * Trade Event
 *   → Event Store.append()   (SoT — bắt buộc thành công hoặc duplicate known)
 *   → Projector.project()
 *   → JournalViewWriter.upsert()
 *
 * Failure policy:
 * - Event Store fail (invalid) → không ghi Journal
 * - Journal fail → Event Store vẫn giữ Event
 *
 * Consistency: Project(store) vs Journal — log mismatch, không tự sửa.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { TradeEvent } from '../events';
import type { IEventStore, StoredTradeEvent } from '../eventStore';
import {
  project,
  projectFromStored,
  stableSerializeJournalEntry,
  TRADE_PROJECTION_VERSION,
} from '../projector';
import type {
  DualWriteCoordinatorOptions,
  DualWriteMismatch,
  DualWriteResult,
  JournalViewWriter,
  ProjectionDebugMetadata,
} from './dualWriteTypes';

function defaultNowUtc(): string {
  return new Date().toISOString();
}

function buildMeta(
  tradeId: string,
  rows: readonly StoredTradeEvent[],
  nowUtc: string,
): ProjectionDebugMetadata {
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  return {
    tradeId,
    projectionVersion: TRADE_PROJECTION_VERSION,
    projectedAtUtc: nowUtc,
    eventCount: rows.length,
    lastEventId: last?.event.eventId ?? null,
    lastSequence: last?.storeSequence ?? null,
  };
}

function compareProjectedToJournal(
  projected: AiTradeJournalEntry,
  journal: AiTradeJournalEntry | null,
): DualWriteMismatch | null {
  if (!journal) {
    return {
      tradeId: projected.id,
      atUtc: defaultNowUtc(),
      projectedJson: stableSerializeJournalEntry(projected),
      journalJson: 'null',
    };
  }
  const a = stableSerializeJournalEntry(projected);
  const b = stableSerializeJournalEntry(journal);
  if (a === b) return null;
  return {
    tradeId: projected.id,
    atUtc: defaultNowUtc(),
    projectedJson: a,
    journalJson: b,
  };
}

export class DualWriteCoordinator {
  private readonly metaByTrade = new Map<string, ProjectionDebugMetadata>();
  private readonly mismatches: DualWriteMismatch[] = [];

  constructor(
    private readonly eventStore: IEventStore,
    private readonly journal: JournalViewWriter,
    private readonly options: DualWriteCoordinatorOptions = {},
  ) {}

  getProjectionMeta(tradeId: string): ProjectionDebugMetadata | null {
    return this.metaByTrade.get(tradeId) ?? null;
  }

  getMismatchLog(): readonly DualWriteMismatch[] {
    return this.mismatches;
  }

  /**
   * Dual write một Trade Event.
   * Event Store trước — Journal sau.
   */
  async writeEvent(event: TradeEvent): Promise<DualWriteResult> {
    const nowUtc = this.options.nowUtc?.() ?? defaultNowUtc();
    const syncOnDuplicate = this.options.syncOnDuplicate !== false;

    const appendResult = this.eventStore.append(event);

    if (!appendResult.ok) {
      const isDup =
        appendResult.code === 'DUPLICATE_EVENT_ID' ||
        appendResult.code === 'DUPLICATE_IDEMPOTENCY';

      if (!isDup || !syncOnDuplicate) {
        return {
          status: 'EVENT_STORE_REJECTED',
          eventId: event.eventId,
          aggregateId: event.aggregateId,
          stored: null,
          journalEntry: null,
          projectionMeta: null,
          eventStoreError: {
            code: appendResult.code,
            message: appendResult.message,
          },
        };
      }

      // Duplicate: SoT đã có event — tiếp tục project + journal sync.
      return this.syncAggregate(event.aggregateId, event.eventId, nowUtc, 'DUPLICATE_APPLIED');
    }

    return this.syncAggregate(
      event.aggregateId,
      event.eventId,
      nowUtc,
      'OK',
      appendResult.stored,
    );
  }

  /**
   * Re-project aggregate từ Event Store → Journal (không append).
   * Dùng cho consistency check / replay sync.
   */
  async syncAggregate(
    aggregateId: string,
    eventId: string,
    nowUtc: string = this.options.nowUtc?.() ?? defaultNowUtc(),
    status: DualWriteResult['status'] = 'OK',
    stored: StoredTradeEvent | null = null,
  ): Promise<DualWriteResult> {
    const rows = this.eventStore.readAggregate(aggregateId);
    const projected = projectFromStored(rows);

    if (!projected) {
      return {
        status: 'PROJECT_EMPTY',
        eventId,
        aggregateId,
        stored,
        journalEntry: null,
        projectionMeta: buildMeta(aggregateId, rows, nowUtc),
      };
    }

    const meta = buildMeta(aggregateId, rows, nowUtc);
    this.metaByTrade.set(aggregateId, meta);

    try {
      await this.journal.upsert(projected);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'JOURNAL_WRITE_FAILED',
        eventId,
        aggregateId,
        stored: stored ?? this.eventStore.read(eventId),
        journalEntry: null,
        projectionMeta: meta,
        journalError: message,
      };
    }

    const fromJournal = await this.journal.getById(projected.id);
    const mismatch = compareProjectedToJournal(projected, fromJournal);
    if (mismatch) {
      mismatch.atUtc = nowUtc;
      this.mismatches.push(mismatch);
      this.options.onMismatch?.(mismatch);
    }

    // Equality check: Project(Event Store) vs Journal — must match after upsert.
    const reprojected = projectFromStored(this.eventStore.readAggregate(aggregateId));
    if (reprojected && fromJournal) {
      const m2 = compareProjectedToJournal(reprojected, fromJournal);
      if (m2) {
        m2.atUtc = nowUtc;
        this.mismatches.push(m2);
        this.options.onMismatch?.(m2);
      }
    }

    return {
      status,
      eventId,
      aggregateId,
      stored: stored ?? this.eventStore.read(eventId),
      journalEntry: fromJournal,
      projectionMeta: meta,
      mismatch: mismatch ?? undefined,
    };
  }
}

/**
 * In-memory Journal View writer — tests + foundation (không đụng JournalService).
 */
export function createInMemoryJournalViewWriter(): JournalViewWriter & {
  all(): AiTradeJournalEntry[];
  clear(): void;
  failNextUpsert(message?: string): void;
} {
  const byId = new Map<string, AiTradeJournalEntry>();
  let failMessage: string | null = null;

  return {
    async upsert(entry) {
      if (failMessage) {
        const msg = failMessage;
        failMessage = null;
        throw new Error(msg);
      }
      byId.set(entry.id, JSON.parse(JSON.stringify(entry)) as AiTradeJournalEntry);
    },
    async getById(id) {
      const row = byId.get(id);
      return row ? (JSON.parse(JSON.stringify(row)) as AiTradeJournalEntry) : null;
    },
    all() {
      return [...byId.values()].map(
        (e) => JSON.parse(JSON.stringify(e)) as AiTradeJournalEntry,
      );
    },
    clear() {
      byId.clear();
    },
    failNextUpsert(message = 'journal write failed') {
      failMessage = message;
    },
  };
}
