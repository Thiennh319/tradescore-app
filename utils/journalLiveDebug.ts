import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { SignalRow } from '../hooks/useSignalBoard';
import type { SignalRowV41 } from '../services/v41/scanV41';
import type { JournalPnlBreakdown } from '../services/journalService';
import { getEsmSnapshotForSymbol, type EsmBridgeState } from '../store/esmBridgeTypes';
import { formatSignedUsdt } from './positionPnl';
import {
  resolveJournalUlReviewRecommendation,
  resolveJournalUlReviewSource,
} from './journalRecommendationDisplay';

export function resolveJournalMarkPriceSource(
  symbol: string,
  mergedMark: number | undefined,
  signalRows: SignalRow[],
  v41Rows: SignalRowV41[],
): string {
  if (mergedMark == null || !Number.isFinite(mergedMark)) return 'none';
  const signalPrice = signalRows.find((r) => r.symbol === symbol)?.price;
  if (signalPrice != null && Number.isFinite(signalPrice) && signalPrice === mergedMark) {
    return 'signalRows.price';
  }
  const v41Price = v41Rows.find((r) => r.symbol === symbol)?.markPrice;
  if (v41Price != null && Number.isFinite(v41Price) && v41Price === mergedMark) {
    return 'v41Rows.markPrice';
  }
  return 'mergedMark';
}

export interface JournalLiveDebugRow {
  entry: AiTradeJournalEntry;
  mergedMark?: number;
  priceSource: string;
  unrealizedPnl?: number | null;
  ulReviewLabel?: string;
  recommendationUi?: string;
  recommendationSource?:
    | 'waiting-fill'
    | 'position-advisor'
    | 'ul-review-esm'
    | 'closed'
    | 'none';
  pnlBreakdown?: JournalPnlBreakdown;
}

export function logJournalLiveSync(
  rows: JournalLiveDebugRow[],
  scanGeneration: number,
  esmBridge?: EsmBridgeState,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (rows.length === 0) return;

  const ts = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  console.log(`[JournalLive] scanGen=${scanGeneration} updated=${ts}`);

  for (const row of rows) {
    const { entry } = row;
    const sym = entry.symbol.replace('USDT', '');
    const snapshot = esmBridge ? getEsmSnapshotForSymbol(esmBridge, entry.symbol) : null;
    const ulReview =
      row.ulReviewLabel ??
      resolveJournalUlReviewRecommendation(entry, snapshot).label;
    const recommendationUi = row.recommendationUi ?? ulReview;
    const recommendationSource =
      row.recommendationSource ?? resolveJournalUlReviewSource(entry, snapshot);
    const pnl =
      row.unrealizedPnl != null ? formatSignedUsdt(row.unrealizedPnl) : '—';
    const currentUi = row.mergedMark != null ? String(row.mergedMark) : '—';

    console.log(
      [
        '------------------------------------------------',
        sym,
        `Latest Market: ${row.mergedMark ?? '—'}`,
        `Price Source: ${row.priceSource}`,
        `Current UI: ${currentUi}`,
        `PnL: ${pnl}`,
        `UL Review: ${ulReview}`,
        `Journal: ${recommendationUi}`,
        `Source: ${recommendationSource}`,
        `Updated: ${ts}`,
        '------------------------------------------------',
      ].join('\n'),
    );
  }
}
