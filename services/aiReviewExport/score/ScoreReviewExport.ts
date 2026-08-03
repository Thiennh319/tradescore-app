/**
 * TASK 17.2 — Score Review Export public API.
 *
 * buildScoreReviewExport(input) -> Markdown (SCORE_REVIEW.md).
 * Pure and deterministic: same frozen snapshot, byte-identical Markdown.
 * No mutation, no Date.now(), no random, no UUID.
 */

import { buildScoreReview } from './ScoreReviewBuilder';
import { formatScoreReview } from './ScoreReviewFormatter';
import type { ScoreReviewInput } from './ScoreReviewTypes';

export function buildScoreReviewExport(input: ScoreReviewInput): string {
  return formatScoreReview(buildScoreReview(input));
}
