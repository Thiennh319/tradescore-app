/**
 * TASK 16.5 — Position Adviser Trace Export public API.
 *
 * Frozen Adviser journey → 04_POSITION_ADVISER.md Markdown.
 */

import { buildPositionAdviserTrace } from './PositionAdviserTraceBuilder';
import { formatPositionAdviserTrace } from './PositionAdviserTraceFormatter';
import type { PositionAdviserTraceInput } from './PositionAdviserTraceTypes';

export function buildPositionAdviserTraceExport(
  input: PositionAdviserTraceInput,
): string {
  return formatPositionAdviserTrace(buildPositionAdviserTrace(input));
}
