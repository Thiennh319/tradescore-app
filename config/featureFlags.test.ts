import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  FEATURE_FLAGS,
  formatTpProbabilityFilterStatus,
  isEntryStateManagerEnabled,
  maybeLogTpProbabilityFilterEnableHint,
  resetTpProbabilityFilterHintForTests,
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

describe('ENTRY_STATE_MANAGER_ENABLED — UL-04.0 / UL-04.2', () => {
  it('FEATURE_FLAGS defaults to false (production compile-time)', () => {
    expect(FEATURE_FLAGS.ENTRY_STATE_MANAGER_ENABLED).toBe(false);
  });

  it('OFF in vitest env without __DEV__ or staging env', () => {
    expect(isEntryStateManagerEnabled()).toBe(false);
  });

  it('ON when EXPO_PUBLIC_TRADESCORE_STAGING=1', () => {
    vi.stubEnv('EXPO_PUBLIC_TRADESCORE_STAGING', '1');
    expect(isEntryStateManagerEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
