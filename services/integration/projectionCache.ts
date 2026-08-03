/**
 * Task 12B.5 — Projection Cache (memory only).
 * Không phải Source of Truth — mất vẫn rebuild từ Event Store.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';

export type ProjectionCacheStats = {
  size: number;
  hits: number;
  misses: number;
};

export interface IProjectionCache {
  get(tradeId: string): AiTradeJournalEntry | null;
  set(entry: AiTradeJournalEntry): void;
  delete(tradeId: string): void;
  clear(): void;
  has(tradeId: string): boolean;
  values(): AiTradeJournalEntry[];
  stats(): ProjectionCacheStats;
}

export class MemoryProjectionCache implements IProjectionCache {
  private readonly map = new Map<string, AiTradeJournalEntry>();
  private hits = 0;
  private misses = 0;

  get(tradeId: string): AiTradeJournalEntry | null {
    const row = this.map.get(tradeId);
    if (!row) {
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return cloneEntry(row);
  }

  set(entry: AiTradeJournalEntry): void {
    this.map.set(entry.id, cloneEntry(entry));
  }

  delete(tradeId: string): void {
    this.map.delete(tradeId);
  }

  clear(): void {
    this.map.clear();
  }

  has(tradeId: string): boolean {
    return this.map.has(tradeId);
  }

  values(): AiTradeJournalEntry[] {
    return [...this.map.values()].map(cloneEntry);
  }

  stats(): ProjectionCacheStats {
    return {
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

export function createProjectionCache(): IProjectionCache {
  return new MemoryProjectionCache();
}

function cloneEntry(entry: AiTradeJournalEntry): AiTradeJournalEntry {
  return JSON.parse(JSON.stringify(entry)) as AiTradeJournalEntry;
}
