import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { AnalysisTimeframe } from '../constants/scoring';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import { fillPendingOrdersAtPrices } from '../services/pendingOrderFillService';
import { loadPersistedSignalBoard, savePersistedSignalBoard } from '../services/signalBoardPersist';
import { scanAllSignalRows, type SignalRow } from '../services/signalBoardScan';
import { buildSignalScanContext } from '../services/signalScanContext';
import {
  buildAutoRefreshLockKey,
  getVietnamDateParts,
  shouldTriggerAutoCheck,
  toScoringPsychologyChecklist,
  useTradeStore,
} from '../store/useTradeStore';

const AUTO_TICK_MS = SCAN_INTERVAL_MS;
const NATIVE_CACHE_POLL_MS = 5_000;
const STALE_SCAN_MS = SCAN_INTERVAL_MS + 15_000;

export type { SignalRow };

export interface SignalBoardResult {
  rows: SignalRow[];
  loading: boolean;
  lastScannedAt: number | null;
  autoTriggeredAt: number | null;
  scan: () => void;
}

/**
 * Quét tất cả cặp (BTC, NEAR, SOL, BNB) và chấm điểm Scorer V3 cho mỗi cặp.
 * Native: foreground service quét mỗi phút; UI đọc cache + quét khi đổi timeframe.
 */
export function useSignalBoard(timeframe: AnalysisTimeframe): SignalBoardResult {
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [autoTriggeredAt, setAutoTriggeredAt] = useState<number | null>(null);
  const runningRef = useRef(false);
  const lockRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number | null>(null);

  const hydrateFromCache = useCallback(async () => {
    const cached = await loadPersistedSignalBoard(timeframe);
    if (!cached) return false;
    if (
      lastScannedAtRef.current != null &&
      cached.scannedAt <= lastScannedAtRef.current
    ) {
      return false;
    }
    setRows(cached.rows);
    setLastScannedAt(cached.scannedAt);
    lastScannedAtRef.current = cached.scannedAt;
    setLoading(false);
    return true;
  }, [timeframe]);

  const scan = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    try {
      const { tradeJournal, settings, psychologyChecklist, aiTradeJournal } =
        useTradeStore.getState();
      const scoringPsychology = toScoringPsychologyChecklist(
        psychologyChecklist,
        tradeJournal,
        settings,
      );
      const scanContext = buildSignalScanContext({
        tradeJournal,
        aiTradeJournal,
        settings,
      });
      const next = await scanAllSignalRows(timeframe, scoringPsychology, scanContext);
      const scannedAt = Date.now();
      setRows(next);
      setLastScannedAt(scannedAt);
      lastScannedAtRef.current = scannedAt;
      await savePersistedSignalBoard(timeframe, next, scannedAt);

      const prices = new Map<string, number>();
      for (const row of next) {
        if (row.price != null && Number.isFinite(row.price)) {
          prices.set(row.symbol, row.price);
        }
      }
      if (prices.size > 0) {
        await fillPendingOrdersAtPrices(prices);
      }
      useTradeStore.getState().checkPlanExpiry();
      const { runLockedPlanHealthCheck } = await import('../services/lockedPlanHealthWork');
      await runLockedPlanHealthCheck(next);
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [timeframe]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hydrated = await hydrateFromCache();
      if (cancelled) return;
      if (!hydrated) {
        await scan();
        return;
      }
      const stale =
        lastScannedAtRef.current == null ||
        Date.now() - lastScannedAtRef.current > STALE_SCAN_MS;
      if (stale) {
        await scan();
      }
    })();

    const scanInterval = setInterval(() => void scan(), SCAN_INTERVAL_MS);
    const cachePoll =
      Platform.OS === 'web'
        ? null
        : setInterval(() => {
            void hydrateFromCache();
          }, NATIVE_CACHE_POLL_MS);

    const appStateSub =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            void hydrateFromCache();
            const stale =
              lastScannedAtRef.current == null ||
              Date.now() - lastScannedAtRef.current > STALE_SCAN_MS;
            if (stale) {
              void scan();
            }
          });

    return () => {
      cancelled = true;
      clearInterval(scanInterval);
      if (cachePoll) clearInterval(cachePoll);
      appStateSub?.remove();
    };
  }, [hydrateFromCache, scan]);

  useEffect(() => {
    const tick = () => {
      const parts = getVietnamDateParts();
      if (!shouldTriggerAutoCheck(parts, DEFAULT_SETTINGS)) {
        if (parts.minute !== DEFAULT_SETTINGS.triggerMinute) lockRef.current = null;
        return;
      }
      const key = buildAutoRefreshLockKey(parts, DEFAULT_SETTINGS.triggerMinute);
      if (lockRef.current === key) return;
      lockRef.current = key;
      setAutoTriggeredAt(Date.now());
    };

    const id = setInterval(tick, AUTO_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return {
    rows,
    loading,
    lastScannedAt,
    autoTriggeredAt,
    scan: () => void scan(),
  };
}
