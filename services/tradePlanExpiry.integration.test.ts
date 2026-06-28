import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculatePlanExpiry,
  formatPlanExpiredMessage,
  isPlanExpired,
  planExpiresAtMs,
} from './tradePlanExpiry';
import { mapCancelReasonToSkipReason } from './journalService';

describe('checkPlanExpiry integration', () => {
  const T = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 5: score 11.5 → expired sau 9h, active sau 7h', () => {
    const { hours } = calculatePlanExpiry(11.5);
    const expiresAt = planExpiresAtMs(T, hours);

    const checkExpired = (now: number) => isPlanExpired(expiresAt, now);
    expect(checkExpired(T + 7 * 3_600_000)).toBe(false);
    expect(checkExpired(T + 9 * 3_600_000)).toBe(true);
  });

  it('PLAN_EXPIRED maps to skipReason PLAN_EXPIRED', () => {
    expect(mapCancelReasonToSkipReason('PLAN_EXPIRED')).toBe('PLAN_EXPIRED');
  });

  it('formatPlanExpiredMessage uses tier hours', () => {
    expect(formatPlanExpiredMessage(8)).toBe('Lệnh chờ đã hết hạn sau 8h');
  });
});
