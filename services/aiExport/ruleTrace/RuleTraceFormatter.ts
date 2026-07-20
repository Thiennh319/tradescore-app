/**
 * TASK 16.2 / 17.5.3.6 — Rule Trace Formatter (orchestration only).
 *
 * Assembles 01_RULEBOOK.md by calling shared Trace renderers.
 * No section Markdown is rendered directly in this file.
 */

import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import {
  renderTraceAiReviewSection,
  renderTraceConflictSection,
  renderTraceContributionSection,
  renderTraceChainSection,
  renderTraceDecisionInputLabel,
  renderTraceDependencySection,
  renderTraceGroupBreakdownSection,
  renderTraceInputSnapshot,
  renderTraceLayersSection,
  renderTraceMetadata,
  renderTracePriorityTreeSection,
  renderTraceSummarySection,
  renderTraceTableSection,
  TRACE_DEFAULT_VERSION,
} from '../shared/renderTraceSection';
import type { RuleTracePresentation } from './ruleTracePresentation';

/**
 * Render the full 01_RULEBOOK.md Rule Trace document from the presentation DTO.
 * Callers must supply RuleTracePresentation (see toRuleTracePresentation).
 */
export function formatRuleTrace(doc: RuleTracePresentation): string {
  const m = doc.metadata;
  const d = doc.decision;
  const s = doc.summary;
  const gb = doc.groupBreakdown;

  return [
    ...renderTraceMetadata([
      { label: 'Version', value: m.version ?? TRACE_DEFAULT_VERSION },
      { label: 'Generated Time', value: m.generatedAt },
      { label: 'Trade ID', value: m.tradeId },
      { label: 'Rule Version', value: m.ruleVersion },
      { label: 'Engine Version', value: m.engineVersion },
      { label: 'Coin', value: m.coin },
      { label: 'Side', value: m.side },
    ]),
    '',
    ...renderTraceInputSnapshot(doc.inputSnapshot),
    '',
    ...renderTraceLayersSection('RULE TRACE', doc.trace.layers, 'rule'),
    '',
    ...renderTraceTableSection(
      'RULE EVALUATION TABLE',
      doc.trace.layers,
      'evaluation',
    ),
    '',
    ...renderTraceSummarySection('RULE SUMMARY', [
      { label: 'Matched Rules', value: s.matchedRules },
      { label: 'Failed Rules', value: s.failedRules },
      { label: 'Ignored Rules', value: s.ignoredRules },
      { label: 'Blocked Rules', value: s.blockedRules },
      { label: 'Soft Block', value: s.softBlocks },
      { label: 'Hard Block (Rule Trace Scope)', value: s.hardBlocks },
      { label: 'Unlock Rules', value: s.unlockRules },
    ]),
    '',
    ...renderTracePriorityTreeSection(doc.priorityTree),
    '',
    ...renderTraceContributionSection(
      doc.trace.layers,
      d.totalScore ?? d.score,
    ),
    '',
    ...renderTraceGroupBreakdownSection({
      rows: gb.rows,
      decisionTotal: gb.decisionTotal,
      vwapNote: gb.vwapNote,
    }),
    '',
    ...renderTraceDependencySection('RULE DEPENDENCY', doc.trace.layers),
    '',
    ...renderTraceConflictSection(doc.conflict.detected, doc.conflict.reasons),
    '',
    ...renderTraceChainSection('DECISION CHAIN', [
      {
        label: 'Input',
        value: renderTraceDecisionInputLabel(m.coin, m.side),
      },
      { label: 'Matched Rules', value: s.matchedRules },
      { label: 'Score', value: d.score ?? d.totalScore },
      { label: 'Hard Block', value: d.hardBlock ?? null },
      { label: 'Decision', value: d.decision },
      { label: 'Recommendation', value: d.recommendation },
    ]),
    '',
    ...renderTraceAiReviewSection('rule'),
    '',
    ...aiReviewSpecificationSection(),
    '',
  ].join('\n');
}
