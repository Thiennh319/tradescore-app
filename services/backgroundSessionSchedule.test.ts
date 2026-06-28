import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import { shouldTriggerBackgroundSessionCheck } from './backgroundSessionSchedule';
import { getVietnamDateParts } from '../store/useTradeStore';

describe('shouldTriggerBackgroundSessionCheck', () => {
  it('matches window after :02 during trading hours', () => {
    const parts = getVietnamDateParts(new Date('2026-06-13T04:05:00.000Z')); // 11:05 VN if UTC+7... 
    // Use explicit parts for stability
    const atMinute5 = {
      year: 2026,
      month: 6,
      day: 13,
      hour: 11,
      minute: 5,
      ymd: '2026-06-13',
    };
    expect(shouldTriggerBackgroundSessionCheck(atMinute5, DEFAULT_SETTINGS)).toBe(true);
  });

  it('ignores outside window', () => {
    const late = {
      year: 2026,
      month: 6,
      day: 13,
      hour: 11,
      minute: 20,
      ymd: '2026-06-13',
    };
    expect(shouldTriggerBackgroundSessionCheck(late, DEFAULT_SETTINGS)).toBe(false);
  });

  it('ignores before start hour', () => {
    const early = {
      year: 2026,
      month: 6,
      day: 13,
      hour: 5,
      minute: 5,
      ymd: '2026-06-13',
    };
    expect(shouldTriggerBackgroundSessionCheck(early, DEFAULT_SETTINGS)).toBe(false);
  });
});
