/**
 * TASK 16.4 — Entry Decision Trace Export (Public API).
 *
 * buildEntryTraceExport(): frozen Entry Engine journey → 03_ENTRY_DECISION.md.
 * READ ONLY — engines untouched, nothing recalculated, no side effects.
 */

import { buildEntryTrace } from './EntryTraceBuilder';
import { formatEntryTrace } from './EntryTraceFormatter';
import type { EntryTraceInput } from './EntryTraceTypes';

export function buildEntryTraceExport(input: EntryTraceInput): string {
  return formatEntryTrace(buildEntryTrace(input));
}
