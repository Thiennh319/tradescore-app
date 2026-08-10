/**
 * Default (native / non-WebView) — no disk bridge.
 * Web Metro resolves `journalJsonlBridge.web.ts`.
 */

export type DiskJsonlAppendResult = {
  type: 'DISK_JSONL_APPEND_RESULT' | 'JOURNAL_JSONL_APPEND_RESULT';
  requestId: string;
  ok: boolean;
  error?: string;
  path?: string;
};

export type JournalJsonlAppendResult = DiskJsonlAppendResult;

export function isJournalJsonlDiskBridgeAvailable(): boolean {
  return false;
}

export function isDiskJsonlBridgeAvailable(): boolean {
  return false;
}

export function appendDiskJsonlViaBridge(_opts: {
  subdir: string;
  filePrefix: string;
  date: string;
  lines: string[];
  timeoutMs?: number;
}): Promise<DiskJsonlAppendResult> {
  return Promise.resolve({
    type: 'DISK_JSONL_APPEND_RESULT',
    requestId: 'native',
    ok: false,
    error: 'NO_WEBVIEW_BRIDGE',
  });
}

export function appendJournalJsonlViaBridge(
  _date: string,
  _lines: string[],
  _timeoutMs?: number,
): Promise<JournalJsonlAppendResult> {
  return Promise.resolve({
    type: 'JOURNAL_JSONL_APPEND_RESULT',
    requestId: 'native',
    ok: false,
    error: 'NO_WEBVIEW_BRIDGE',
  });
}
