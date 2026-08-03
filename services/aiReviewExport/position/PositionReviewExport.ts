/**
 * TASK 17.4 — Position Review Export public API.
 *
 * buildPositionReviewExport(input) -> Markdown (POSITION_REVIEW.md).
 * Pure and deterministic: same frozen snapshot, byte-identical Markdown.
 * No mutation, no Date.now(), no random, no UUID, no JSON dump.
 */

import { buildPositionReview } from './PositionReviewBuilder';
import { formatPositionReview } from './PositionReviewFormatter';
import type { PositionReviewInput } from './PositionReviewTypes';

export function buildPositionReviewExport(input: PositionReviewInput): string {
  return formatPositionReview(buildPositionReview(input));
}
