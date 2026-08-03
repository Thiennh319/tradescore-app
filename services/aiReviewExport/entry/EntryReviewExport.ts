/**
 * TASK 17.3 — Entry Review Export public API.
 *
 * buildEntryReviewExport(input) -> Markdown (ENTRY_REVIEW.md).
 * Pure and deterministic: same frozen snapshot, byte-identical Markdown.
 * No mutation, no Date.now(), no random, no UUID.
 */

import { buildEntryReview } from './EntryReviewBuilder';
import { formatEntryReview } from './EntryReviewFormatter';
import type { EntryReviewInput } from './EntryReviewTypes';

export function buildEntryReviewExport(input: EntryReviewInput): string {
  return formatEntryReview(buildEntryReview(input));
}
