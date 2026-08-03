/**
 * TASK 16.2 / 17.5.3.2 — Rule Trace Export (Public API).
 *
 * buildRuleTraceExport(): frozen RuleBook journey → 01_RULEBOOK.md Markdown.
 * READ ONLY — engines untouched, nothing recalculated, no side effects.
 *
 * Pipeline: Input → Builder → Presentation mapper → Formatter.
 * Presentation mapping (Status / Recommendation / Dependency) lives outside
 * the formatter.
 */

import { buildRuleTrace } from './RuleTraceBuilder';
import { formatRuleTrace } from './RuleTraceFormatter';
import { toRuleTracePresentation } from './ruleTracePresentation';
import type { RuleTraceInput } from './RuleTraceTypes';

export function buildRuleTraceExport(input: RuleTraceInput): string {
  return formatRuleTrace(toRuleTracePresentation(buildRuleTrace(input)));
}
