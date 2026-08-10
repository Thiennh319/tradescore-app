/**
 * WebView2 host bridge — append JSONL under {appRoot}/data/{subdir}/.
 * Supports journal (Task 3) + generic disk append (Task 4 market-raw).
 */

export type DiskJsonlAppendResult = {
  type: 'DISK_JSONL_APPEND_RESULT' | 'JOURNAL_JSONL_APPEND_RESULT';
  requestId: string;
  ok: boolean;
  error?: string;
  path?: string;
};

/** @deprecated alias — Journal callers */
export type JournalJsonlAppendResult = DiskJsonlAppendResult;

type ChromeWebView = {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: string, listener: (ev: MessageEvent) => void) => void;
  removeEventListener: (type: string, listener: (ev: MessageEvent) => void) => void;
};

const SAFE_SUBDIRS = new Set(['journal', 'market-raw']);
const SAFE_PREFIXES = new Set(['journal', 'market_raw']);

function getChromeWebView(): ChromeWebView | null {
  if (typeof window === 'undefined') return null;
  const chrome = (window as unknown as { chrome?: { webview?: ChromeWebView } }).chrome;
  const wv = chrome?.webview;
  if (!wv || typeof wv.postMessage !== 'function') return null;
  if (typeof wv.addEventListener !== 'function') return null;
  return wv;
}

export function isJournalJsonlDiskBridgeAvailable(): boolean {
  return getChromeWebView() != null;
}

export function isDiskJsonlBridgeAvailable(): boolean {
  return getChromeWebView() != null;
}

function newRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function appendDiskJsonlViaBridge(opts: {
  subdir: string;
  filePrefix: string;
  date: string;
  lines: string[];
  timeoutMs?: number;
}): Promise<DiskJsonlAppendResult> {
  const webview = getChromeWebView();
  const requestId = newRequestId('disk');
  const timeoutMs = opts.timeoutMs ?? 8_000;

  if (!webview) {
    return Promise.resolve({
      type: 'DISK_JSONL_APPEND_RESULT',
      requestId,
      ok: false,
      error: 'NO_WEBVIEW_BRIDGE',
    });
  }

  if (!SAFE_SUBDIRS.has(opts.subdir) || !SAFE_PREFIXES.has(opts.filePrefix)) {
    return Promise.resolve({
      type: 'DISK_JSONL_APPEND_RESULT',
      requestId,
      ok: false,
      error: 'UNSAFE_PATH',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
    return Promise.resolve({
      type: 'DISK_JSONL_APPEND_RESULT',
      requestId,
      ok: false,
      error: 'INVALID_DATE',
    });
  }

  if (opts.lines.length === 0) {
    return Promise.resolve({
      type: 'DISK_JSONL_APPEND_RESULT',
      requestId,
      ok: true,
      path: '',
    });
  }

  const payload = {
    type: 'DISK_JSONL_APPEND' as const,
    requestId,
    subdir: opts.subdir,
    filePrefix: opts.filePrefix,
    date: opts.date,
    lines: opts.lines,
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DiskJsonlAppendResult) => {
      if (settled) return;
      settled = true;
      try {
        webview.removeEventListener('message', onHostMessage);
      } catch {
        // ignore
      }
      clearTimeout(timer);
      resolve(result);
    };

    const onHostMessage = (ev: MessageEvent) => {
      let data: unknown = ev.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object') return;
      const msg = data as DiskJsonlAppendResult;
      if (msg.type !== 'DISK_JSONL_APPEND_RESULT' && msg.type !== 'JOURNAL_JSONL_APPEND_RESULT') {
        return;
      }
      if (msg.requestId !== requestId) return;
      finish(msg);
    };

    webview.addEventListener('message', onHostMessage);

    const timer = setTimeout(() => {
      finish({
        type: 'DISK_JSONL_APPEND_RESULT',
        requestId,
        ok: false,
        error: 'BRIDGE_TIMEOUT',
      });
    }, timeoutMs);

    try {
      webview.postMessage(payload);
    } catch (err) {
      finish({
        type: 'DISK_JSONL_APPEND_RESULT',
        requestId,
        ok: false,
        error: err instanceof Error ? err.message : 'POST_MESSAGE_FAILED',
      });
    }
  });
}

/** Task 3 — journal file under data/journal/ */
export function appendJournalJsonlViaBridge(
  date: string,
  lines: string[],
  timeoutMs = 8_000,
): Promise<JournalJsonlAppendResult> {
  return appendDiskJsonlViaBridge({
    subdir: 'journal',
    filePrefix: 'journal',
    date,
    lines,
    timeoutMs,
  }).then((r) => ({
    ...r,
    type: 'JOURNAL_JSONL_APPEND_RESULT',
  }));
}
