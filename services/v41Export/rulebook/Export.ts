/**
 * V4.1 Rulebook Trace — public export API.
 * Pipeline: frozen SignalRowV41 → Builder → Formatter → Markdown string.
 */

import { buildRulebookV41Trace } from './Builder';
import { formatRulebookV41Trace } from './Formatter';
import type { RulebookV41ExportInput, RulebookV41Trace } from './Types';

/** Frozen scan row → 01_RULEBOOK_V41_{SYMBOL}.md Markdown body. */
export function buildRulebookV41Export(input: RulebookV41ExportInput): string {
  return formatRulebookV41Trace(buildRulebookV41Trace(input));
}

/** Builder only — for tests / wire that need structured trace. */
export function buildRulebookV41TraceDocument(
  input: RulebookV41ExportInput,
): RulebookV41Trace {
  return buildRulebookV41Trace(input);
}
