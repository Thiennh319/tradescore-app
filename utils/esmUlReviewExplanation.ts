/**
 * UL Review explanation panel — read-only decision → UI model (Journal).
 *
 * **Purpose:** Expose existing ESM / UL Review fields for hover popover & mobile sheet.
 * **Must NOT:** Evaluate rules, score, or call pipeline.
 *
 * @module utils/esmUlReviewExplanation
 */

import type { TradeDirection } from '../constants/scoring';
import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import { resolveEsmUlReviewDecision } from './esmUlReviewDecision';
import {
  resolveEsmUlReviewExecutiveSummary,
  type EsmUlReviewExecutiveSummary,
} from './esmUlReviewExecutiveSummary';

export type { EsmUlReviewExecutiveSummary } from './esmUlReviewExecutiveSummary';

export interface EsmUlReviewRejectedAction {
  readonly label: string;
  readonly reason: string;
}

export interface EsmUlReviewExplanationPanel {
  readonly hasContent: boolean;
  readonly recommendation: string;
  readonly finalAction: string | null;
  readonly confidence: number | null;
  readonly decisionScore: string | null;
  readonly supportingReasons: readonly string[];
  readonly warningFactors: readonly string[];
  readonly rejectedActions: readonly EsmUlReviewRejectedAction[];
  readonly updatedAt: string | null;
  /** V2 — trader-facing executive summary (presentation only). */
  readonly executiveSummary: EsmUlReviewExecutiveSummary | null;
}

function formatUpdatedAt(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Build UL Review explanation panel model from store snapshot — read-only.
 */
export function resolveEsmUlReviewExplanationPanel(
  snapshot: ProductionEsmBridgeSnapshot | null | undefined,
  symbol: string,
  tradeDirection?: TradeDirection,
): EsmUlReviewExplanationPanel {
  const empty: EsmUlReviewExplanationPanel = {
    hasContent: false,
    recommendation: '—',
    finalAction: null,
    confidence: null,
    decisionScore: null,
    supportingReasons: [],
    warningFactors: [],
    rejectedActions: [],
    updatedAt: null,
    executiveSummary: null,
  };

  const decision = resolveEsmUlReviewDecision(snapshot, symbol, tradeDirection);
  if (!decision) return empty;

  const panel: EsmUlReviewExplanationPanel = {
    hasContent: true,
    recommendation: decision.recommendation,
    finalAction: decision.finalAction,
    confidence: decision.confidence,
    decisionScore: decision.decisionScore,
    supportingReasons: decision.supportingReasons,
    warningFactors: decision.warningFactors,
    rejectedActions: decision.rejectedAlternatives,
    updatedAt: formatUpdatedAt(snapshot?.timestamp),
    executiveSummary: null,
  };

  return {
    ...panel,
    executiveSummary: resolveEsmUlReviewExecutiveSummary(panel, snapshot, tradeDirection),
  };
}
