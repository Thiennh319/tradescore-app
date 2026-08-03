import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import {
  resolveEsmUlReviewExplanationPanel,
  type EsmUlReviewExplanationPanel,
} from './esmUlReviewExplanation';
import {
  resolveEsmUlReviewDisplay,
  type EsmUlReviewTone,
} from './esmUiDisplay';

/** Journal Recommendation column — latest UL Review (ESM) only. */
export function resolveJournalUlReviewRecommendation(
  entry: AiTradeJournalEntry,
  esmSnapshot: ProductionEsmBridgeSnapshot | null | undefined,
): { label: string; tone: EsmUlReviewTone; tooltipLines: readonly string[] } {
  if (entry.outcome.status === 'OPEN' || entry.outcome.status === 'PENDING') {
    return resolveEsmUlReviewDisplay(esmSnapshot, entry.symbol);
  }
  return { label: 'Closed', tone: 'neutral', tooltipLines: [] };
}

/** UL Review explanation panel for hover popover / mobile sheet. */
export function resolveJournalUlReviewExplanation(
  entry: AiTradeJournalEntry,
  esmSnapshot: ProductionEsmBridgeSnapshot | null | undefined,
): EsmUlReviewExplanationPanel {
  if (entry.outcome.status === 'OPEN' || entry.outcome.status === 'PENDING') {
    return resolveEsmUlReviewExplanationPanel(
      esmSnapshot,
      entry.symbol,
      entry.scoring.direction,
    );
  }
  return {
    hasContent: false,
    recommendation: 'Closed',
    finalAction: null,
    confidence: null,
    decisionScore: null,
    supportingReasons: [],
    warningFactors: [],
    rejectedActions: [],
    updatedAt: null,
    executiveSummary: null,
  };
}

export function resolveJournalUlReviewRecommendationColor(tone: EsmUlReviewTone): string | null {
  if (tone === 'close') return 'close';
  if (tone === 'hold') return 'hold';
  if (tone === 'wait') return 'wait';
  return null;
}

export function resolveJournalUlReviewSource(
  entry: AiTradeJournalEntry,
  esmSnapshot: ProductionEsmBridgeSnapshot | null | undefined,
): 'ul-review-esm' | 'closed' | 'none' {
  if (entry.outcome.status === 'OPEN' || entry.outcome.status === 'PENDING') {
    const label = resolveEsmUlReviewDisplay(esmSnapshot, entry.symbol).label;
    return label !== '—' ? 'ul-review-esm' : 'none';
  }
  return 'closed';
}
