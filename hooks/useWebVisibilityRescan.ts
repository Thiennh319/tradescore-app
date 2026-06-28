import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';

/**
 * Web: khi tab bị ẩn trình duyệt có thể throttle timer.
 * Khi quay lại tab, quét ngay nếu đã quá 60s kể từ lần quét cuối.
 */
export function useWebVisibilityRescan(onRescan: () => void, lastScannedAt: number | null): void {
  const lastRunRef = useRef<number>(lastScannedAt ?? 0);

  useEffect(() => {
    lastRunRef.current = lastScannedAt ?? lastRunRef.current;
  }, [lastScannedAt]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const last = lastRunRef.current;
      if (last > 0 && Date.now() - last >= SCAN_INTERVAL_MS) {
        onRescan();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [onRescan]);
}
