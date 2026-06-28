import type {
  AiTradeJournalEntry,
  PositionAdvisorActionAtExit,
  PlanHealthAtExit,
} from '../constants/aiJournal';
import type { ScorerVersion } from '../constants/scoring';
import type { FundingState } from '../constants/scoring';
import type { SignalRow } from '../hooks/useSignalBoard';
import type { LockedTradePlan } from '../constants/aiJournal';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import type { ScoringResultV3 } from './scorerV3';
import type { ScoringResultV4 } from './scorerV4';
import { scoringResultV3FromSignalRow } from './signalRowView';
import { scoringResultV4ToLegacyV3 } from './tradePlanV4';
import {
  evaluatePositionV2,
  type PositionRecommendation,
} from './positionAdvisorV3';
import { computePositionMaxLossUSDT, evaluatePositionV4 } from './positionAdvisorV4';

export interface CloseAdvisorContext {
  positionAdvisorActionAtExit: PositionAdvisorActionAtExit;
  scoringDecisionAtExit: string | null;
  planHealthAtExit: PlanHealthAtExit | null;
  recommendationLabel: string;
  hasClearRecommendation: boolean;
}

export function mapRecommendationToAdvisorActionAtExit(
  rec: PositionRecommendation | null,
  options?: { planExpired?: boolean },
): PositionAdvisorActionAtExit {
  if (options?.planExpired) return 'PLAN_EXPIRED';
  if (!rec) return 'NO_ACTIVE_ADVISOR';

  const rule = rec.triggeredBy;
  if (rule === 'FUNDING_REVERSAL') return 'FUNDING_REVERSAL';
  if (rule === 'SQUEEZE_RISK_ALERT') return 'SQUEEZE_ALERT';
  if (rule === 'MOVE_SL_BE') return 'MOVE_SL_BE';

  switch (rec.type) {
    case 'HOLD':
      return rule === 'HOLD_STRONG' ? 'HOLD_STRONG' : 'HOLD_CONDITIONAL';
    case 'HOLD_MOVE_SL':
      return rule === 'MOVE_SL_BE' ? 'MOVE_SL_BE' : 'MOVE_SL_TIGHTER';
    case 'PARTIAL_CLOSE_30':
      return 'PARTIAL_CLOSE_30';
    case 'PARTIAL_TP1':
    case 'PARTIAL_TP2':
      return 'PARTIAL_TP1';
    case 'CLOSE_NOW':
    case 'CLOSE_REVERSE':
      return 'CLOSE_NOW';
    case 'CLOSE_URGENT':
      return 'CLOSE_URGENT';
    default:
      return 'NO_ACTIVE_ADVISOR';
  }
}

/** Nhãn ngắn cho dialog xác nhận đóng lệnh */
export function advisorActionCompactLabel(action: PositionAdvisorActionAtExit): string {
  switch (action) {
    case 'HOLD_STRONG':
    case 'HOLD_CONDITIONAL':
      return '🟢 GIỮ LỆNH';
    case 'PARTIAL_CLOSE_30':
    case 'PARTIAL_TP1':
    case 'MOVE_SL_BE':
    case 'MOVE_SL_TIGHTER':
      return '🟡 CHỐT MỘT PHẦN';
    case 'CLOSE_NOW':
    case 'CLOSE_URGENT':
      return '🔴 ĐÓNG LỆNH';
    case 'FUNDING_REVERSAL':
    case 'SQUEEZE_ALERT':
      return '🟠 CẢNH BÁO — XEM XÉT ĐÓNG';
    case 'PLAN_EXPIRED':
      return '⏱ PLAN HẾT HẠN';
    default:
      return '⚪ Không có khuyến nghị';
  }
}

export function advisorActionDisplayLabel(action: PositionAdvisorActionAtExit): string {
  const labels: Record<PositionAdvisorActionAtExit, string> = {
    HOLD_STRONG: '🟢 GIỮ LỆNH (Hold Strong)',
    HOLD_CONDITIONAL: '🟡 GIỮ CÓ ĐIỀU KIỆN (Hold Conditional)',
    PARTIAL_CLOSE_30: '🟠 CHỐT 30% (Partial Close)',
    PARTIAL_TP1: '🟠 CHỐT TP1 (Partial TP1)',
    CLOSE_NOW: '🔴 ĐÓNG NGAY (Close Now)',
    CLOSE_URGENT: '🚨 ĐÓNG KHẨN CẤP (Close Urgent)',
    MOVE_SL_BE: '🔵 DỜI SL VỀ BE',
    MOVE_SL_TIGHTER: '🔵 SIẾT SL CHẶT HƠN',
    FUNDING_REVERSAL: '⚠️ CẢNH BÁO FUNDING ĐẢO CHIỀU',
    SQUEEZE_ALERT: '⚠️ CẢNH BÁO SQUEEZE RISK',
    PLAN_EXPIRED: '⏱ PLAN HẾT HẠN',
    NO_ACTIVE_ADVISOR: '— Không có khuyến nghị Position Advisor',
  };
  return labels[action];
}

export function isAdvisorCloseAction(action: PositionAdvisorActionAtExit): boolean {
  return (
    action === 'PARTIAL_CLOSE_30' ||
    action === 'PARTIAL_TP1' ||
    action === 'CLOSE_NOW' ||
    action === 'CLOSE_URGENT' ||
    action === 'FUNDING_REVERSAL' ||
    action === 'SQUEEZE_ALERT' ||
    action === 'PLAN_EXPIRED'
  );
}

export function isAdvisorHoldAction(action: PositionAdvisorActionAtExit): boolean {
  return (
    action === 'HOLD_STRONG' ||
    action === 'HOLD_CONDITIONAL' ||
    action === 'MOVE_SL_BE' ||
    action === 'MOVE_SL_TIGHTER'
  );
}

export function hasClearAdvisorRecommendation(action: PositionAdvisorActionAtExit): boolean {
  return action !== 'NO_ACTIVE_ADVISOR';
}

/** Trader chọn "Theo khuyến nghị app" trên dialog đóng lệnh */
export function followedAdvisorFromManualReason(
  reason: import('../constants/aiJournal').ManualExitReason | null,
): boolean {
  return reason === 'FOLLOW_ADVISOR';
}

export const MANUAL_EXIT_REASON_OPTIONS: ReadonlyArray<{
  value: import('../constants/aiJournal').ManualExitReason;
  label: string;
}> = [
  { value: 'FOLLOW_ADVISOR', label: 'Theo khuyến nghị app' },
  { value: 'TAKE_PROFIT_MANUAL', label: 'Chốt lời thủ công' },
  { value: 'CUT_LOSS_MANUAL', label: 'Cắt lỗ thủ công' },
  { value: 'PLAN_CHANGED', label: 'Thay đổi kế hoạch' },
  { value: 'OTHER', label: 'Lý do khác' },
];

function pnlFromPrices(
  entryPrice: number,
  currentPrice: number,
  direction: 'LONG' | 'SHORT',
  size: number,
  leverage: number,
): { pct: number; usdt: number } {
  const units = (size * leverage) / entryPrice;
  const priceDiff = direction === 'LONG' ? currentPrice - entryPrice : entryPrice - currentPrice;
  return {
    pct: (priceDiff / entryPrice) * 100 * leverage,
    usdt: priceDiff * units,
  };
}

function resolveAdvisorScoring(
  entry: AiTradeJournalEntry,
  scorerVersion: ScorerVersion,
  signalRow: SignalRow | null | undefined,
  scoringResultV4: ScoringResultV4 | null | undefined,
  scoringResultV3: ScoringResultV3 | null | undefined,
): ScoringResultV3 | null {
  if (signalRow) {
    return scoringResultV3FromSignalRow(signalRow, scorerVersion);
  }
  if (scorerVersion === 'v4' && scoringResultV4) {
    return scoringResultV4ToLegacyV3(scoringResultV4);
  }
  return scoringResultV3 ?? null;
}

/** Đánh giá Position Advisor tại thời điểm đóng — không đổi logic advisor. */
export function buildCloseAdvisorContext(input: {
  entry: AiTradeJournalEntry;
  markPrice: number | null | undefined;
  scorerVersion: ScorerVersion;
  signalRow?: SignalRow | null;
  scoringResultV4?: ScoringResultV4 | null;
  scoringResultV3?: ScoringResultV3 | null;
  lockedPlan?: LockedTradePlan | null;
  currentFundingState?: FundingState;
  currentSqueezeRisk?: SqueezeRiskResult | null;
  planExpired?: boolean;
}): CloseAdvisorContext {
  const {
    entry,
    markPrice,
    scorerVersion,
    signalRow,
    scoringResultV4,
    scoringResultV3,
    lockedPlan,
    currentFundingState,
    currentSqueezeRisk,
    planExpired,
  } = input;

  const planHealthAtExit: PlanHealthAtExit | null =
    lockedPlan?.symbol === entry.symbol &&
    lockedPlan.lockedDirection === entry.scoring.direction
      ? (lockedPlan.planHealth?.status ?? null)
      : null;

  const advisorScoring = resolveAdvisorScoring(
    entry,
    scorerVersion,
    signalRow,
    scoringResultV4,
    scoringResultV3,
  );

  const price =
    markPrice ??
    entry.market.priceAtAnalysis ??
    entry.market.entryPrice;

  let recommendation: PositionRecommendation | null = null;
  let scoringDecisionAtExit: string | null = null;

  if (advisorScoring && price != null && Number.isFinite(price)) {
    const ownScore =
      entry.scoring.direction === 'LONG' ? advisorScoring.long : advisorScoring.short;
    const oppositeScore =
      entry.scoring.direction === 'LONG' ? advisorScoring.short : advisorScoring.long;
    scoringDecisionAtExit = ownScore.decision;

    const sl = entry.plan.slActual || entry.plan.slProposed;
    const size = entry.plan.sizeActual || entry.plan.sizeProposed;
    const leverage = 5;
    const pnl = pnlFromPrices(entry.market.entryPrice, price, entry.scoring.direction, size, leverage);

    const advisorInput = {
      position: {
        direction: entry.scoring.direction,
        entryPrice: entry.market.entryPrice,
        sl,
        tp1: entry.plan.tp1Actual || entry.plan.tp1Proposed,
        tp2: entry.plan.tp2,
        tp3: entry.plan.tp3,
        openedAt: entry.timestamp,
        openTime: entry.timestamp,
        currentPnlPct: pnl.pct,
        currentPnlUSDT: pnl.usdt,
        lastFundingState: entry.lastFundingState,
        lastSqueezeRiskLevel: entry.lastSqueezeRiskLevel,
        lastSqueezeRiskDirection: entry.lastSqueezeRiskDirection,
        maxLossUSDT: computePositionMaxLossUSDT(
          entry.market.entryPrice,
          sl,
          size,
          leverage,
        ),
      },
      currentPrice: price,
      ownDirectionScore: {
        totalScore: ownScore.totalScore,
        direction: entry.scoring.direction,
        groupScores: ownScore.groupScores,
        decision: ownScore.decision,
        hardBlocks: ownScore.hardBlocks,
        groupBlocks: ownScore.groupBlocks,
        warnings: ownScore.warnings,
        layers: ownScore.layers.map((l) => ({
          layerNumber: l.layerNumber,
          score: l.score,
          reason: l.reason,
        })),
      },
      oppositeDirectionScore: {
        totalScore: oppositeScore.totalScore,
        decision: oppositeScore.decision,
        hardBlocks: oppositeScore.hardBlocks,
      },
      marketMode: advisorScoring.marketMode,
      atr1h: signalRow?.atr1h ?? advisorScoring.atr1h,
    };

    recommendation =
      scorerVersion === 'v4'
        ? evaluatePositionV4({
            ...advisorInput,
            currentFundingState,
            currentSqueezeRisk: currentSqueezeRisk ?? undefined,
          })
        : evaluatePositionV2(advisorInput);
  }

  const positionAdvisorActionAtExit = mapRecommendationToAdvisorActionAtExit(recommendation, {
    planExpired,
  });

  return {
    positionAdvisorActionAtExit,
    scoringDecisionAtExit,
    planHealthAtExit,
    recommendationLabel: recommendation?.label ?? advisorActionDisplayLabel(positionAdvisorActionAtExit),
    hasClearRecommendation: hasClearAdvisorRecommendation(positionAdvisorActionAtExit),
  };
}

export function formatAdvisorExitFieldForDisplay(
  value: string | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return value;
}
