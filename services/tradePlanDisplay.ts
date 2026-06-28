import type { TradeDecisionLabel, TradePlanV3 } from './scoring';

/** Quyết định cuối cùng cho UI Trade Plan (FOMO guard). */
export type FinalEntryDecision = TradeDecisionLabel | 'HARD_BLOCK';

export function resolveFinalEntryDecision(input: {
  decisionLabel: TradeDecisionLabel;
  hardBlocked: boolean;
  awaitingRescore?: boolean;
}): FinalEntryDecision {
  if (input.hardBlocked) return 'HARD_BLOCK';
  if (input.awaitingRescore || input.decisionLabel === 'CHO_TAI_CHAM') {
    return 'CHO_TAI_CHAM';
  }
  return input.decisionLabel;
}

export function isBlockedFinalDecision(decision: FinalEntryDecision): boolean {
  return decision === 'KHONG_VAO' || decision === 'HARD_BLOCK';
}

export function isWaitFinalDecision(decision: FinalEntryDecision): boolean {
  return decision === 'CHO_THEM' || decision === 'CHO_TAI_CHAM';
}

export function shouldShowTpLevels(decision: FinalEntryDecision): boolean {
  return !isBlockedFinalDecision(decision);
}

export function shouldShowWinProbability(decision: FinalEntryDecision): boolean {
  return !isBlockedFinalDecision(decision);
}

export function shouldShowExpectedValue(decision: FinalEntryDecision): boolean {
  return !isBlockedFinalDecision(decision);
}

export function shouldShowRrScore(decision: FinalEntryDecision): boolean {
  return !isBlockedFinalDecision(decision);
}

export function shouldShowWaitBanner(decision: FinalEntryDecision): boolean {
  return isWaitFinalDecision(decision);
}

export function isRrBlockReason(reason: string): boolean {
  return /R:R/i.test(reason);
}

export function planBlockedByRr(plan: Pick<TradePlanV3, 'blockReasons'>): boolean {
  return plan.blockReasons.some(isRrBlockReason);
}

/** Dòng lý do chặn hiển thị đỏ — HARD BLOCK + blockReasons từ plan. */
export function buildProminentBlockReasons(
  finalDecision: FinalEntryDecision,
  plan: Pick<TradePlanV3, 'blockReasons'>,
  hardBlockReasons: string[],
): string[] {
  const lines: string[] = [];

  if (finalDecision === 'HARD_BLOCK') {
    for (const reason of hardBlockReasons) {
      lines.push(reason.startsWith('❌') ? reason : `❌ HARD BLOCK: ${reason}`);
    }
  }

  for (const reason of plan.blockReasons) {
    if (lines.includes(reason)) continue;
    lines.push(reason.startsWith('❌') ? reason : `❌ ${reason}`);
  }

  return lines;
}

export interface HardBlockSnapInput {
  direction: 'LONG' | 'SHORT';
  mandatoryViolations: string[];
  groupBlocks?: string[];
  longHardBlocks?: string[];
  shortHardBlocks?: string[];
  hardBlocked?: boolean;
  lockedPlanHealthStatus?: 'STRONG' | 'NORMAL' | 'WEAK' | 'CRITICAL';
  isNearEntryZone?: boolean;
}

/**
 * L3 MACD là chỉ báo lagging, dễ "vi phạm" khi giá đang test đúng
 * vùng entry (S/R). Khi đang Locked Plan + giá gần entry + Plan Health
 * chưa tới mức CRITICAL, ẨN riêng lý do L3 MACD khỏi hardBlocks hiển thị
 * (không xóa khỏi snapshot gốc — chỉ lọc tại tầng hiển thị này).
 * Các hard block khác (BTC, Funding, CVD, L9, L10) KHÔNG bị lọc.
 */
function isMacdHardBlockReason(reason: string): boolean {
  return reason.startsWith('L3 MACD vi phạm');
}

function shouldSuppressMacdBlock(
  isNearEntryZone: boolean | undefined,
  lockedPlanHealthStatus: HardBlockSnapInput['lockedPlanHealthStatus'],
): boolean {
  if (!isNearEntryZone) return false;
  if (lockedPlanHealthStatus == null) return false;
  return lockedPlanHealthStatus !== 'CRITICAL';
}

export function collectHardBlockReasons(snap: HardBlockSnapInput): string[] {
  const sideBlocks =
    snap.direction === 'LONG'
      ? (snap.longHardBlocks ?? [])
      : (snap.shortHardBlocks ?? []);

  const rawReasons =
    sideBlocks.length > 0
      ? sideBlocks
      : !snap.hardBlocked
        ? []
        : snap.mandatoryViolations.filter(
            (v) => !new Set(snap.groupBlocks ?? []).has(v),
          );

  if (rawReasons.length === 0) return [];

  const suppressMacd = shouldSuppressMacdBlock(
    snap.isNearEntryZone,
    snap.lockedPlanHealthStatus,
  );

  if (!suppressMacd) return rawReasons;

  return rawReasons.filter((reason) => !isMacdHardBlockReason(reason));
}
