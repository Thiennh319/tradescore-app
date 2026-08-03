/**
 * Task 12B.5 — Flip Source of Truth.
 *
 * Trade → Event Store → Projector → Journal View (cache + optional writer)
 *
 * Journal KHÔNG còn đường ghi trực tiếp.
 * Journal chỉ đọc Projection (ProjectionReader).
 *
 * RULE #29 — Projector chỉ map/reduce/aggregate/materialize.
 * Không Decision / Confidence / Planner / Adviser / Trigger / Engine.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { TradeEvent } from '../events';
import type { IEventStore } from '../eventStore';
import {
  projectFromStored,
  stableSerializeJournalEntry,
  TRADE_PROJECTION_VERSION,
} from '../projector';
import type { DualWriteResult, JournalViewWriter } from './dualWriteTypes';
import {
  createProjectionCache,
  type IProjectionCache,
} from './projectionCache';
import {
  createProjectionReader,
  type ProjectionReader,
} from './projectionReader';

/** Architecture rule id — Projector translate-only. */
export const RULE_29_PROJECTOR_TRANSLATE_ONLY = 29 as const;

export type FlipSourceOfTruthOptions = {
  nowUtc?: () => string;
  /**
   * Optional mirror JournalViewWriter (tests / persistence adapter).
   * Mọi ghi vẫn đi từ Projection — không accept entry tự build.
   */
  journalView?: JournalViewWriter;
  cache?: IProjectionCache;
};

export type FlipWriteResult = DualWriteResult & {
  /** Flipped mode: always event-first. */
  flipped: true;
  cacheHitAfterWrite: boolean;
};

export type FlipRecoveryResult = {
  rebuiltCount: number;
  tradeIds: string[];
  /** Journal View (mirror) sync count nếu có writer. */
  journalSynced: number;
};

/**
 * Từ chối ghi Journal trực tiếp (đường cũ đã flip).
 */
export class DirectJournalWriteForbiddenError extends Error {
  readonly code = 'DIRECT_JOURNAL_WRITE_FORBIDDEN';

  constructor(message = 'Direct Journal write is forbidden after Flip (Rule Event-Store-SoT)') {
    super(message);
    this.name = 'DirectJournalWriteForbiddenError';
  }
}

/**
 * Facade sau Flip: event-only writes · projection-only reads.
 */
export class FlippedTradingIntelligence {
  readonly eventStore: IEventStore;
  readonly cache: IProjectionCache;
  readonly reader: ProjectionReader;
  private readonly journalView: JournalViewWriter | null;
  private readonly nowUtc: () => string;

  constructor(eventStore: IEventStore, options: FlipSourceOfTruthOptions = {}) {
    this.eventStore = eventStore;
    this.cache = options.cache ?? createProjectionCache();
    this.reader = createProjectionReader(eventStore, this.cache);
    this.journalView = options.journalView ?? null;
    this.nowUtc = options.nowUtc ?? (() => new Date().toISOString());
  }

  /**
   * Đường ghi duy nhất: append Event → project → update cache (+ optional journal mirror).
   */
  async commitEvent(event: TradeEvent): Promise<FlipWriteResult> {
    const append = this.eventStore.append(event);

    if (!append.ok) {
      const isDup =
        append.code === 'DUPLICATE_EVENT_ID' ||
        append.code === 'DUPLICATE_IDEMPOTENCY';

      if (!isDup) {
        return {
          status: 'EVENT_STORE_REJECTED',
          eventId: event.eventId,
          aggregateId: event.aggregateId,
          stored: null,
          journalEntry: null,
          projectionMeta: null,
          eventStoreError: { code: append.code, message: append.message },
          flipped: true,
          cacheHitAfterWrite: false,
        };
      }
      // duplicate → still refresh projection from SoT
    }

    return this.refreshAggregate(
      event.aggregateId,
      event.eventId,
      append.ok ? append.stored : this.eventStore.read(event.eventId),
      append.ok ? 'OK' : 'DUPLICATE_APPLIED',
    );
  }

  /**
   * Cấm đường Trade → Journal trực tiếp.
   */
  forbidDirectJournalWrite(_entry: AiTradeJournalEntry): never {
    throw new DirectJournalWriteForbiddenError();
  }

  /**
   * Journal chỉ đọc Projection.
   */
  readJournal(tradeId: string): AiTradeJournalEntry | null {
    return this.reader.read(tradeId).entry;
  }

  readAllJournal(): AiTradeJournalEntry[] {
    return this.reader.readAllFromStore();
  }

  /**
   * Xóa cache → rebuild từ Event Store (cache miss path).
   */
  rebuildCache(): number {
    this.cache.clear();
    const all = this.reader.readAllFromStore();
    for (const entry of all) {
      this.cache.set(entry);
    }
    return all.length;
  }

  /**
   * Recovery: Journal View mất → Replay Event Store → Projector → View/Cache.
   */
  async recoverJournalView(): Promise<FlipRecoveryResult> {
    this.cache.clear();
    if (this.journalView && 'clear' in this.journalView) {
      const clearable = this.journalView as JournalViewWriter & { clear?: () => void };
      clearable.clear?.();
    }

    const all = this.reader.readAllFromStore();
    let journalSynced = 0;
    for (const entry of all) {
      this.cache.set(entry);
      if (this.journalView) {
        await this.journalView.upsert(entry);
        journalSynced += 1;
      }
    }

    return {
      rebuiltCount: all.length,
      tradeIds: all.map((e) => e.id),
      journalSynced,
    };
  }

  /**
   * Restart simulation: clear cache (memory), Event Store giữ nguyên → rebuild.
   */
  simulateRestart(): number {
    return this.rebuildCache();
  }

  /**
   * Consistency: Journal/cache view === Project(Event Store).
   */
  assertEquality(tradeId: string): boolean {
    const projected = projectFromStored(this.eventStore.readAggregate(tradeId));
    const view = this.reader.read(tradeId).entry;
    if (!projected && !view) return true;
    if (!projected || !view) return false;
    return (
      stableSerializeJournalEntry(projected) === stableSerializeJournalEntry(view)
    );
  }

  private async refreshAggregate(
    aggregateId: string,
    eventId: string,
    stored: FlipWriteResult['stored'],
    status: FlipWriteResult['status'],
  ): Promise<FlipWriteResult> {
    const rows = this.eventStore.readAggregate(aggregateId);
    const projected = projectFromStored(rows);
    const nowUtc = this.nowUtc();

    if (!projected) {
      return {
        status: 'PROJECT_EMPTY',
        eventId,
        aggregateId,
        stored,
        journalEntry: null,
          projectionMeta: {
          tradeId: aggregateId,
          projectionVersion: TRADE_PROJECTION_VERSION,
          projectedAtUtc: nowUtc,
          eventCount: rows.length,
          lastEventId: rows[rows.length - 1]?.event.eventId ?? null,
          lastSequence: rows[rows.length - 1]?.storeSequence ?? null,
        },
        flipped: true,
        cacheHitAfterWrite: false,
      };
    }

    this.cache.set(projected);

    let journalEntry: AiTradeJournalEntry | null = projected;
    let journalError: string | undefined;

    if (this.journalView) {
      try {
        await this.journalView.upsert(projected);
        journalEntry = await this.journalView.getById(projected.id);
      } catch (err) {
        journalError = err instanceof Error ? err.message : String(err);
        return {
          status: 'JOURNAL_WRITE_FAILED',
          eventId,
          aggregateId,
          stored,
          journalEntry: null,
          projectionMeta: {
            tradeId: aggregateId,
            projectionVersion: TRADE_PROJECTION_VERSION,
            projectedAtUtc: nowUtc,
            eventCount: rows.length,
            lastEventId: rows[rows.length - 1]?.event.eventId ?? null,
            lastSequence: rows[rows.length - 1]?.storeSequence ?? null,
          },
          journalError,
          flipped: true,
          cacheHitAfterWrite: this.cache.has(aggregateId),
        };
      }
    }

    const last = rows[rows.length - 1];
    return {
      status,
      eventId,
      aggregateId,
      stored,
      journalEntry,
      projectionMeta: {
        tradeId: aggregateId,
        projectionVersion: TRADE_PROJECTION_VERSION,
        projectedAtUtc: nowUtc,
        eventCount: rows.length,
        lastEventId: last?.event.eventId ?? null,
        lastSequence: last?.storeSequence ?? null,
      },
      journalError,
      flipped: true,
      cacheHitAfterWrite: this.cache.has(aggregateId),
    };
  }
}

export function createFlippedTradingIntelligence(
  eventStore: IEventStore,
  options?: FlipSourceOfTruthOptions,
): FlippedTradingIntelligence {
  return new FlippedTradingIntelligence(eventStore, options);
}
