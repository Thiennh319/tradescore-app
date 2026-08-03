import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  FEATURE_FLAGS,
  formatTpProbabilityFilterStatus,
  isEntryStateManagerEnabled,
  isUlAnalyticsEnabled,
  maybeLogTpProbabilityFilterEnableHint,
  resetTpProbabilityFilterHintForTests,
  setUlAnalyticsEnabledForTests,
} from '../config/featureFlags';

describe('maybeLogTpProbabilityFilterEnableHint', () => {
  beforeEach(() => {
    resetTpProbabilityFilterHintForTests();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 4: closedTrades=300 → log gợi ý, flag vẫn false', () => {
    maybeLogTpProbabilityFilterEnableHint(300);
    expect(console.log).toHaveBeenCalledWith(
      '[FeatureFlag] Đủ 300 lệnh — cân nhắc bật TP_PROBABILITY_FILTER',
    );
    expect(FEATURE_FLAGS.TP_PROBABILITY_FILTER).toBe(false);

    maybeLogTpProbabilityFilterEnableHint(350);
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('dưới 300 lệnh → không log', () => {
    maybeLogTpProbabilityFilterEnableHint(299);
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe('formatTpProbabilityFilterStatus', () => {
  it('hiển thị trạng thái tắt và số lệnh đóng', () => {
    expect(formatTpProbabilityFilterStatus(42)).toContain('TP Probability Filter: Tắt');
    expect(formatTpProbabilityFilterStatus(42)).toContain('Hiện tại: 42 lệnh đóng');
    expect(formatTpProbabilityFilterStatus(42)).toContain('300');
  });
});

describe('USE_UL_ANALYTICS — Task 15.1', () => {
  afterEach(() => {
    setUlAnalyticsEnabledForTests(null);
  });

  it('FEATURE_FLAGS defaults to false', () => {
    expect(FEATURE_FLAGS.USE_UL_ANALYTICS).toBe(false);
  });

  it('isUlAnalyticsEnabled follows override', () => {
    setUlAnalyticsEnabledForTests(null);
    expect(isUlAnalyticsEnabled()).toBe(false);
    setUlAnalyticsEnabledForTests(true);
    expect(isUlAnalyticsEnabled()).toBe(true);
    setUlAnalyticsEnabledForTests(false);
    expect(isUlAnalyticsEnabled()).toBe(false);
  });
});

describe('USE_CONTINUOUS_SCORING_TR — V4.1 shadow', () => {
  it('FEATURE_FLAGS defaults to false (shadow)', () => {
    expect(FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR).toBe(false);
  });

  it('CONTINUOUS_SCORING_TR_SYMBOLS scopes NEARUSDT (master flag still false)', () => {
    expect(FEATURE_FLAGS.CONTINUOUS_SCORING_TR_SYMBOLS).toEqual(['NEARUSDT']);
    expect(FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR).toBe(false);
  });
});

describe('ENTRY_STATE_MANAGER_ENABLED — UL-04.0 / UL-04.2', () => {
  it('FEATURE_FLAGS defaults to false (production compile-time)', () => {
    expect(FEATURE_FLAGS.ENTRY_STATE_MANAGER_ENABLED).toBe(false);
  });

  it('runtime helper follows UL-04.2 (DEV/staging auto-ON; compile-time flag stays false)', () => {
    // Vitest often runs with __DEV__ or staging env → runtime ON is expected.
    // Production release still ships FEATURE_FLAGS.ENTRY_STATE_MANAGER_ENABLED === false.
    expect(FEATURE_FLAGS.ENTRY_STATE_MANAGER_ENABLED).toBe(false);
    expect(typeof isEntryStateManagerEnabled()).toBe('boolean');
  });

  it('ON when EXPO_PUBLIC_TRADESCORE_STAGING=1', () => {
    vi.stubEnv('EXPO_PUBLIC_TRADESCORE_STAGING', '1');
    expect(isEntryStateManagerEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
