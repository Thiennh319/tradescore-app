import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { AnalysisTimeframe } from '../constants/scoring';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import type { AmbiguityState } from '../services/directionAmbiguity';
import {
  onPullMirrorComplete,
  onSignalBoardMirrorApplied,
  stageSignalBoardForSync,
  syncOnAction,
} from '../services/driveSyncService';
import { fillPendingOrdersAtPrices } from '../services/pendingOrderFillService';
import {
  loadPersistedSignalBoard,
  savePersistedSignalBoard,
  type PersistedSignalBoard,
} from '../services/signalBoardPersist';
import { scanAllSignalRows, type SignalRow } from '../services/signalBoardScan';
import { wireProductionEsmAfterScan } from '../services/productionEsmBridge/productionEsmScanWiring';
import { buildSignalScanContext } from '../services/signalScanContext';
import { notifyScanMarkPricesUpdated } from './scanMarkPriceBus';
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
/** Web: tin snapshot APK trong 3 phút — tránh quét lại lệch điểm. */
const WEB_APK_MIRROR_MAX_AGE_MS = 3 * SCAN_INTERVAL_MS;

export type { SignalRow };

export interface SignalBoardResult {
  rows: SignalRow[];
  loading: boolean;
  lastScannedAt: number | null;
  autoTriggeredAt: number | null;
  scan: (force?: boolean) => void;
}

function applyPersistedBoard(
  cached: PersistedSignalBoard,
  setRows: (rows: SignalRow[]) => void,
  setLastScannedAt: (t: number) => void,
  lastScannedAtRef: React.MutableRefObject<number | null>,
  setLoading: (v: boolean) => void,
): boolean {
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
  notifyScanMarkPricesUpdated();
  return true;
}

/**
 * Quét tất cả cặp (BTC, NEAR, SOL, BNB) — V3+V4+CVDX.
 * APK: upload snapshot lên Gist sau mỗi lần quét.
 * Web: mirror snapshot từ APK khi còn mới.
 */
export function useSignalBoard(
  timeframe: AnalysisTimeframe,
  options?: { pauseAutoScan?: boolean },
): SignalBoardResult {
  const pauseAutoScan = options?.pauseAutoScan ?? false;
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [autoTriggeredAt, setAutoTriggeredAt] = useState<number | null>(null);
  const runningRef = useRef(false);
  const lockRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number | null>(null);
  const ambiguityStateRefV4 = useRef<Map<string, AmbiguityState>>(new Map());
  const ambiguityStateRefV3 = useRef<Map<string, AmbiguityState>>(new Map());
  const isWeb = Platform.OS === 'web';

  const hydrateFromCache = useCallback(async () => {
    const cached = await loadPersistedSignalBoard(timeframe);
    if (!cached) return false;
    return applyPersistedBoard(
      cached,
      setRows,
      setLastScannedAt,
      lastScannedAtRef,
      setLoading,
    );
  }, [timeframe]);

  const uploadScanToGist = useCallback(
    async (board: PersistedSignalBoard) => {
      if (isWeb) return;
      stageSignalBoardForSync(board);
      await syncOnAction('SIGNAL_BOARD_SCANNED');
    },
    [isWeb],
  );

  const scan = useCallback(async (force = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    try {
      if (isWeb && !force) {
        const cached = await loadPersistedSignalBoard(timeframe);
        const mirrorFresh =
          cached != null && Date.now() - cached.scannedAt <= WEB_APK_MIRROR_MAX_AGE_MS;
        if (mirrorFresh) {
          applyPersistedBoard(
            cached,
            setRows,
            setLastScannedAt,
            lastScannedAtRef,
            setLoading,
          );
          return;
        }
      }

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
      const scanStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const next = await scanAllSignalRows(timeframe, scoringPsychology, scanContext, {
        v3: ambiguityStateRefV3.current,
        v4: ambiguityStateRefV4.current,
      });
      const scanDurationMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - scanStart;
      const scannedAt = Date.now();
      wireProductionEsmAfterScan(next, scannedAt, useTradeStore.getState(), { scanDurationMs });
      setRows(next);
      setLastScannedAt(scannedAt);
      lastScannedAtRef.current = scannedAt;
      notifyScanMarkPricesUpdated();
      const board: PersistedSignalBoard = { timeframe, rows: next, scannedAt };
      await savePersistedSignalBoard(timeframe, next, scannedAt);
      await uploadScanToGist(board);

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
  }, [timeframe, isWeb, uploadScanToGist]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hydrated = await hydrateFromCache();
      if (cancelled) return;
      if (pauseAutoScan) return;
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

    const scanInterval = pauseAutoScan
      ? null
      : setInterval(() => void scan(), SCAN_INTERVAL_MS);
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
            if (pauseAutoScan) return;
            const stale =
              lastScannedAtRef.current == null ||
              Date.now() - lastScannedAtRef.current > STALE_SCAN_MS;
            if (stale) {
              void scan();
            }
          });

    const unsubMirror = isWeb
      ? onSignalBoardMirrorApplied((board) => {
          if (board.timeframe !== timeframe) return;
          applyPersistedBoard(
            board,
            setRows,
            setLastScannedAt,
            lastScannedAtRef,
            setLoading,
          );
        })
      : () => {};

    const unsubPull = isWeb
      ? onPullMirrorComplete((result) => {
          if (
            result.signalBoardUpdated ||
            result.journalMerged > 0 ||
            result.capitalUpdated
          ) {
            void hydrateFromCache().then((ok) => {
              if (!ok && !result.signalBoardUpdated) {
                void scan();
              }
            });
          }
        })
      : () => {};

    return () => {
      cancelled = true;
      if (scanInterval) clearInterval(scanInterval);
      if (cachePoll) clearInterval(cachePoll);
      appStateSub?.remove();
      unsubMirror();
      unsubPull();
    };
  }, [hydrateFromCache, scan, timeframe, isWeb, pauseAutoScan]);

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
    scan,
  };
}
