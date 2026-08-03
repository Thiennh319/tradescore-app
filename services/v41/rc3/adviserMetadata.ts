/**
 * V4.1 Task 11.1 — Position Adviser metadata (Journal / AI Report).
 * Chỉ map / chuẩn hóa — KHÔNG sửa Position Adviser algorithm.
 */

import type {
  PositionAdvisorV41Action,
  PositionAdvisorV41Result,
} from '../positionAdvisorV41';

export type V41AdvisorActionCode =
  | 'WAITING_FILL'
  | 'HOLD'
  | 'MOVE_SL_BE'
  | 'TRAILING_STOP'
  | 'PARTIAL_TP1'
  | 'PARTIAL_TP2'
  | 'CLOSE_NOW';

export type V41AdvisorReasonCode =
  | 'WAITING_FILL'
  | 'RR_1_REACHED'
  | 'MOMENTUM_STRONG'
  | 'MOMENTUM_WEAK'
  | 'TRAILING_STOP'
  | 'PROTECTION_TRIGGER'
  | 'EXHAUSTION'
  | 'SUPPORT_BREAK'
  | 'RESISTANCE_REJECT'
  | 'TP1_REACHED'
  | 'TP2_REACHED'
  | 'REVERSAL_SIGNAL'
  | 'MARKET_OPPOSES'
  | 'SNAPSHOT_STALE'
  | 'HOLD_DEFAULT';

/** ISO-8601 UTC — Journal / AI. */
export function toAdvisorUpdatedAtUtc(ms: number): string {
  return new Date(ms).toISOString();
}

export function mapAdvisorActionCode(
  action: PositionAdvisorV41Action | 'WAITING_FILL',
): V41AdvisorActionCode {
  if (action === 'WAITING_FILL') return 'WAITING_FILL';
  return action;
}

/**
 * Map reason code từ output evaluatePositionV41 — không parse UI text.
 * Dựa trên action + reason string có sẵn từ engine.
 */
export function mapAdvisorReasonCode(
  result: PositionAdvisorV41Result,
): V41AdvisorReasonCode {
  const reason = result.reason.toLowerCase();

  if (result.action === 'TRAILING_STOP') return 'TRAILING_STOP';

  if (result.action === 'MOVE_SL_BE') {
    if (reason.includes('50% toward tp1') || reason.includes('break-even')) {
      return 'RR_1_REACHED';
    }
    return 'RR_1_REACHED';
  }

  if (result.action === 'PARTIAL_TP1') return 'TP1_REACHED';
  if (result.action === 'PARTIAL_TP2') return 'TP2_REACHED';

  if (result.action === 'CLOSE_NOW') {
    if (reason.includes('exhaustion')) return 'EXHAUSTION';
    if (reason.includes('volatility') || reason.includes('stophunt') || reason.includes('earlywarning')) {
      return 'PROTECTION_TRIGGER';
    }
    if (reason.includes('reversal')) return 'REVERSAL_SIGNAL';
    if (reason.includes('opposes')) return 'MARKET_OPPOSES';
    if (reason.includes('momentum reversal')) return 'MOMENTUM_WEAK';
    return 'PROTECTION_TRIGGER';
  }

  if (result.action === 'HOLD') {
    if (reason.includes('passed tp1') || reason.includes('strong trend')) {
      return 'MOMENTUM_STRONG';
    }
    if (reason.includes('no higher-priority')) return 'HOLD_DEFAULT';
    return 'MOMENTUM_STRONG';
  }

  return 'HOLD_DEFAULT';
}

export function waitingFillReasonCode(): V41AdvisorReasonCode {
  return 'WAITING_FILL';
}

export function snapshotStaleReasonCode(): V41AdvisorReasonCode {
  return 'SNAPSHOT_STALE';
}
