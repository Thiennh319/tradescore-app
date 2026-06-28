import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlanExpiryFields,
  calculatePlanExpiry,
  formatPendingAutoCancelLabel,
  isPlanExpired,
  planExpiresAtMs,
  resolvePlanExpiryOutput,
} from './tradePlanExpiry';

describe('calculatePlanExpiry', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 1: score 13.5 → HIGH 12h', () => {
    const result = calculatePlanExpiry(13.5);
    expect(result).toEqual({ hours: 12, tier: 'HIGH' });

    const fields = buildPlanExpiryFields(13.5);
    expect(fields.expiryHours).toBe(12);
    expect(fields.expiryTier).toBe('HIGH');
    expect(new Date(fields.expiresAt).getTime()).toBe(NOW + 43_200_000);
  });

  it('Test 2: score 11.8 → MEDIUM 8h', () => {
    expect(calculatePlanExpiry(11.8)).toEqual({ hours: 8, tier: 'MEDIUM' });
    const fields = buildPlanExpiryFields(11.8);
    expect(fields.expiryHours).toBe(8);
    expect(fields.expiryTier).toBe('MEDIUM');
    expect(new Date(fields.expiresAt).getTime()).toBe(NOW + 8 * 3_600_000);
  });

  it('Test 3: score 9.5 → LOW 4h', () => {
    expect(calculatePlanExpiry(9.5)).toEqual({ hours: 4, tier: 'LOW' });
    const fields = buildPlanExpiryFields(9.5);
    expect(fields.expiryHours).toBe(4);
    expect(fields.expiryTier).toBe('LOW');
  });

  it('Test 4: score 8.5 + invalid plan → không có expiry output', () => {
    expect(resolvePlanExpiryOutput(8.5, false)).toEqual({});
  });
});

describe('plan expiry timing', () => {
  const T = 1_700_000_000_000;

  it('Test 5: score 11.5 → hết hạn sau 9h, còn active sau 7h', () => {
    const { hours } = calculatePlanExpiry(11.5);
    expect(hours).toBe(8);

    const expiresAt = planExpiresAtMs(T, hours);
    expect(isPlanExpired(expiresAt, T + 7 * 3_600_000)).toBe(false);
    expect(isPlanExpired(expiresAt, T + 9 * 3_600_000)).toBe(true);
  });
});

describe('formatPendingAutoCancelLabel', () => {
  it('formats score-aware countdown label', () => {
    expect(formatPendingAutoCancelLabel('5h22m', 11.5, 8)).toBe(
      'Tự hủy sau: 5h22m (Score 11.5 → 8h plan)',
    );
  });
});
