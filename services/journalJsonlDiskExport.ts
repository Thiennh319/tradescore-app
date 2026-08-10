import { Platform } from 'react-native';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { appendJournalJsonlViaBridge, isJournalJsonlDiskBridgeAvailable } from './journalJsonlBridge';
import {
  loadJournalJsonlCursor,
  prepareJournalJsonlAppend,
  saveJournalJsonlCursor,
} from './journalJsonlExport';

/**
 * After Web pull/hydrate: append new/changed journal entries to EXE disk JSONL.
 * No-op on native / browser without WebView2 bridge.
 * Cursor updated only when host write succeeds.
 */
export async function exportJournalJsonlAfterWebPull(
  journal: readonly AiTradeJournalEntry[],
): Promise<{ exported: number; skipped: boolean; reason?: string }> {
  if (Platform.OS !== 'web') {
    return { exported: 0, skipped: true, reason: 'NOT_WEB' };
  }

  const cursor = await loadJournalJsonlCursor();
  const { date, pending, nextCursor } = prepareJournalJsonlAppend(journal, cursor);

  if (pending.length === 0) {
    console.log('[JournalJsonl] No new/changed entries — skip');
    return { exported: 0, skipped: true, reason: 'NO_PENDING' };
  }

  if (!isJournalJsonlDiskBridgeAvailable()) {
    console.warn(
      `[JournalJsonl] ${pending.length} pending but no WebView2 bridge (open via TradeScore-Web.exe to write data/journal/)`,
    );
    return { exported: 0, skipped: true, reason: 'NO_WEBVIEW_BRIDGE' };
  }

  const result = await appendJournalJsonlViaBridge(
    date,
    pending.map((p) => p.line),
  );

  if (!result.ok) {
    console.warn('[JournalJsonl] Disk append failed — cursor not updated:', result.error);
    return { exported: 0, skipped: true, reason: result.error ?? 'APPEND_FAILED' };
  }

  await saveJournalJsonlCursor(nextCursor);
  console.log(
    `[JournalJsonl] Appended ${pending.length} line(s) → data/journal/journal_${date}.jsonl`,
    result.path ? `(${result.path})` : '',
  );
  return { exported: pending.length, skipped: false };
}
