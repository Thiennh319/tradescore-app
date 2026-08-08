import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS,
  isFixHardReasonLabelingEnabled,
  setFixHardReasonLabelingForTests,
} from '../../config/featureFlags';
import {
  applyEntryBlockedFields,
  resolveSnapEntryBlocked,
} from '../entryBlockedLabeling';
import {
  collectGroupBlockReasons,
  collectHardBlockReasons,
  collectScoreSoftBlockReasons,
  type HardBlockSnapInput,
} from '../tradePlanDisplay';

describe('FIX_HARD_REASON_LABELING', () => {
  afterEach(() => {
    setFixHardReasonLabelingForTests(null);
  });

  it('defaults OFF', () => {
    expect(FEATURE_FLAGS.FIX_HARD_REASON_LABELING).toBe(false);
    expect(isFixHardReasonLabelingEnabled()).toBe(false);
  });

  it('applyEntryBlockedFields: flag OFF only hardBlocked; ON adds entryBlocked (same value)', () => {
    setFixHardReasonLabelingForTests(false);
    expect(applyEntryBlockedFields(true)).toEqual({ hardBlocked: true });

    setFixHardReasonLabelingForTests(true);
    expect(applyEntryBlockedFields(true)).toEqual({
      entryBlocked: true,
      hardBlocked: true,
    });
  });

  it('collectHardBlockReasons: flag ON excludes soft blockReasons', () => {
    const snap: HardBlockSnapInput = {
      direction: 'SHORT',
      mandatoryViolations: [
        'Nhóm A (Xu hướng) 1.6/5đ < 2.5đ',
        'L5a CVD chưa đủ 1đ — test',
      ],
      groupBlocks: ['Nhóm A (Xu hướng) 1.6/5đ < 2.5đ'],
      longHardBlocks: [],
      shortHardBlocks: [],
      longBlockReasons: [],
      shortBlockReasons: ['L5a CVD chưa đủ 1đ — test'],
      hardBlocked: true,
      entryBlocked: true,
    };

    setFixHardReasonLabelingForTests(false);
    expect(collectHardBlockReasons(snap)).toEqual(['L5a CVD chưa đủ 1đ — test']);

    setFixHardReasonLabelingForTests(true);
    expect(collectHardBlockReasons(snap)).toEqual([]);
    expect(collectGroupBlockReasons(snap)).toEqual([
      'Nhóm A (Xu hướng) 1.6/5đ < 2.5đ',
    ]);
    expect(collectScoreSoftBlockReasons(snap)).toEqual([
      'L5a CVD chưa đủ 1đ — test',
    ]);
  });

  it('collectHardBlockReasons: flag ON keeps real hardBlocks', () => {
    setFixHardReasonLabelingForTests(true);
    const snap: HardBlockSnapInput = {
      direction: 'LONG',
      mandatoryViolations: ['L3 MACD vi phạm — x', 'L5a soft'],
      groupBlocks: [],
      longHardBlocks: ['L3 MACD vi phạm — x'],
      shortHardBlocks: [],
      longBlockReasons: ['L5a soft'],
      shortBlockReasons: [],
      entryBlocked: true,
      hardBlocked: true,
    };
    expect(collectHardBlockReasons(snap)).toEqual(['L3 MACD vi phạm — x']);
  });

  it('resolveSnapEntryBlocked prefers entryBlocked when flag ON', () => {
    setFixHardReasonLabelingForTests(true);
    expect(
      resolveSnapEntryBlocked({ hardBlocked: false, entryBlocked: true }),
    ).toBe(true);
    setFixHardReasonLabelingForTests(false);
    expect(
      resolveSnapEntryBlocked({ hardBlocked: true, entryBlocked: false }),
    ).toBe(true);
  });
});
