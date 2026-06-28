import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  FEATURE_FLAGS,
  formatTpProbabilityFilterStatus,
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
