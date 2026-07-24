/**
 * TASK 16.3 / 17.5.3.6 / 18.7 — Score Trace Formatter (orchestration only).
 *
 * Assembles 02_SCORE_ENGINE.md by calling shared Trace renderers.
 * No section Markdown is rendered directly in this file.
 *
 * TASK 18.7 — Display Layer Score labels + GROUP BREAKDOWN (Option B parity).
 * Does not change Score Engine math.
 */

import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import {
  renderTraceAdjustmentLines,
  renderTraceAiReviewSection,
  renderTraceConflictSection,
  renderTraceChainSection,
  renderTraceDecisionPolicyBody,
  renderTraceDependencySection,
  renderTraceExplainabilityBody,
  renderTraceGroupBreakdownSection,
  renderTraceScoreInterpretationSection,
  renderTraceHardBlockLines,
  renderTraceInputSnapshot,
  renderTraceLayersSection,
  renderTraceMetadata,
  renderTraceSection,
  TRACE_DEFAULT_VERSION,
} from '../shared/renderTraceSection';
import { renderTraceTable } from '../shared/renderTraceTable';
import type { ScoreTracePresentation } from './scoreTracePresentation';

/**
 * Render 02_SCORE_ENGINE.md Markdown from the presentation DTO.
 * Callers must supply ScoreTracePresentation (see toScoreTracePresentation).
 */
export function formatScoreTrace(doc: ScoreTracePresentation): string {
  const m = doc.metadata;
  const summary = doc.summary;
  const policy = doc.decisionPolicy;
  const gb = doc.groupBreakdown;

  return [
    ...renderTraceMetadata([
      { label: 'Version', value: m.version ?? TRACE_DEFAULT_VERSION },
      { label: 'Generated Time', value: m.generatedAt },
      { label: 'Trade ID', value: m.tradeId },
      { label: 'Coin', value: m.coin },
      { label: 'Side', value: m.side },
      { label: 'Engine Version', value: m.engineVersion },
      { label: 'Score Version', value: m.scoreVersion },
    ]),
    '',
    ...renderTraceInputSnapshot(doc.inputSnapshot),
    '',
    ...renderTraceLayersSection('SCORE COMPONENTS', doc.trace.layers, 'component'),
    '',
    // TASK 18.7 — SCORE TABLE uses Display Layer Score column + scale disclaimer.
    ...renderTraceSection('SCORE TABLE', [
      'Display Layer Scores are per-layer normalized values (max 1.5 each).',
      'They do NOT sum to Decision Total / Final Score — see GROUP BREAKDOWN.',
      '',
      ...renderTraceTable(doc.trace.layers, 'score'),
    ]),
    '',
    ...renderTraceGroupBreakdownSection({
      rows: gb.rows,
      decisionTotal: gb.decisionTotal,
      vwapNote: gb.vwapNote,
    }),
    '',
    ...renderTraceScoreInterpretationSection(),
    '',
    ...renderTraceSection(
      'BONUS',
      renderTraceAdjustmentLines('Bonus', doc.bonuses),
    ),
    '',
    ...renderTraceSection(
      'PENALTY',
      renderTraceAdjustmentLines('Penalty', doc.penalties),
    ),
    '',
    ...renderTraceSection('HARD / GROUP BLOCK', renderTraceHardBlockLines(doc.hardBlocks)),
    '',
    // TASK 18.7 — "Raw Score" was misleading (wire copies snap.score = Decision Total).
    ...renderTraceChainSection('SCORE SUMMARY', [
      { label: 'Decision Total (snap.score)', value: summary.rawScore },
      { label: 'Bonus', value: summary.bonus },
      { label: 'Penalty', value: summary.penalty },
      { label: 'Override', value: summary.override },
      { label: 'Hard/Group Blocked', value: summary.hardBlocked },
      { label: 'Final Score', value: summary.finalScore },
      { label: 'Grade', value: summary.grade },
      { label: 'Decision', value: summary.decision },
    ]),
    '',
    ...renderTraceSection(
      'DECISION POLICY',
      renderTraceDecisionPolicyBody({
        decision: summary.decision,
        decisionThreshold: policy.decisionThreshold,
        decisionPolicy: policy.decisionPolicy,
        decisionSource: policy.decisionSource,
        decisionRule: policy.decisionRule,
        decisionMapping: policy.decisionMapping,
        decisionReason: policy.decisionReason,
        overridden: policy.overridden,
        overrideRule: policy.overrideRule,
        overrideModule: policy.overrideModule,
        overrideReason: policy.overrideReason,
        overrideEvidence: policy.overrideEvidence ?? [],
      }),
    ),
    '',
    ...renderTraceSection(
      'SCORE EXPLAINABILITY',
      renderTraceExplainabilityBody(doc.trace.layers),
    ),
    '',
    ...renderTraceDependencySection('SCORE DEPENDENCY', doc.trace.layers),
    '',
    ...renderTraceChainSection('SCORE TIMELINE', [
      { value: 'Input' },
      { value: 'Rule Evaluation' },
      { label: 'Decision Total (snap.score)', value: summary.rawScore },
      { label: 'Bonus', value: summary.bonus },
      { label: 'Penalty', value: summary.penalty },
      { label: 'Override', value: summary.override },
      { label: 'Final Score', value: summary.finalScore },
    ]),
    '',
    ...renderTraceConflictSection(
      doc.consistency.detected,
      doc.consistency.reasons,
    ),
    '',
    ...renderTraceAiReviewSection('score'),
    '',
    ...aiReviewSpecificationSection(),
    '',
  ].join('\n');
}
