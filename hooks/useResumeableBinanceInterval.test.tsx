import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetApiGuardForTests,
  __setBinanceBlockForTests,
} from '../services/binanceApi';
import { useResumeableBinanceInterval } from './useResumeableBinanceInterval';

function Probe(props: {
  tick: () => void;
  intervalMs: number;
  enabled?: boolean;
}) {
  useResumeableBinanceInterval(props.tick, props.intervalMs, {
    runOnMount: true,
    enabled: props.enabled ?? true,
  });
  return null;
}

describe('useResumeableBinanceInterval', () => {
  beforeEach(() => {
    __resetApiGuardForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    __resetApiGuardForTests();
  });

  it('stops ticking while 418/ip_ban is active and resumes after unblock', () => {
    const tick = vi.fn();
    render(<Probe tick={tick} intervalMs={1_000} />);

    expect(tick).toHaveBeenCalledTimes(1);

    __setBinanceBlockForTests('ip_ban', Date.now() + 5_000, 'test ban');
    tick.mockClear();

    vi.advanceTimersByTime(3_000);
    expect(tick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_100);
    expect(tick).toHaveBeenCalled();
  });

  it('does not start interval when already blocked on mount', () => {
    __setBinanceBlockForTests('rate_limit', Date.now() + 2_000, 'pre-block');
    const tick = vi.fn();
    render(<Probe tick={tick} intervalMs={500} />);

    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(tick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_200);
    expect(tick).toHaveBeenCalled();
  });
});
