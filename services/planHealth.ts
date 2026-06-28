import { FundingState } from '../constants/scoring';
import type { PlanHealth, PlanHealthStatus } from '../types/tradePlan';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import type { L6DetailV4 } from './scorerV4';
import type { SignalRow } from './signalBoardScan';

export type L6Detail = Pick<L6DetailV4, 'fundingState'>;

const PENALTY_LABELS: Record<string, string> = {
  SQUEEZE_EXTREME: 'Squeeze EXTREME',
  CVD_DIVERGENCE: 'CVD Divergence',
  FUNDING_REVERSAL: 'Funding Reversal',
  MACD_REVERSAL: 'MACD đảo dấu',
  RSI_EXTREME: 'RSI vùng cực đoan',
};

export function defaultPlanHealth(): PlanHealth {
  return { status: 'STRONG', score: 100, penalties: [], autoCancel: false };
}

export function calculatePlanHealth(
  squeezeRisk: SqueezeRiskResult,
  l6Detail: L6Detail,
  cvdStrength: number,
  tradeSide: 'LONG' | 'SHORT',
  macdHistogram?: { h1: number; h4: number },
  rsi?: { h1: number; h4: number },
): PlanHealth {
  let healthScore = 100;
  const penalties: PlanHealth['penalties'] = [];

  const squeezeAgainstTrade =
    (tradeSide === 'LONG' &&
      squeezeRisk.direction === 'LONG_SQUEEZE' &&
      squeezeRisk.level === 'EXTREME') ||
    (tradeSide === 'SHORT' &&
      squeezeRisk.direction === 'SHORT_SQUEEZE' &&
      squeezeRisk.level === 'EXTREME');

  if (squeezeAgainstTrade) {
    healthScore -= 30;
    penalties.push({ reason: 'SQUEEZE_EXTREME', value: -30 });
  }

  const cvdDivergence =
    (tradeSide === 'LONG' && cvdStrength < 0) ||
    (tradeSide === 'SHORT' && cvdStrength > 0);

  if (cvdDivergence) {
    healthScore -= 25;
    penalties.push({ reason: 'CVD_DIVERGENCE', value: -25 });
  }

  const fundingAgainstTrade =
    (tradeSide === 'LONG' && l6Detail.fundingState === FundingState.LONG_EUPHORIA_FADING) ||
    (tradeSide === 'SHORT' && l6Detail.fundingState === FundingState.SHORT_EUPHORIA_FADING);

  if (fundingAgainstTrade) {
    healthScore -= 20;
    penalties.push({ reason: 'FUNDING_REVERSAL', value: -20 });
  }

  const macdAgainstTrade =
    macdHistogram != null &&
    ((tradeSide === 'LONG' && macdHistogram.h1 < 0 && macdHistogram.h4 < 0) ||
      (tradeSide === 'SHORT' && macdHistogram.h1 > 0 && macdHistogram.h4 > 0));

  if (macdAgainstTrade) {
    healthScore -= 20;
    penalties.push({ reason: 'MACD_REVERSAL', value: -20 });
  }

  const rsiAgainstTrade =
    rsi != null &&
    ((tradeSide === 'LONG' && rsi.h1 > 70 && rsi.h4 > 70) ||
      (tradeSide === 'SHORT' && rsi.h1 < 30 && rsi.h4 < 30));

  if (rsiAgainstTrade) {
    healthScore -= 15;
    penalties.push({ reason: 'RSI_EXTREME', value: -15 });
  }

  let status: PlanHealthStatus = 'STRONG';
  if (healthScore <= 25) status = 'CRITICAL';
  else if (healthScore <= 55) status = 'WEAK';
  else if (healthScore <= 85) status = 'NORMAL';

  // autoCancel dựa trên SỐ LƯỢNG tín hiệu xác nhận đồng thời (>=3),
  // HOẶC khi healthScore đã xuống mức CRITICAL — tránh trường hợp
  // thêm penalty mới (MACD, RSI) làm healthScore xuống thấp nhưng
  // autoCancel không đồng bộ theo (lỗi cũ: autoCancel tính tách rời status).
  const confirmedSignalsCount = [
    squeezeAgainstTrade,
    cvdDivergence,
    fundingAgainstTrade,
    macdAgainstTrade,
    rsiAgainstTrade,
  ].filter(Boolean).length;

  const autoCancel = confirmedSignalsCount >= 3 || status === 'CRITICAL';

  return {
    status,
    score: healthScore,
    penalties,
    autoCancel,
  };
}

export function deriveCvdStrength(l5RawScore: number): number {
  return l5RawScore - 1;
}

export function buildPlanHealthFromSignalRow(
  tradeSide: 'LONG' | 'SHORT',
  row?: Pick<SignalRow, 'squeezeRisk' | 'l6Detail' | 'v4' | 'layers'>,
): PlanHealth {
  if (!row?.squeezeRisk || !row.l6Detail) {
    return defaultPlanHealth();
  }

  const layers =
    tradeSide === 'LONG'
      ? row.v4?.longLayers ?? row.layers
      : row.v4?.shortLayers ?? row.layers;
  const l5Score = layers.find((l) => l.layer === 5)?.score ?? 1;

  // Proxy MACD/RSI từ điểm layer đã chấm (0 = vi phạm cả 2 khung theo guideline 4.2),
  // vì SignalRow chưa lưu raw histogram/RSI value. Đây là ước lượng tạm,
  // đủ để tính đúng penalty mà KHÔNG cần đổi schema SignalRow.
  const l3Score = layers.find((l) => l.layer === 3)?.score ?? 1;
  const l2Score = layers.find((l) => l.layer === 2)?.score ?? 1;

  const macdProxy =
    l3Score === 0
      ? tradeSide === 'LONG'
        ? { h1: -1, h4: -1 }
        : { h1: 1, h4: 1 }
      : tradeSide === 'LONG'
        ? { h1: 1, h4: 1 }
        : { h1: -1, h4: -1 };

  const rsiProxy = l2Score === 0
    ? tradeSide === 'LONG'
      ? { h1: 75, h4: 75 }
      : { h1: 25, h4: 25 }
    : { h1: 50, h4: 50 };

  return calculatePlanHealth(
    row.squeezeRisk,
    row.l6Detail,
    deriveCvdStrength(l5Score),
    tradeSide,
    macdProxy,
    rsiProxy,
  );
}

export function formatPenaltyLabel(reason: string, value: number): string {
  const label = PENALTY_LABELS[reason] ?? reason;
  return `${label} (${value})`;
}

export function formatPlanHealthBadge(planHealth: PlanHealth): string | null {
  switch (planHealth.status) {
    case 'STRONG':
      return null;
    case 'NORMAL':
      return 'Plan ổn định';
    case 'WEAK': {
      const first = planHealth.penalties[0];
      if (!first) return '⚠️ Plan yếu';
      return `⚠️ Plan yếu — ${formatPenaltyLabel(first.reason, first.value)}`;
    }
    case 'CRITICAL':
      return '🚨 Hủy tự động — Multi-confirmation';
    default:
      return null;
  }
}

export function formatMultiConfirmationCancelNote(
  penalties: PlanHealth['penalties'],
): string {
  return penalties.map((p) => p.reason).join(' + ');
}
