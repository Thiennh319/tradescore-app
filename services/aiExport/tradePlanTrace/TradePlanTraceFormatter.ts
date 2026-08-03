/**
 * TASK 16.6 — TradePlan Trace Formatter.
 *
 * Renders 05_TRADE_PLAN.md. Markdown only, deterministic, null-safe —
 * no JSON dump, no recalculation, no undefined/null leak.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import type {
  TradePlanBlockerItem,
  TradePlanEvidenceItem,
  TradePlanTrace,
} from './TradePlanTraceTypes';

const DIVIDER = '--------------------------------';
const TRACE_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly TradePlanEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function metadata(trace: TradePlanTrace): string[] {
  const m = trace.metadata;
  return [
    '# Metadata',
    '',
    kv('Version', m.version ?? TRACE_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Strategy', m.strategy),
    kv('Timestamp', m.timestamp),
    kv('TradePlan Version', m.tradePlanVersion),
    kv('Rule Version', m.ruleVersion),
    kv('Engine Version', m.engineVersion),
  ];
}

function planSummary(trace: TradePlanTrace): string[] {
  const s = trace.summary;
  return [
    kv('Plan Status', s.planStatus ?? null),
    kv('Headline', s.headline),
    kv('Summary', s.summary),
    kv('Confidence', s.confidence),
    kv('Priority', s.priority),
  ];
}

function entryPlan(trace: TradePlanTrace): string[] {
  const e = trace.entryPlan;
  return [
    kv('Entry Price', e.entryPrice),
    kv('Entry Zone', e.entryZone),
    kv('Preferred Entry', e.preferredEntry),
    kv('Maximum Entry', e.maximumEntry),
    kv('Reason', e.reason),
  ];
}

function riskPlan(trace: TradePlanTrace): string[] {
  const r = trace.riskPlan;
  return [
    kv('Stop Loss', r.stopLoss),
    kv('Risk %', r.riskPct),
    kv('Maximum Loss', r.maximumLoss),
    kv('Risk Reward', r.riskReward),
    kv('Position Size', r.positionSize),
    kv('Leverage', r.leverage),
    kv('Reason', r.reason),
  ];
}

function targetPlan(trace: TradePlanTrace): string[] {
  const t = trace.targetPlan;
  return [
    kv('TP1', t.tp1),
    kv('TP2', t.tp2),
    kv('TP3', t.tp3),
    kv('Scale Out', t.scaleOut),
    kv('Trailing', t.trailing),
    kv('Break Even', t.breakEven),
  ];
}

function executionPlan(trace: TradePlanTrace): string[] {
  const e = trace.executionPlan;
  return [
    kv('Current Step', e.currentStep),
    kv('Next Step', e.nextStep),
    kv('Trigger', e.trigger),
    kv('Condition', e.condition),
    kv('Fallback', e.fallback),
  ];
}

function positionManagement(trace: TradePlanTrace): string[] {
  const p = trace.positionManagement;
  return [
    kv('Initial Adviser State', p.initialAdviserState),
    kv('Expected Adviser State', p.expectedAdviserState),
    kv('Protection', p.protection),
    kv('Scale Out', p.scaleOut),
    kv('Close Condition', p.closeCondition),
  ];
}

function ruleReferences(trace: TradePlanTrace): string[] {
  return table(
    ['Rule ID', 'Rule Name', 'Decision Source', 'Evidence Reference'],
    trace.ruleReferences.map((reference) => [
      reference.ruleId,
      reference.ruleName,
      reference.decisionSource,
      reference.evidenceReference,
    ]),
  );
}

function dependencies(): string[] {
  return [
    'Rule Trace: SEE 01_RULEBOOK.md',
    '  |',
    'Score Trace: SEE 02_SCORE_ENGINE.md',
    '  |',
    'Entry Trace: SEE 03_ENTRY_DECISION.md',
    '  |',
    'Position Adviser Trace: SEE 04_POSITION_ADVISER.md',
  ];
}

function contribution(trace: TradePlanTrace): string[] {
  const c = trace.contribution;
  return [
    'Contributions are copied from the engine — never derived here.',
    '',
    kv('Entry', c.entry),
    kv('Risk', c.risk),
    kv('Targets', c.targets),
    kv('Management', c.management),
    kv('Timing', c.timing),
  ];
}

function blockerBlock(blocker: TradePlanBlockerItem): string[] {
  return [
    `Blocker ${String(blocker.index).padStart(3, '0')}`,
    kv('Current Blocker', blocker.blocker),
    kv('Required Unlock', blocker.requiredUnlock),
    kv('Reason', blocker.reason),
    kv('Evidence', evidenceText(blocker.evidence)),
  ];
}

function planBlockers(trace: TradePlanTrace): string[] {
  return trace.blockers.flatMap((blocker, index) => [
    ...(index > 0 ? ['', DIVIDER, ''] : []),
    ...blockerBlock(blocker),
  ]);
}

function planCancellation(trace: TradePlanTrace): string[] {
  const c = trace.cancellation;
  return [
    kv('Cancel Condition', c.cancelCondition),
    kv('Reason', c.reason),
    kv('Evidence', evidenceText(c.evidence)),
  ];
}

function conflictDetection(trace: TradePlanTrace): string[] {
  const cross = [
    kv('Entry Decision (frozen reference)', trace.crossReferences.entryDecision),
    kv('Position State (frozen reference)', trace.crossReferences.positionState),
    '',
  ];
  if (!trace.conflict.detected) return [...cross, 'Conflict: NO'];
  return [
    ...cross,
    'Conflict: YES',
    '',
    ...trace.conflict.reasons.map((reason) => kv('Reason', reason)),
  ];
}

function aiReview(): string[] {
  return [
    'AI REVIEW CHECKLIST',
    '',
    '| Review Item | Result | Notes |',
    '| --- | --- | --- |',
    '| Wrong Entry Plan | □ | |',
    '| Wrong Risk Plan | □ | |',
    '| Wrong TP Plan | □ | |',
    '| Wrong Position Plan | □ | |',
    '| Wrong Rule Reference | □ | |',
    '| Missing Evidence | □ | |',
    '| Plan Conflict | □ | |',
    '| Missing Blocker | □ | |',
    '| Need Optimization | □ | |',
    '| TradePlan Consistency | □ | |',
  ];
}

/** Render the complete TradePlan trace as 05_TRADE_PLAN.md Markdown. */
export function formatTradePlanTrace(trace: TradePlanTrace): string {
  return [
    ...metadata(trace),
    '',
    ...section('TRADE PLAN SUMMARY', planSummary(trace)),
    '',
    ...section('ENTRY PLAN', entryPlan(trace)),
    '',
    ...section('RISK PLAN', riskPlan(trace)),
    '',
    ...section('TARGET PLAN', targetPlan(trace)),
    '',
    ...section('EXECUTION PLAN', executionPlan(trace)),
    '',
    ...section('POSITION MANAGEMENT PLAN', positionManagement(trace)),
    '',
    ...section('RULE REFERENCES', ruleReferences(trace)),
    '',
    ...section('DEPENDENCIES', dependencies()),
    '',
    ...section('TRADEPLAN CONTRIBUTION', contribution(trace)),
    '',
    ...section('PLAN BLOCKERS', planBlockers(trace)),
    '',
    ...section('PLAN CANCELLATION', planCancellation(trace)),
    '',
    ...section('CONFLICT DETECTION', conflictDetection(trace)),
    '',
    ...section('AI REVIEW', aiReview()),
    '',
    ...aiReviewSpecificationSection(),
    '',
  ].join('\n');
}
