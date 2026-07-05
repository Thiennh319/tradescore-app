/**
 * V4.1 — Position Advisor (Bước 7).
 * Đánh giá lệnh đang mở theo MI snapshot + protection hiện tại.
 */

import type { ProtectionSnapshot } from './protectionLayer';
import type { EarlyWarningResult, EarlyWarningSeverity } from './earlyWarningEngine';
import type { ExhaustionResult } from './exhaustionEngine';
import type { MomentumResult } from './momentumEngine1H';
import type { ReversalState } from './reversalDetector';
import type { MarketIntelligenceSnapshot, MarketState } from './types';

export type PositionAdvisorV41Action =
  | 'HOLD'
  | 'CLOSE_NOW'
  | 'MOVE_SL_BE'
  | 'PARTIAL_TP1'
  | 'PARTIAL_TP2'
  | 'TRAILING_STOP';

export type PositionAdvisorV41Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PositionAdvisorV41Result {
  action: PositionAdvisorV41Action;
  label: string;
  urgency: PositionAdvisorV41Urgency;
  breakEvenSuggested: boolean;
  breakEvenPrice: number | null;
  trailingStopSuggested: boolean;
  trailingStopPrice: number | null;
  reason: string;
}

export interface PositionAdvisorV41OpenPosition {
  entryPrice: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  openedAt: number;
}

export interface PositionAdvisorV41Params {
  snapshot: MarketIntelligenceSnapshot;
  protection: ProtectionSnapshot;
  openPosition: PositionAdvisorV41OpenPosition;
  markPrice: number;
  earlyWarning?: EarlyWarningResult & { severity: EarlyWarningSeverity };
  reversalState?: ReversalState;
  momentum?: MomentumResult;
  exhaustion?: ExhaustionResult;
}

const TP_TOUCH_EPSILON_RATIO = 0.001;

function tpEpsilon(tp: number): number {
  return Math.max(Math.abs(tp) * TP_TOUCH_EPSILON_RATIO, 1e-8);
}

function hasReachedTp(mark: number, tp: number, direction: 'LONG' | 'SHORT'): boolean {
  const eps = tpEpsilon(tp);
  if (direction === 'LONG') return mark >= tp - eps;
  return mark <= tp + eps;
}

function hasPassedTp(mark: number, tp: number, direction: 'LONG' | 'SHORT'): boolean {
  const eps = tpEpsilon(tp);
  if (direction === 'LONG') return mark > tp + eps;
  return mark < tp - eps;
}

function neutralResult(
  overrides: Partial<PositionAdvisorV41Result> = {},
): PositionAdvisorV41Result {
  return {
    action: 'HOLD',
    label: 'Giữ lệnh',
    urgency: 'LOW',
    breakEvenSuggested: false,
    breakEvenPrice: null,
    trailingStopSuggested: false,
    trailingStopPrice: null,
    reason: '',
    ...overrides,
  };
}

export function computeCurrentPnlPct(
  entryPrice: number,
  markPrice: number,
  direction: 'LONG' | 'SHORT',
  leverage: number,
): number {
  if (entryPrice <= 0 || !Number.isFinite(entryPrice)) return 0;
  const raw =
    direction === 'LONG'
      ? (markPrice - entryPrice) / entryPrice
      : (entryPrice - markPrice) / entryPrice;
  return raw * leverage * 100;
}

function computeMaxLossUsdt(
  entryPrice: number,
  sl: number,
  direction: 'LONG' | 'SHORT',
  size: number,
  leverage: number,
): number {
  const slDistance =
    direction === 'LONG'
      ? Math.max(0, (entryPrice - sl) / entryPrice)
      : Math.max(0, (sl - entryPrice) / entryPrice);
  return slDistance * size * leverage;
}

function computeCurrentPnlUsdt(
  entryPrice: number,
  markPrice: number,
  direction: 'LONG' | 'SHORT',
  size: number,
  leverage: number,
): number {
  return (computeCurrentPnlPct(entryPrice, markPrice, direction, leverage) / 100) * size;
}

function isOppositeMarketState(
  marketState: MarketState,
  direction: 'LONG' | 'SHORT',
): boolean {
  return (
    (direction === 'LONG' && marketState === 'Distribution') ||
    (direction === 'SHORT' && marketState === 'Accumulation')
  );
}

function isTrendReversalAgainstPosition(
  snapshot: MarketIntelligenceSnapshot,
  direction: 'LONG' | 'SHORT',
): boolean {
  if (snapshot.trendStrength < 60) return false;
  return (
    (direction === 'LONG' && snapshot.trendDirection === 'BEAR') ||
    (direction === 'SHORT' && snapshot.trendDirection === 'BULL')
  );
}

function isEarlyWarningDirectionAffected(
  earlyWarning: EarlyWarningResult & { severity: EarlyWarningSeverity },
  positionDirection: 'LONG' | 'SHORT',
): boolean {
  if (earlyWarning.severity === 'CLEAR') return false;
  if (earlyWarning.direction === 'BOTH') return true;
  return earlyWarning.direction === positionDirection;
}

function isSlAtBreakEven(
  sl: number,
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
): boolean {
  return direction === 'LONG' ? sl >= entryPrice : sl <= entryPrice;
}

function hasProfitTowardTp1(
  markPrice: number,
  entryPrice: number,
  tp1: number,
  direction: 'LONG' | 'SHORT',
  fraction: number,
): boolean {
  if (direction === 'LONG') {
    const target = entryPrice + (tp1 - entryPrice) * fraction;
    return markPrice >= target;
  }
  const target = entryPrice - (entryPrice - tp1) * fraction;
  return markPrice <= target;
}

function isReversalAgainstPosition(
  reversalState: ReversalState,
  positionDirection: 'LONG' | 'SHORT',
): boolean {
  if (reversalState.counterDirection == null) return false;
  return reversalState.counterDirection !== positionDirection;
}

function evaluateReversalDetected(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { reversalState, openPosition, markPrice } = params;
  if (!reversalState) return null;
  if (
    reversalState.phase !== 'WATCHING' &&
    reversalState.phase !== 'RETEST_CONFIRMED'
  ) {
    return null;
  }
  if (!isReversalAgainstPosition(reversalState, openPosition.direction)) return null;

  const pnl = computeCurrentPnlUsdt(
    openPosition.entryPrice,
    markPrice,
    openPosition.direction,
    openPosition.size,
    openPosition.leverage,
  );
  const label =
    pnl >= 0
      ? 'Chốt lời — Đảo chiều đang xác nhận'
      : 'Đóng khẩn cấp — Đảo chiều đang xác nhận';

  return neutralResult({
    action: 'CLOSE_NOW',
    urgency: 'CRITICAL',
    label,
    reason: 'reversal WATCHING/RETEST_CONFIRMED (priority 115)',
  });
}

function evaluateEarlyWarningBlock(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { earlyWarning, openPosition, markPrice } = params;
  if (!earlyWarning || earlyWarning.severity !== 'BLOCK') return null;
  if (!isEarlyWarningDirectionAffected(earlyWarning, openPosition.direction)) return null;

  const pnl = computeCurrentPnlUsdt(
    openPosition.entryPrice,
    markPrice,
    openPosition.direction,
    openPosition.size,
    openPosition.leverage,
  );
  const label =
    pnl >= 0
      ? 'Chốt lời ngay — đảo chiều xác nhận 30M+1H'
      : 'Đóng khẩn cấp — đảo chiều xác nhận 30M+1H';

  return neutralResult({
    action: 'CLOSE_NOW',
    urgency: 'CRITICAL',
    label,
    reason: 'earlyWarning BLOCK (priority 110)',
  });
}

/** RULE 0D — MOMENTUM_REVERSAL (priority 108). */
function evaluateMomentumReversal(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { momentum, snapshot, openPosition, markPrice } = params;
  if (!momentum) return null;
  if (snapshot.trendExhaustion < 60) return null;

  const { entryPrice, direction, tp1 } = openPosition;
  const counterMomentumConfirmed =
    direction === 'LONG'
      ? momentum.momentumConfirmedShort
      : momentum.momentumConfirmedLong;

  if (!counterMomentumConfirmed) return null;

  const counterLabel = direction === 'LONG' ? 'SHORT' : 'LONG';

  if (hasProfitTowardTp1(markPrice, entryPrice, tp1, direction, 0.5)) {
    return neutralResult({
      action: 'PARTIAL_TP1',
      urgency: 'HIGH',
      label: `Chốt 50% — Momentum ${counterLabel} xuất hiện`,
      reason: 'momentum reversal with ≥50% toward TP1 (priority 108)',
    });
  }

  return neutralResult({
    action: 'MOVE_SL_BE',
    urgency: 'MEDIUM',
    breakEvenSuggested: true,
    breakEvenPrice: entryPrice,
    label: `Siết SL — Momentum ${counterLabel} xuất hiện`,
    reason: 'momentum reversal with <50% toward TP1 (priority 108)',
  });
}

function evaluateEarlyWarningHard(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { earlyWarning, openPosition, markPrice } = params;
  if (!earlyWarning || earlyWarning.severity !== 'WARNING_HARD') return null;
  if (!isEarlyWarningDirectionAffected(earlyWarning, openPosition.direction)) return null;

  const { entryPrice, direction, sl, tp1 } = openPosition;

  if (isSlAtBreakEven(sl, entryPrice, direction)) {
    return neutralResult({
      urgency: 'MEDIUM',
      label: 'Giữ — SL đã an toàn',
      reason: 'earlyWarning WARNING_HARD with SL at break-even (priority 105)',
    });
  }

  if (
    hasProfitTowardTp1(markPrice, entryPrice, tp1, direction, 0.3) &&
    !isSlAtBreakEven(sl, entryPrice, direction)
  ) {
    return neutralResult({
      action: 'MOVE_SL_BE',
      urgency: 'HIGH',
      breakEvenSuggested: true,
      breakEvenPrice: entryPrice,
      label: 'Siết SL về entry — cảnh báo đảo chiều 1H',
      reason: 'earlyWarning WARNING_HARD with ≥30% toward TP1 (priority 105)',
    });
  }

  return neutralResult({
    urgency: 'MEDIUM',
    label: 'Theo dõi sát — cảnh báo 1H',
    reason: 'earlyWarning WARNING_HARD (priority 105)',
  });
}

function evaluateEarlyWarningSoft(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { earlyWarning, openPosition } = params;
  if (!earlyWarning || earlyWarning.severity !== 'WARNING_SOFT') return null;
  if (!isEarlyWarningDirectionAffected(earlyWarning, openPosition.direction)) return null;

  return neutralResult({
    urgency: 'LOW',
    label: 'Giữ — tín hiệu 30M, theo dõi thêm',
    reason: 'earlyWarning WARNING_SOFT (priority 100)',
  });
}

function evaluateEarlyWarningRules(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  return (
    evaluateEarlyWarningBlock(params) ??
    evaluateMomentumReversal(params) ??
    evaluateEarlyWarningHard(params) ??
    evaluateEarlyWarningSoft(params)
  );
}

/** RULE EXHAUSTION_RESCUE (priority 85) — giữ lệnh lỗ khi exhaustion cùng hướng. */
function evaluateExhaustionRescue(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { exhaustion, openPosition, markPrice } = params;
  if (!exhaustion?.exhaustionDetected) return null;
  if (exhaustion.direction === 'NONE') return null;
  if (exhaustion.direction !== openPosition.direction) return null;

  const pnl = computeCurrentPnlUsdt(
    openPosition.entryPrice,
    markPrice,
    openPosition.direction,
    openPosition.size,
    openPosition.leverage,
  );
  if (pnl >= 0) return null;

  return neutralResult({
    urgency: 'LOW',
    label: `Giữ — Exhaustion ${exhaustion.exhaustionType} có thể đảo chiều`,
    reason: `exhaustion ${exhaustion.exhaustionType} same direction while losing (priority 85)`,
  });
}

function evaluateCriticalClose(
  params: PositionAdvisorV41Params,
): PositionAdvisorV41Result | null {
  const { snapshot, protection, openPosition, markPrice } = params;
  const { entryPrice, direction, size, leverage, sl } = openPosition;

  if (protection.volatilityRisk === 'EXTREME') {
    return neutralResult({
      action: 'CLOSE_NOW',
      urgency: 'CRITICAL',
      label: 'Đóng khẩn cấp — biến động EXTREME',
      reason: 'protection.volatilityRisk = EXTREME',
    });
  }

  if (protection.stopHuntDetected) {
    const maxLoss = computeMaxLossUsdt(entryPrice, sl, direction, size, leverage);
    const pnl = computeCurrentPnlUsdt(entryPrice, markPrice, direction, size, leverage);
    if (pnl < 0 && Math.abs(pnl) > maxLoss * 0.3) {
      return neutralResult({
        action: 'CLOSE_NOW',
        urgency: 'CRITICAL',
        label: 'Đóng khẩn cấp — stop hunt + lỗ > 30% maxLoss',
        reason: 'stopHuntDetected with loss exceeding 30% of maxLoss',
      });
    }
  }

  if (isOppositeMarketState(snapshot.marketState, direction)) {
    const stateLabel =
      snapshot.marketState === 'Distribution' ? 'Distribution' : 'Accumulation';
    return neutralResult({
      action: 'CLOSE_NOW',
      urgency: 'CRITICAL',
      label: `Đóng khẩn cấp — ${stateLabel} ngược hướng lệnh`,
      reason: `marketState ${snapshot.marketState} opposes ${direction}`,
    });
  }

  if (isTrendReversalAgainstPosition(snapshot, direction)) {
    return neutralResult({
      action: 'CLOSE_NOW',
      urgency: 'CRITICAL',
      label: 'Đóng khẩn cấp — trend đảo ngược mạnh',
      reason: `trendDirection ${snapshot.trendDirection} with trendStrength ${snapshot.trendStrength}`,
    });
  }

  return null;
}

function holdLabelForMarketState(marketState: MarketState): string {
  switch (marketState) {
    case 'StrongUptrend':
    case 'StrongDowntrend':
      return 'Giữ lệnh — trend mạnh';
    case 'HealthyUptrend':
    case 'WeakDowntrend':
      return 'Giữ lệnh — theo dõi';
    case 'LateUptrend':
    case 'Distribution':
      return 'Giữ lệnh — cẩn thận cuối trend';
    case 'Transition':
      return 'Giữ lệnh — thị trường chuyển pha';
    case 'Accumulation':
      return 'Giữ lệnh — tích lũy';
    default:
      return 'Giữ lệnh';
  }
}

export function evaluatePositionV41(params: PositionAdvisorV41Params): PositionAdvisorV41Result {
  const { snapshot, openPosition, markPrice } = params;
  const { entryPrice, direction, sl, tp1, tp2 } = openPosition;

  const reversalResult = evaluateReversalDetected(params);
  if (reversalResult) return reversalResult;

  const earlyWarningResult = evaluateEarlyWarningRules(params);
  if (earlyWarningResult) return earlyWarningResult;

  const critical = evaluateCriticalClose(params);
  if (critical) return critical;

  if (hasReachedTp(markPrice, tp1, direction) && !hasPassedTp(markPrice, tp1, direction)) {
    return neutralResult({
      action: 'PARTIAL_TP1',
      urgency: 'MEDIUM',
      label: 'Chốt 50% tại TP1',
      reason: 'markPrice reached TP1',
    });
  }

  if (hasReachedTp(markPrice, tp2, direction) && !hasPassedTp(markPrice, tp2, direction)) {
    return neutralResult({
      action: 'PARTIAL_TP2',
      urgency: 'MEDIUM',
      label: 'Chốt thêm 30% tại TP2',
      reason: 'markPrice reached TP2',
    });
  }

  const halfwayToTp1 =
    direction === 'LONG'
      ? entryPrice + (tp1 - entryPrice) * 0.5
      : entryPrice - (entryPrice - tp1) * 0.5;
  const reachedHalfway =
    direction === 'LONG' ? markPrice >= halfwayToTp1 : markPrice <= halfwayToTp1;
  const notYetBreakEven =
    direction === 'LONG' ? sl < entryPrice : sl > entryPrice;

  if (reachedHalfway && notYetBreakEven) {
    return neutralResult({
      action: 'MOVE_SL_BE',
      urgency: 'MEDIUM',
      breakEvenSuggested: true,
      breakEvenPrice: entryPrice,
      label: 'Dời SL về entry — bảo vệ vốn',
      reason: 'profit reached 50% toward TP1 and SL not yet at break-even',
    });
  }

  if (hasPassedTp(markPrice, tp1, direction) && snapshot.trendStrength >= 60) {
    const trailingStopPrice =
      direction === 'LONG' ? markPrice * 0.985 : markPrice * 1.015;
    return neutralResult({
      action: 'TRAILING_STOP',
      urgency: 'LOW',
      trailingStopSuggested: true,
      trailingStopPrice,
      label: 'Trailing stop — trend còn mạnh',
      reason: 'markPrice passed TP1 with strong trend',
    });
  }

  const exhaustionRescue = evaluateExhaustionRescue(params);
  if (exhaustionRescue) return exhaustionRescue;

  const holdLabel = holdLabelForMarketState(snapshot.marketState);
  return neutralResult({
    label: holdLabel,
    reason: 'no higher-priority rule matched',
  });
}
