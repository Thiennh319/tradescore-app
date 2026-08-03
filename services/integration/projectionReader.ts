/**
 * Task 12B.5 — Projection Reader.
 * Journal View chỉ ĐỌC Projection (cache hoặc project từ Event Store).
 * Không tự build dữ liệu nghiệp vụ · không gọi Engine.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { IEventStore } from '../eventStore';
import { projectFromStored, stableSerializeJournalEntry } from '../projector';
import type { IProjectionCache } from './projectionCache';

export type ProjectionReadSource = 'cache' | 'event_store' | 'miss';

export type ProjectionReadResult = {
  entry: AiTradeJournalEntry | null;
  source: ProjectionReadSource;
};

export type ProjectionReaderOptions = {
  /**
   * Khi đọc miss cache → project từ store và seed lại cache (default true).
   */
  populateCacheOnMiss?: boolean;
};

/**
 * Đọc Trading Intelligence View từ Projection.
 * Source of Truth vẫn là Event Store.
 */
export class ProjectionReader {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly cache: IProjectionCache,
    private readonly options: ProjectionReaderOptions = {},
  ) {}

  /**
   * Đọc một trade — ưu tiên cache, fallback Event Store project.
   */
  read(tradeId: string): ProjectionReadResult {
    const cached = this.cache.get(tradeId);
    if (cached) {
      return { entry: cached, source: 'cache' };
    }

    const projected = projectFromStored(this.eventStore.readAggregate(tradeId));
    if (!projected) {
      return { entry: null, source: 'miss' };
    }

    if (this.options.populateCacheOnMiss !== false) {
      this.cache.set(projected);
    }

    return { entry: projected, source: 'event_store' };
  }

  /**
   * Toàn bộ View hiện có — rebuild unique aggregates từ Event Store.
   * Dùng cho list / recovery verify (không phụ thuộc cache).
   */
  readAllFromStore(): AiTradeJournalEntry[] {
    const all = this.eventStore.readAll();
    const byAgg = new Map<string, typeof all>();
    for (const row of all) {
      if (row.event.aggregateType !== 'TRADE') continue;
      const list = byAgg.get(row.event.aggregateId) ?? [];
      list.push(row);
      byAgg.set(row.event.aggregateId, list);
    }

    const entries: AiTradeJournalEntry[] = [];
    for (const [, rows] of byAgg) {
      const entry = projectFromStored(rows);
      if (entry) entries.push(entry);
    }
    entries.sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
    return entries;
  }

  /**
   * So sánh cache entry với Project(Event Store).
   */
  equalsStore(tradeId: string): boolean {
    const fromStore = projectFromStored(this.eventStore.readAggregate(tradeId));
    const fromCache = this.cache.get(tradeId);
    if (!fromStore && !fromCache) return true;
    if (!fromStore || !fromCache) return false;
    return (
      stableSerializeJournalEntry(fromStore) ===
      stableSerializeJournalEntry(fromCache)
    );
  }
}

export function createProjectionReader(
  eventStore: IEventStore,
  cache: IProjectionCache,
  options?: ProjectionReaderOptions,
): ProjectionReader {
  return new ProjectionReader(eventStore, cache, options);
}
