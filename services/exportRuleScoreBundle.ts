/**
 * TASK 18.2 — canonical application Rule + Score Trace bundle.
 *
 * App-integration composition only. The locked Trace wire remains the sole
 * path to buildRuleTraceExport() and buildScoreTraceExport(); this service
 * does not duplicate Builder, Mapper, Formatter, or Markdown logic.
 */

import {
  exportTraceOrReviewMarkdown,
  type TraceReviewExportContext,
  type TraceReviewExportResult,
} from './exportTraceReviewWire';

export const RULE_SCORE_BUNDLE_FILENAME = 'TRADESCORE_RULE_SCORE_BUNDLE.md';

/**
 * One newline joins two already-complete Markdown documents. Each individual
 * Rule / Score payload remains byte-identical and appears verbatim.
 */
export const RULE_SCORE_BUNDLE_SEPARATOR = '\n';

/**
 * Generate the canonical application export artifact from one frozen context.
 *
 * Both calls use the exact same context (including exportedAt), so Rule and
 * Score traces describe the same selected snapshot and export time.
 */
export function exportRuleScoreBundle(
  context: TraceReviewExportContext,
): TraceReviewExportResult {
  const rule = exportTraceOrReviewMarkdown('trace-rulebook', context);
  if (!rule.ok) return rule;

  const score = exportTraceOrReviewMarkdown('trace-score', context);
  if (!score.ok) return score;

  return {
    ok: true,
    filename: RULE_SCORE_BUNDLE_FILENAME,
    markdown:
      rule.markdown +
      RULE_SCORE_BUNDLE_SEPARATOR +
      score.markdown,
  };
}
