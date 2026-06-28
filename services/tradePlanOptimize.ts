import type { AppTradeSymbol, TradeDirection, TradePlan } from '../constants/scoring';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import type { SignalRow } from './signalBoardScan';

/** Ngưỡng tối thiểu (%) để coi là cải thiện đáng kể. */
export const MIN_IMPROVE_PCT = 0.12;

export interface PendingEntryOptimize {
  suggestedEntry: number;
  improvePct: number;
  summary: string;
  plan: TradePlan;
}

export interface LevelImprovement {
  field: 'stopLoss' | 'takeProfit1' | 'takeProfit2' | 'takeProfit3';
  label: string;
  current: number;
  suggested: number;
  improvePct: number;
  reason: string;
}

export interface OpenLevelsOptimize {
  improvements: LevelImprovement[];
  summary: string;
  patch: Pick<
    Partial<StoredTradeJournalEntry>,
    'stopLoss' | 'takeProfit1' | 'takeProfit2' | 'takeProfit3'
  >;
}

export function scanPlanKey(symbol: AppTradeSymbol, direction: TradeDirection): string {
  return `${symbol}:${direction}`;
}

export function buildScanPlansMap(rows: SignalRow[]): Record<string, TradePlan> {
  const map: Record<string, TradePlan> = {};
  for (const row of rows) {
    if (row.tradePlans?.LONG) {
      map[scanPlanKey(row.symbol, 'LONG')] = row.tradePlans.LONG;
    }
    if (row.tradePlans?.SHORT) {
      map[scanPlanKey(row.symbol, 'SHORT')] = row.tradePlans.SHORT;
    }
    if (row.tradePlan) {
      map[scanPlanKey(row.symbol, row.direction)] = row.tradePlan;
    }
  }
  return map;
}

export function findScanPlan(
  plans: Record<string, TradePlan>,
  symbol: AppTradeSymbol,
  direction: TradeDirection,
): TradePlan | null {
  return plans[scanPlanKey(symbol, direction)] ?? null;
}

function pctDiff(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return (Math.abs(a - b) / Math.abs(b)) * 100;
}

/** Lệnh chờ — entry gợi ý tốt hơn (LONG rẻ hơn, SHORT cao hơn). */
export function comparePendingEntry(
  entry: Pick<StoredTradeJournalEntry, 'direction' | 'entryPrice'>,
  plan: TradePlan | null,
  minImprovePct = MIN_IMPROVE_PCT,
): PendingEntryOptimize | null {
  if (!plan) return null;

  const current = entry.entryPrice;
  const suggested = plan.entryPrice;
  if (!Number.isFinite(current) || !Number.isFinite(suggested) || current <= 0) return null;

  let better = false;
  let improvePct = 0;

  if (entry.direction === 'LONG') {
    if (suggested < current) {
      improvePct = pctDiff(suggested, current);
      better = improvePct >= minImprovePct;
    }
  } else if (suggested > current) {
    improvePct = pctDiff(suggested, current);
    better = improvePct >= minImprovePct;
  }

  if (!better) return null;

  const dir = entry.direction === 'LONG' ? 'rẻ hơn' : 'cao hơn';
  return {
    suggestedEntry: suggested,
    improvePct,
    summary: `Entry gợi ý ${dir} ${improvePct.toFixed(2)}% — limit tốt hơn theo quét mới`,
    plan,
  };
}

function isBetterSl(
  direction: TradeDirection,
  current: number,
  suggested: number,
  minImprovePct: number,
): boolean {
  if (!Number.isFinite(current) || !Number.isFinite(suggested)) return false;
  if (direction === 'LONG') {
    return suggested > current && pctDiff(suggested, current) >= minImprovePct;
  }
  return suggested < current && pctDiff(suggested, current) >= minImprovePct;
}

function isBetterTp(
  direction: TradeDirection,
  current: number,
  suggested: number,
  minImprovePct: number,
): boolean {
  if (!Number.isFinite(current) || !Number.isFinite(suggested)) return false;
  if (direction === 'LONG') {
    return suggested > current && pctDiff(suggested, current) >= minImprovePct;
  }
  return suggested < current && pctDiff(suggested, current) >= minImprovePct;
}

function isPlanValidForOpenPosition(
  entry: Pick<StoredTradeJournalEntry, 'direction' | 'entryPrice'>,
  plan: TradePlan,
): boolean {
  if (plan.direction !== entry.direction) return false;
  if (!Number.isFinite(entry.entryPrice) || entry.entryPrice <= 0) return false;

  const e = entry.entryPrice;
  if (entry.direction === 'LONG') {
    if (plan.takeProfit1 <= e) return false;
    if (plan.stopLoss > e && plan.takeProfit1 < e) return false;
  } else {
    if (plan.takeProfit1 >= e) return false;
    if (plan.stopLoss < e && plan.takeProfit1 > e) return false;
  }
  return true;
}

/** Lệnh đã khớp — SL/TP gợi ý tối ưu hơn (cùng hướng lệnh). */
export function compareOpenLevels(
  entry: Pick<
    StoredTradeJournalEntry,
    'direction' | 'entryPrice' | 'stopLoss' | 'takeProfit1' | 'takeProfit2' | 'takeProfit3'
  >,
  plan: TradePlan | null,
  minImprovePct = MIN_IMPROVE_PCT,
): OpenLevelsOptimize | null {
  if (!plan || !isPlanValidForOpenPosition(entry, plan)) return null;

  const improvements: LevelImprovement[] = [];
  const patch: OpenLevelsOptimize['patch'] = {};

  const levels: Array<{
    field: LevelImprovement['field'];
    label: string;
    current: number | undefined;
    suggested: number;
    kind: 'sl' | 'tp';
  }> = [
    { field: 'stopLoss', label: 'SL', current: entry.stopLoss, suggested: plan.stopLoss, kind: 'sl' },
    { field: 'takeProfit1', label: 'TP1', current: entry.takeProfit1, suggested: plan.takeProfit1, kind: 'tp' },
    { field: 'takeProfit2', label: 'TP2', current: entry.takeProfit2, suggested: plan.takeProfit2, kind: 'tp' },
    { field: 'takeProfit3', label: 'TP3', current: entry.takeProfit3, suggested: plan.takeProfit3, kind: 'tp' },
  ];

  for (const lv of levels) {
    if (lv.current == null || !Number.isFinite(lv.current)) continue;
    const ok =
      lv.kind === 'sl'
        ? isBetterSl(entry.direction, lv.current, lv.suggested, minImprovePct)
        : isBetterTp(entry.direction, lv.current, lv.suggested, minImprovePct);

    if (!ok) continue;

    const improvePct = pctDiff(lv.suggested, lv.current);
    const reason =
      lv.kind === 'sl'
        ? entry.direction === 'LONG'
          ? 'SL cao hơn — cắt lỗ ít hơn nếu quay đầu'
          : 'SL thấp hơn — cắt lỗ ít hơn nếu quay đầu'
        : entry.direction === 'LONG'
          ? 'TP cao hơn — chốt lời nhiều hơn'
          : 'TP thấp hơn — chốt lời nhiều hơn';

    improvements.push({
      field: lv.field,
      label: lv.label,
      current: lv.current,
      suggested: lv.suggested,
      improvePct,
      reason,
    });
    patch[lv.field] = lv.suggested;
  }

  if (improvements.length === 0) return null;

  const parts = improvements.map(
    (i) => `${i.label} ${i.improvePct.toFixed(2)}%`,
  );

  return {
    improvements,
    summary: `Quét mới gợi ý chỉnh: ${parts.join(' · ')}`,
    patch,
  };
}
