import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { persistGetJson, persistSetJson } from './persistStorage';
import { getVietnamDateParts } from '../store/useTradeStore';

/** Cursor: last exported payload hash per entry id (re-export when content changes). */
export const JOURNAL_JSONL_CURSOR_KEY = '@tradescore/journal_jsonl_export_cursor_v1';

export type JournalJsonlCursor = {
  hashes: Record<string, string>;
};

export type JournalJsonlPendingLine = {
  id: string;
  hash: string;
  line: string;
};

export function journalEntryPayloadHash(entry: AiTradeJournalEntry): string {
  return JSON.stringify(entry);
}

export function formatJournalJsonlDateVn(now = new Date()): string {
  const p = getVietnamDateParts(now);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function collectPendingJournalJsonlLines(
  journal: readonly AiTradeJournalEntry[],
  cursor: JournalJsonlCursor | null | undefined,
): JournalJsonlPendingLine[] {
  const hashes = cursor?.hashes ?? {};
  const pending: JournalJsonlPendingLine[] = [];
  for (const entry of journal) {
    if (!entry?.id) continue;
    const hash = journalEntryPayloadHash(entry);
    if (hashes[entry.id] === hash) continue;
    pending.push({
      id: entry.id,
      hash,
      line: hash,
    });
  }
  return pending;
}

export function mergeJournalJsonlCursor(
  cursor: JournalJsonlCursor | null | undefined,
  pending: readonly JournalJsonlPendingLine[],
): JournalJsonlCursor {
  const hashes = { ...(cursor?.hashes ?? {}) };
  for (const row of pending) {
    hashes[row.id] = row.hash;
  }
  return { hashes };
}

export async function loadJournalJsonlCursor(): Promise<JournalJsonlCursor> {
  const stored = await persistGetJson<JournalJsonlCursor>(JOURNAL_JSONL_CURSOR_KEY);
  if (stored?.hashes && typeof stored.hashes === 'object') {
    return { hashes: stored.hashes };
  }
  return { hashes: {} };
}

export async function saveJournalJsonlCursor(cursor: JournalJsonlCursor): Promise<void> {
  await persistSetJson(JOURNAL_JSONL_CURSOR_KEY, cursor);
}

/**
 * Build pending lines from full journal (incl. archived).
 * Does not write disk / cursor — caller persists cursor only after successful append.
 */
export function prepareJournalJsonlAppend(
  journal: readonly AiTradeJournalEntry[],
  cursor: JournalJsonlCursor | null | undefined,
  now = new Date(),
): {
  date: string;
  pending: JournalJsonlPendingLine[];
  nextCursor: JournalJsonlCursor;
} {
  const pending = collectPendingJournalJsonlLines(journal, cursor);
  return {
    date: formatJournalJsonlDateVn(now),
    pending,
    nextCursor: mergeJournalJsonlCursor(cursor, pending),
  };
}
