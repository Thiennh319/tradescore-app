import { describe, expect, it } from 'vitest';
import type { PositionRecommendation } from '../positionAdvisorV3';
import {
  applyStabilityFilter,
  createInitialStabilityState,
  REQUIRED_CONFIRMATIONS,
} from '../recommendationStability';

function rec(
  type: PositionRecommendation['type'],
  urgency: PositionRecommendation['urgency'],
  reasons: string[] = ['test'],
): PositionRecommendation {
  return {
    type,
    label: type,
    color: '#fff',
    confidence: 80,
    reasons,
    urgency,
    matchedRuleCount: 1,
    triggeredBy: 'TEST',
  };
}

describe('REQUIRED_CONFIRMATIONS', () => {
  it('maps urgency to confirmation counts', () => {
    expect(REQUIRED_CONFIRMATIONS.CRITICAL).toBe(1);
    expect(REQUIRED_CONFIRMATIONS.HIGH).toBe(2);
    expect(REQUIRED_CONFIRMATIONS.MEDIUM).toBe(3);
    expect(REQUIRED_CONFIRMATIONS.LOW).toBe(1);
  });
});

describe('applyStabilityFilter', () => {
  it('HOLD→CLOSE_NOW (HIGH) cần 2 lần liên tiếp', () => {
    const hold = rec('HOLD', 'LOW');
    let state = createInitialStabilityState(hold);
    const close = rec('CLOSE_NOW', 'HIGH');

    const first = applyStabilityFilter(close, state);
    expect(first.output.type).toBe('HOLD');
    expect(first.output.reasons[0]).toContain('(1/2 lần)');
    expect(first.newState.pendingCount).toBe(1);
    expect(first.newState.pendingType).toBe('CLOSE_NOW');

    const second = applyStabilityFilter(close, first.newState);
    expect(second.output.type).toBe('CLOSE_NOW');
    expect(second.newState.pendingCount).toBe(0);
    expect(second.newState.lastStableType).toBe('CLOSE_NOW');
  });

  it('HOLD→CLOSE_URGENT (CRITICAL) ngay lập tức', () => {
    const hold = rec('HOLD', 'LOW');
    const state = createInitialStabilityState(hold);
    const urgent = rec('CLOSE_URGENT', 'CRITICAL');

    const { output, newState } = applyStabilityFilter(urgent, state);
    expect(output.type).toBe('CLOSE_URGENT');
    expect(newState.lastStableType).toBe('CLOSE_URGENT');
    expect(newState.pendingCount).toBe(0);
  });

  it('CLOSE→HOLD→CLOSE không reset pending count', () => {
    const hold = rec('HOLD', 'LOW');
    const close = rec('CLOSE_NOW', 'HIGH');
    let state = createInitialStabilityState(hold);

    const step1 = applyStabilityFilter(close, state);
    expect(step1.newState.pendingCount).toBe(1);
    expect(step1.output.type).toBe('HOLD');

    const step2 = applyStabilityFilter(hold, step1.newState);
    expect(step2.newState.pendingCount).toBe(1);
    expect(step2.newState.pendingType).toBe('CLOSE_NOW');
    expect(step2.output.type).toBe('HOLD');

    const step3 = applyStabilityFilter(close, step2.newState);
    expect(step3.output.type).toBe('CLOSE_NOW');
    expect(step3.newState.lastStableType).toBe('CLOSE_NOW');
    expect(step3.newState.pendingCount).toBe(0);
  });

  it('same stable type refreshes và clear pending khi không đang xác nhận loại khác', () => {
    const hold = rec('HOLD', 'LOW');
    const state = createInitialStabilityState(hold);

    const refreshed = applyStabilityFilter(rec('HOLD', 'LOW', ['updated']), state);
    expect(refreshed.newState.pendingCount).toBe(0);
    expect(refreshed.output.reasons[0]).toBe('updated');
  });

  it('MEDIUM urgency cần 3 lần liên tiếp', () => {
    const hold = rec('HOLD', 'LOW');
    let state = createInitialStabilityState(hold);
    const partial = rec('PARTIAL_TP1', 'MEDIUM');

    ({ newState: state } = applyStabilityFilter(partial, state));
    expect(state.pendingCount).toBe(1);

    ({ newState: state } = applyStabilityFilter(partial, state));
    expect(state.pendingCount).toBe(2);

    const third = applyStabilityFilter(partial, state);
    expect(third.output.type).toBe('PARTIAL_TP1');
    expect(third.newState.pendingCount).toBe(0);
  });
});
