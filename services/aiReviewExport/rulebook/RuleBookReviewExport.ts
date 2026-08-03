/**
 * TASK 17.1 — RuleBook Review Export public API.
 *
 * buildRuleBookReviewExport(input) -> Markdown (RULEBOOK_REVIEW.md).
 * Pure and deterministic: same frozen snapshot, byte-identical Markdown.
 * No mutation, no Date.now(), no random, no UUID.
 */

import { buildRuleBookReview } from './RuleBookReviewBuilder';
import { formatRuleBookReview } from './RuleBookReviewFormatter';
import type { RuleBookReviewInput } from './RuleBookReviewTypes';

export function buildRuleBookReviewExport(input: RuleBookReviewInput): string {
  return formatRuleBookReview(buildRuleBookReview(input));
}
