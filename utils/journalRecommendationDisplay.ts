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

/** Align with V4.1 `buildWaitingFillAdvisor` / actionLabels WAITING_FILL. */
export const JOURNAL_WAITING_FILL_LABEL = 'Waiting Fill';
/** Align with V4.1 `WAITING_FILL_REASON` in buildTradeSessionAdviser.ts. */
export const JOURNAL_WAITING_FILL_REASON = 'Chờ khớp lệnh';

function waitingFillRecommendation(): {
  label: string;
  tone: EsmUlReviewTone;
  tooltipLines: readonly string[];
} {
  return {
    label: JOURNAL_WAITING_FILL_LABEL,
    tone: 'wait',
    tooltipLines: [`• ${JOURNAL_WAITING_FILL_REASON}`],
  };
}

function waitingFillExplanation(): EsmUlReviewExplanationPanel {
  return {
    hasContent: true,
    recommendation: JOURNAL_WAITING_FILL_LABEL,
    finalAction: JOURNAL_WAITING_FILL_LABEL,
    confidence: null,
    decisionScore: null,
    supportingReasons: [JOURNAL_WAITING_FILL_REASON],
    warningFactors: [],
    rejectedActions: [],
    updatedAt: null,
    executiveSummary: null,
  };
}

/** Tone heuristic for Position Advisor labels (VI/EN) shown in Active Trades. */
export function toneFromRecommendationLabel(label: string): EsmUlReviewTone {
  const lower = label.toLowerCase();
  if (
    lower.includes('close') ||
    lower.includes('đóng') ||
    lower.includes('urgent') ||
    lower.includes('emergency') ||
    lower.includes('exit')
  ) {
    return 'close';
  }
  if (
    lower.includes('wait') ||
    lower.includes('chờ') ||
    lower.includes('confirmation') ||
    lower.includes('waiting fill')
  ) {
    return 'wait';
  }
  if (lower.includes('hold') || lower.includes('giữ') || lower.includes('monitor')) {
    return 'hold';
  }
  return 'neutral';
}

/**
 * Active Trades recommendation label:
 * - PENDING → Waiting Fill (not ESM)
 * - OPEN → prefer per-entry advisorLabelById, else ESM symbol UL Review
 * - closed → Closed
 */
export function resolveJournalActiveTradeRecommendation(
  entry: AiTradeJournalEntry,
  esmSnapshot: ProductionEsmBridgeSnapshot | null | undefined,
  advisorLabelById?: Record<string, string> | null,
): { label: string; tone: EsmUlReviewTone; tooltipLines: readonly string[]; source: 'waiting-fill' | 'position-advisor' | 'ul-review-esm' | 'closed' | 'none' } {
  if (entry.outcome.status === 'PENDING') {
    return { ...waitingFillRecommendation(), source: 'waiting-fill' };
  }
  if (entry.outcome.status === 'OPEN') {
    const advisor = advisorLabelById?.[entry.id]?.trim();
    if (advisor) {
      return {
        label: advisor,
        tone: toneFromRecommendationLabel(advisor),
        tooltipLines: [],
        source: 'position-advisor',
      };
    }
    const esm = resolveEsmUlReviewDisplay(esmSnapshot, entry.symbol);
    return {
      ...esm,
      source: esm.label !== '—' ? 'ul-review-esm' : 'none',
    };
  }
  return { label: 'Closed', tone: 'neutral', tooltipLines: [], source: 'closed' };
}

/** Journal Recommendation column — PENDING waiting-fill; OPEN ESM UL Review. */
export function resolveJournalUlReviewRecommendation(
  entry: AiTradeJournalEntry,
  esmSnapshot: ProductionEsmBridgeSnapshot | null | undefined,
): { label: string; tone: EsmUlReviewTone; tooltipLines: readonly string[] } {
  if (entry.outcome.status === 'PENDING') {
    return waitingFillRecommendation();
  }
  if (entry.outcome.status === 'OPEN') {
    return resolveEsmUlReviewDisplay(esmSnapshot, entry.symbol);
  }
  return { label: 'Closed', tone: 'neutral', tooltipLines: [] };
}

/** UL Review explanation panel for hover popover / mobile sheet. */
export function resolveJournalUlReviewExplanation(
  entry: AiTradeJournalEntry,
  esmSnapshot: ProductionEsmBridgeSnapshot | null | undefined,
  advisorLabelById?: Record<string, string> | null,
): EsmUlReviewExplanationPanel {
  if (entry.outcome.status === 'PENDING') {
    return waitingFillExplanation();
  }
  if (entry.outcome.status === 'OPEN') {
    const advisor = advisorLabelById?.[entry.id]?.trim();
    if (advisor) {
      return {
        hasContent: true,
        recommendation: advisor,
        finalAction: advisor,
        confidence: null,
        decisionScore: null,
        supportingReasons: [],
        warningFactors: [],
        rejectedActions: [],
        updatedAt: null,
        executiveSummary: null,
      };
    }
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
  advisorLabelById?: Record<string, string> | null,
): 'waiting-fill' | 'position-advisor' | 'ul-review-esm' | 'closed' | 'none' {
  return resolveJournalActiveTradeRecommendation(entry, esmSnapshot, advisorLabelById).source;
}
