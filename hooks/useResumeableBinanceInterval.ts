import { useEffect, useRef } from 'react';
import {
  isBinanceTrafficBlocked,
  msUntilBinanceTrafficAllowed,
  subscribeBinanceBlockState,
} from '../services/binanceApi';

export interface UseResumeableBinanceIntervalOptions {
  /** Fire one tick immediately when starting (and when resuming after unblock). Default true. */
  runOnMount?: boolean;
  /** When false, no interval is armed. Default true. */
  enabled?: boolean;
}

/**
 * Interval that fully clears while Binance 429/418 block is active, then resumes
 * automatically when the global gate opens again.
 */
export function useResumeableBinanceInterval(
  tick: () => void | Promise<void>,
  intervalMs: number,
  options?: UseResumeableBinanceIntervalOptions,
): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const runOnMount = options?.runOnMount ?? true;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (resumeTimer != null) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    };

    const safeTick = () => {
      if (cancelled || isBinanceTrafficBlocked()) return;
      void tickRef.current();
    };

    const startInterval = () => {
      if (cancelled || intervalId != null) return;
      intervalId = setInterval(safeTick, intervalMs);
    };

    const armForBlock = () => {
      clearTimers();
      const wait = msUntilBinanceTrafficAllowed();
      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        if (cancelled) return;
        if (isBinanceTrafficBlocked()) {
          armForBlock();
          return;
        }
        startInterval();
        if (runOnMount) safeTick();
      }, Math.max(0, wait) + 25);
    };

    const sync = () => {
      if (cancelled) return;
      if (isBinanceTrafficBlocked()) {
        armForBlock();
        return;
      }
      if (resumeTimer != null) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      startInterval();
    };

    if (runOnMount && !isBinanceTrafficBlocked()) {
      safeTick();
    }
    sync();

    const unsub = subscribeBinanceBlockState(sync);
    return () => {
      cancelled = true;
      clearTimers();
      unsub();
    };
  }, [intervalMs, enabled, runOnMount]);
}
