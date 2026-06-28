import { describe, expect, it } from 'vitest';
import { shouldNotifyForUrgency, URGENCY_RANK } from './notificationThrottle';

describe('shouldNotifyForUrgency', () => {
  const now = 1_700_000_000_000;

  it('chưa notify — chỉ báo khi urgency >= MEDIUM', () => {
    expect(shouldNotifyForUrgency(undefined, 'LOW', now)).toBe(false);
    expect(shouldNotifyForUrgency(undefined, 'MEDIUM', now)).toBe(true);
    expect(shouldNotifyForUrgency(undefined, 'HIGH', now)).toBe(true);
  });

  it('notify khi urgency tăng cấp', () => {
    expect(
      shouldNotifyForUrgency(
        { lastNotifiedUrgency: 'MEDIUM', lastNotifiedAt: now - 60_000 },
        'HIGH',
        now,
      ),
    ).toBe(true);
    expect(
      shouldNotifyForUrgency(
        { lastNotifiedUrgency: 'HIGH', lastNotifiedAt: now - 60_000 },
        'MEDIUM',
        now,
      ),
    ).toBe(false);
  });

  it('CRITICAL lặp sau 5 phút', () => {
    expect(
      shouldNotifyForUrgency(
        { lastNotifiedUrgency: 'CRITICAL', lastNotifiedAt: now - 4 * 60_000 },
        'CRITICAL',
        now,
      ),
    ).toBe(false);
    expect(
      shouldNotifyForUrgency(
        { lastNotifiedUrgency: 'CRITICAL', lastNotifiedAt: now - 5 * 60_000 },
        'CRITICAL',
        now,
      ),
    ).toBe(true);
  });

  it('URGENCY_RANK tăng dần LOW→CRITICAL', () => {
    expect(URGENCY_RANK.LOW).toBeLessThan(URGENCY_RANK.MEDIUM);
    expect(URGENCY_RANK.MEDIUM).toBeLessThan(URGENCY_RANK.HIGH);
    expect(URGENCY_RANK.HIGH).toBeLessThan(URGENCY_RANK.CRITICAL);
  });
});
