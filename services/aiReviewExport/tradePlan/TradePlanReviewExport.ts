/**
 * TASK 17.5 — TradePlan Review Export (public API).
 *
 * Pure function: frozen snapshot in, self-contained TRADEPLAN_REVIEW.md
 * Markdown out. No mutation, no Date.now(), no UUID, no randomness,
 * no JSON dump. Deterministic: identical input → byte-identical output.
 */

import { buildTradePlanReview } from './TradePlanReviewBuilder';
import { formatTradePlanReview } from './TradePlanReviewFormatter';
import type { TradePlanReviewInput } from './TradePlanReviewTypes';

export function buildTradePlanReviewExport(input: TradePlanReviewInput): string {
  return formatTradePlanReview(buildTradePlanReview(input));
}
