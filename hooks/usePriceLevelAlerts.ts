import { useEffect, useRef } from 'react';
import { runPriceLevelMonitor } from '../services/priceLevelMonitor';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';

/**
 * Foreground: theo dõi SL/TP — tự đóng khi chạm SL, thông báo khi chạm TP.
 */
export function usePriceLevelAlerts(): void {
  const runningRef = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await runPriceLevelMonitor();
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
