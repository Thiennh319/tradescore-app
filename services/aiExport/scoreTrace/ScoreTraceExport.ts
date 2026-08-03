/**
 * TASK 16.3 / 17.5.3.3 — Score Trace Export public API.
 *
 * Frozen Score Engine snapshot → 02_SCORE_ENGINE.md Markdown.
 *
 * Pipeline: Input → Builder → Presentation mapper → Formatter.
 * Presentation mapping (Status / Recommendation / Dependency) lives outside
 * the formatter.
 */

import { buildScoreTrace } from './ScoreTraceBuilder';
import { formatScoreTrace } from './ScoreTraceFormatter';
import { toScoreTracePresentation } from './scoreTracePresentation';
import type { ScoreTraceInput } from './ScoreTraceTypes';

export function buildScoreTraceExport(input: ScoreTraceInput): string {
  return formatScoreTrace(toScoreTracePresentation(buildScoreTrace(input)));
}
