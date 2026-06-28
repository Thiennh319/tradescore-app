/**
 * @vitest-environment jsdom
 */
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingOrderCard } from './PendingOrderCard';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';

const entry: StoredTradeJournalEntry = {
  id: 'pending-1',
  symbol: 'BNBUSDT',
  direction: 'SHORT',
  status: 'PENDING',
  entryPrice: 580.88,
  stopLoss: 586.23,
  size: 6.04,
  leverage: 5,
  timestamp: Date.now(),
};

describe('PendingOrderCard plan expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('gọi onPlanExpired ngay khi expiresAt đã qua', () => {
    const onPlanExpired = vi.fn();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    render(
      <PendingOrderCard
        entry={entry}
        markPrice={578.96}
        expiresAt={now - 1_000}
        lockedScore={6.9}
        expiryHours={4}
        onPlanExpired={onPlanExpired}
        onCancel={() => {}}
      />,
    );

    expect(onPlanExpired).toHaveBeenCalledTimes(1);
  });

  it('gọi onPlanExpired đúng lúc hết countdown', async () => {
    const onPlanExpired = vi.fn();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    render(
      <PendingOrderCard
        entry={entry}
        markPrice={578.96}
        expiresAt={now + 3_000}
        onPlanExpired={onPlanExpired}
        onCancel={() => {}}
      />,
    );

    expect(onPlanExpired).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    expect(onPlanExpired).toHaveBeenCalledTimes(1);
  });
});
