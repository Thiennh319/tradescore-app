import type {
  AiTradeJournalEntry,
  PartialCloseReason,
  PartialCloseRecord,
} from '../constants/aiJournal';
import type { RecommendationType } from './positionAdvisorV3';
import { computePositionPnl } from '../utils/positionPnl';

export function partialClosePercentForReason(reason: PartialCloseReason): number {
  switch (reason) {
    case 'PARTIAL_TP1':
      return 50;
    case 'PARTIAL_TP2':
    case 'PARTIAL_CLOSE_30':
      return 30;
    default:
      return 0;
  }
}

export function recommendationTypeToPartialReason(
  type: RecommendationType,
): PartialCloseReason | null {
  switch (type) {
    case 'PARTIAL_TP1':
      return 'PARTIAL_TP1';
    case 'PARTIAL_TP2':
      return 'PARTIAL_TP2';
    case 'PARTIAL_CLOSE_30':
      return 'PARTIAL_CLOSE_30';
    default:
      return null;
  }
}

export function sumPartialClosePercent(records: readonly PartialCloseRecord[]): number {
  return records.reduce((sum, record) => sum + record.partialClosePercent, 0);
}

export function sumRealizedPartialPnl(records: readonly PartialCloseRecord[]): number {
  return records.reduce((sum, record) => sum + record.realizedPnlUSDT, 0);
}

export function partialCloseBadgeLabel(records: readonly PartialCloseRecord[]): string | null {
  const total = sumPartialClosePercent(records);
  if (total <= 0) return null;
  return `Đã chốt ${total}%`;
}

export function partialCloseConfirmMessage(reason: PartialCloseReason): string {
  const pct = partialClosePercentForReason(reason);
  return `Chốt ${pct}% vị thế tại giá hiện tại?`;
}

export function resolveOriginalSizeUsdt(entry: AiTradeJournalEntry): number {
  return entry.plan.sizeOriginal ?? entry.plan.sizeActual;
}

export type ApplyPartialCloseResult =
  | { ok: true; entry: AiTradeJournalEntry; record: PartialCloseRecord }
  | { ok: false; error: string };

export function applyPartialCloseToEntry(
  entry: AiTradeJournalEntry,
  markPrice: number,
  reason: PartialCloseReason,
  leverage: number,
  now: number = Date.now(),
): ApplyPartialCloseResult {
  if (entry.outcome.status !== 'OPEN') {
    return { ok: false, error: 'Chỉ chốt một phần khi lệnh đang OPEN' };
  }
  if (!Number.isFinite(markPrice) || markPrice <= 0) {
    return { ok: false, error: 'Giá mark không hợp lệ' };
  }

  const closePercent = partialClosePercentForReason(reason);
  if (closePercent <= 0) {
    return { ok: false, error: 'Lý do chốt một phần không hợp lệ' };
  }

  const prior = entry.partialCloses ?? [];
  const alreadyClosedPercent = sumPartialClosePercent(prior);
  if (alreadyClosedPercent + closePercent > 100) {
    return {
      ok: false,
      error: `Không thể chốt thêm ${closePercent}% — đã chốt ${alreadyClosedPercent}%`,
    };
  }

  const sizeOriginal = resolveOriginalSizeUsdt(entry);
  if (sizeOriginal <= 0) {
    return { ok: false, error: 'Size lệnh không hợp lệ' };
  }

  const closedSizeUsdt = (sizeOriginal * closePercent) / 100;
  const remainingSize = entry.plan.sizeActual - closedSizeUsdt;
  if (remainingSize <= 0 || closedSizeUsdt <= 0) {
    return { ok: false, error: 'Không còn size để chốt' };
  }

  const snap = computePositionPnl(
    {
      direction: entry.scoring.direction,
      entryPrice: entry.market.entryPrice,
      leverage,
      size: closedSizeUsdt,
    },
    markPrice,
  );

  const record: PartialCloseRecord = {
    partialClosePercent: closePercent,
    partialClosePrice: markPrice,
    partialCloseTime: now,
    partialCloseReason: reason,
    realizedPnlUSDT: snap.pnlUsdt ?? 0,
    realizedPnlPct: snap.pnlPercent ?? 0,
    closedSizeUsdt,
  };

  const nextEntry: AiTradeJournalEntry = {
    ...entry,
    plan: {
      ...entry.plan,
      sizeOriginal,
      sizeActual: Math.round(remainingSize * 100) / 100,
    },
    partialCloses: [...prior, record],
  };

  return { ok: true, entry: nextEntry, record };
}
