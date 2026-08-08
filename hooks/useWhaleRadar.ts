import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { WHALE_RADAR_INTERVAL_MS } from '../constants/whaleRadar';
import { alertLockKey, type WhaleRadarEvent } from '../services/whaleRadarDetect';
import { formatWhaleEventLine } from '../services/whaleRadarNotificationMessage';
import { runWhaleRadarScan, runWhaleRadarScanIfDue } from '../services/whaleRadarScan';
import { useResumeableBinanceInterval } from './useResumeableBinanceInterval';

const TOAST_TTL_MS = 12_000;

export interface WhaleRadarToastItem {
  id: string;
  text: string;
}

export interface WhaleRadarState {
  toasts: WhaleRadarToastItem[];
}

function eventsToToasts(events: WhaleRadarEvent[], scannedAt: number): WhaleRadarToastItem[] {
  return events.map((event) => ({
    id: `${alertLockKey(event)}-${scannedAt}`,
    text: formatWhaleEventLine(event),
  }));
}

/** Quét Radar Cá Mập ngầm mỗi 5 phút — chỉ hiện dòng thông báo khi có thay đổi tường. */
export function useWhaleRadar(): WhaleRadarState {
  const [toasts, setToasts] = useState<WhaleRadarToastItem[]>([]);
  const runningRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToasts = useCallback(
    (events: WhaleRadarEvent[], scannedAt: number) => {
      if (events.length === 0) return;
      const incoming = eventsToToasts(events, scannedAt);
      setToasts((prev) => {
        const ids = new Set(incoming.map((t) => t.id));
        return [...incoming, ...prev.filter((t) => !ids.has(t.id))].slice(0, 4);
      });
      for (const item of incoming) {
        if (timersRef.current.has(item.id)) continue;
        const timer = setTimeout(() => dismissToast(item.id), TOAST_TTL_MS);
        timersRef.current.set(item.id, timer);
      }
    },
    [dismissToast],
  );

  const scan = useCallback(
    async (force = false) => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const result = force ? await runWhaleRadarScan() : await runWhaleRadarScanIfDue();
        if (result?.events.length) {
          pushToasts(result.events, result.scannedAt);
        }
      } finally {
        runningRef.current = false;
      }
    },
    [pushToasts],
  );

  useResumeableBinanceInterval(() => scan(false), WHALE_RADAR_INTERVAL_MS, {
    runOnMount: true,
  });

  useEffect(() => {
    const appStateSub =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') void scan(false);
          });

    return () => {
      appStateSub?.remove();
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, [scan]);

  return { toasts };
}
