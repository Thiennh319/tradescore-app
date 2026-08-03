/**
 * TASK 16.5 — Position Adviser Trace Builder.
 *
 * Normalizes frozen Adviser output for Markdown formatting. No PnL, stop,
 * target, risk or contribution calculation is performed.
 */

import { fmt } from '../formatters/markdown';
import type {
  AdviserCheckItem,
  AdviserConflict,
  AdviserContribution,
  AdviserContributionItem,
  AdviserDecisionTreeStep,
  AdviserEvidenceItem,
  AdviserRuleItem,
  AdviserTraceCheck,
  AdviserTraceEvidence,
  AdviserTraceRule,
  AdviserTreeStepItem,
  PositionAdviserTrace,
  PositionAdviserTraceInput,
} from './PositionAdviserTraceTypes';

function evidenceItems(
  evidence: readonly AdviserTraceEvidence[] | null | undefined,
): readonly AdviserEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function checkItem(check: AdviserTraceCheck, index: number): AdviserCheckItem {
  return {
    index: index + 1,
    id: fmt(check.id),
    name: fmt(check.name),
    status: fmt(check.status),
    priority: fmt(check.priority),
    reason: fmt(check.reason),
    recommendation: fmt(check.recommendation),
    evidence: evidenceItems(check.evidence),
    source: fmt(check.source),
    dependency: fmt(check.dependency ?? check.source),
    contribution: fmt(check.contribution),
    ignored: check.enabled === false || check.status === 'SKIPPED',
  };
}

function ruleItem(rule: AdviserTraceRule, index: number): AdviserRuleItem {
  return {
    index: index + 1,
    id: fmt(rule.id),
    name: fmt(rule.name),
    triggered: typeof rule.triggered === 'boolean' ? rule.triggered : null,
    priority: fmt(rule.priority),
    reason: fmt(rule.reason),
    evidence: evidenceItems(rule.evidence),
    override: typeof rule.override === 'boolean' ? rule.override : null,
    hardExit: rule.hardExit === true,
  };
}

function treeStepItem(
  step: AdviserDecisionTreeStep,
  index: number,
): AdviserTreeStepItem {
  return {
    index: index + 1,
    stage: fmt(step.stage),
    result: fmt(step.result),
    detail: fmt(step.detail),
  };
}

function contributionItem(
  contribution: AdviserContribution,
): AdviserContributionItem {
  return {
    name: fmt(contribution.name),
    contribution: fmt(contribution.contribution),
    reason: fmt(contribution.reason),
  };
}

/**
 * Structural observations only:
 * - CLOSE + positive numeric PnL + no triggered rule.
 * - MOVE SL + engine-provided worsensProtection=true.
 * - HOLD + triggered engine-provided hardExit=true.
 *
 * Stop prices and PnL are never recalculated or compared.
 */
function detectConflict(
  input: PositionAdviserTraceInput,
  rules: readonly AdviserRuleItem[],
): AdviserConflict {
  const recommendation = input.decision?.recommendation ?? null;
  const reasons: string[] = [];
  const triggeredRules = rules.filter((rule) => rule.triggered === true);

  if (
    recommendation === 'CLOSE' &&
    typeof input.positionSnapshot?.pnlPct === 'number' &&
    input.positionSnapshot.pnlPct > 0 &&
    triggeredRules.length === 0
  ) {
    reasons.push('CLOSE on profitable position without triggered rule');
  }

  if (
    recommendation === 'MOVE SL' &&
    input.stopLossPlan?.worsensProtection === true
  ) {
    reasons.push('MOVE SL worsens protection');
  }

  const hardExitRules = triggeredRules.filter((rule) => rule.hardExit);
  if (recommendation === 'HOLD' && hardExitRules.length > 0) {
    reasons.push(
      `HOLD despite hard exit rule (${hardExitRules.map((rule) => rule.id).join(', ')})`,
    );
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build a deterministic Position Adviser Trace from frozen input. O(n). */
export function buildPositionAdviserTrace(
  input: PositionAdviserTraceInput,
): PositionAdviserTrace {
  const market = input.marketSnapshot ?? {};
  const rules = (input.rules ?? []).map(ruleItem);
  return {
    metadata: input.metadata ?? {},
    positionSnapshot: input.positionSnapshot ?? {},
    marketSnapshot: Object.keys(market)
      .sort()
      .map((key) => ({ key, value: fmt(market[key]) })),
    decision: input.decision ?? {},
    decisionTree: (input.decisionTree ?? []).map(treeStepItem),
    checks: (input.checks ?? []).map(checkItem),
    rules,
    positionAction: input.positionAction ?? {},
    stopLossPlan: input.stopLossPlan ?? {},
    takeProfitPlan: input.takeProfitPlan ?? {},
    riskReview: input.riskReview ?? {},
    contributions: (input.contributions ?? []).map(contributionItem),
    conflict: detectConflict(input, rules),
  };
}
