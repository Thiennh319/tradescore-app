import { useCallback, useEffect, useRef, useState } from 'react';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import { scanUnified } from '../services/scanUnified';
import { notifyScanMarkPricesUpdated } from './scanMarkPriceBus';
import { buildRc3ViewModelsFromScan } from '../services/v41/rc3/buildRc3ViewModel';
import type { V41Rc3SignalCardModel } from '../services/v41/rc3/rc3ViewModelTypes';
import {
  DEFAULT_SCAN_SYMBOLS_V41,
  scanV41,
  type SignalRowV41,
} from '../services/v41/scanV41';

type ScanV3V4Fn = (force?: boolean) => void | Promise<void>;

const DEFAULT_SYMBOLS: string[] = [...DEFAULT_SCAN_SYMBOLS_V41];

/**
 * Một nhịp quét 60s cho toàn app — V3/V4 → V4.1 → ViewModel RC3 → Tổng hợp.
 * ViewModel build tại biên scan (Task 10) — UI chỉ nhận cards.
 */
export function useUnifiedAppScan(
  scanV3V4: ScanV3V4Fn,
  symbols: string[] = DEFAULT_SYMBOLS,
) {
  const scanV3V4Ref = useRef(scanV3V4);
  scanV3V4Ref.current = scanV3V4;
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const lastUnifiedRef = useRef(0);
  const runningRef = useRef(false);

  const [v41Rows, setV41Rows] = useState<SignalRowV41[]>([]);
  const [v41Cards, setV41Cards] = useState<V41Rc3SignalCardModel[]>([]);
  const [v41Loading, setV41Loading] = useState(false);
  const [v41LastScannedAt, setV41LastScannedAt] = useState<number | null>(null);

  const runUnifiedScan = useCallback(async (force = false) => {
    if (runningRef.current) return;

    const last = lastUnifiedRef.current;
    if (!force && last > 0 && Date.now() - last < SCAN_INTERVAL_MS) {
      return;
    }

    runningRef.current = true;
    setV41Loading(true);
    try {
      await Promise.resolve(scanV3V4Ref.current(force));
      const v41Result = await scanV41(symbolsRef.current);
      setV41Rows(v41Result);
      setV41Cards(buildRc3ViewModelsFromScan(v41Result));
      notifyScanMarkPricesUpdated();
      const scannedAt = Date.now();
      setV41LastScannedAt(scannedAt);
      await scanUnified(symbolsRef.current);
      lastUnifiedRef.current = scannedAt;
    } finally {
      runningRef.current = false;
      setV41Loading(false);
    }
  }, []);

  const runUnifiedScanRef = useRef(runUnifiedScan);
  runUnifiedScanRef.current = runUnifiedScan;

  useEffect(() => {
    let cancelled = false;

    const tick = async (force: boolean) => {
      if (cancelled) return;
      await runUnifiedScanRef.current(force);
    };

    void tick(true);
    const intervalId = setInterval(() => {
      void tick(false);
    }, SCAN_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { runUnifiedScan, v41Rows, v41Cards, v41Loading, v41LastScannedAt };
}
