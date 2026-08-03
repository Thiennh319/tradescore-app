/**
 * TASK 16.5 — Position Adviser Trace Formatter.
 *
 * Renders 04_POSITION_ADVISER.md. Markdown only, deterministic, null-safe,
 * and free of score/risk/price recalculation.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import { renderTraceSnapshotFieldLines } from '../shared/renderTraceSection';
import type {
  AdviserEvidenceItem,
  PositionAdviserTrace,
} from './PositionAdviserTraceTypes';

const DIVIDER = '--------------------------------';
const TRACE_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly AdviserEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function metadata(trace: PositionAdviserTrace): string[] {
  const value = trace.metadata;
  return [
    '# Metadata',
    '',
    kv('Version', value.version ?? TRACE_VERSION),
    kv('Trade ID', value.tradeId),
    kv('Position ID', value.positionId),
    kv('Coin', value.coin),
    kv('Side', value.side),
    kv('Strategy', value.strategy),
    kv('Opened Time', value.openedTime),
    kv('Holding Duration', value.holdingDuration),
    kv('Rule Version', value.ruleVersion),
    kv('Adviser Version', value.adviserVersion),
    kv('Engine Version', value.engineVersion),
  ];
}

function positionSnapshot(trace: PositionAdviserTrace): string[] {
  const value = trace.positionSnapshot;
  return [
    kv('Entry Price', value.entryPrice),
    kv('Current Price', value.currentPrice),
    kv('PnL %', value.pnlPct),
    kv('PnL USDT', value.pnlUsdt),
    kv('RR', value.riskReward),
    kv('Unrealized Profit', value.unrealizedProfit),
    kv('Stop Loss', value.stopLoss),
    kv('Take Profit', value.takeProfit),
    kv('Trailing Stop', value.trailingStop),
    kv('Break Even', value.breakEven),
    kv('Leverage', value.leverage),
    kv('Position Size', value.positionSize),
    kv('Exposure', value.exposure),
    kv('Holding Time', value.holdingTime),
    kv('Current Adviser State', value.currentAdviserState),
  ];
}

function adviserDecision(trace: PositionAdviserTrace): string[] {
  const value = trace.decision;
  return [
    kv('Recommendation', value.recommendation ?? null),
    kv('Reason', value.reason),
    kv('Summary', value.summary),
    kv('Confidence', value.confidence),
    kv('Priority', value.priority),
  ];
}

function decisionTree(trace: PositionAdviserTrace): string[] {
  return trace.decisionTree.flatMap((step, index) => [
    ...(index > 0 ? ['  |'] : []),
    `${step.stage} [${step.result}]${step.detail !== UNAVAILABLE ? ` — ${step.detail}` : ''}`,
  ]);
}

function adviserChecklist(trace: PositionAdviserTrace): string[] {
  return table(
    [
      'Check ID',
      'Check Name',
      'Status',
      'Priority',
      'Reason',
      'Recommendation',
      'Evidence',
      'Source',
    ],
    trace.checks.map((check) => [
      check.id,
      check.name,
      check.status,
      check.priority,
      check.reason,
      check.recommendation,
      evidenceText(check.evidence),
      check.source,
    ]),
  );
}

function adviserRules(trace: PositionAdviserTrace): string[] {
  return table(
    [
      'Rule ID',
      'Rule Name',
      'Triggered',
      'Priority',
      'Reason',
      'Evidence',
      'Override',
    ],
    trace.rules.map((rule) => [
      rule.id,
      rule.name,
      rule.triggered,
      rule.priority,
      rule.reason,
      evidenceText(rule.evidence),
      rule.override,
    ]),
  );
}

function positionAction(trace: PositionAdviserTrace): string[] {
  const value = trace.positionAction;
  return [
    kv('Current Action', value.currentAction),
    kv('Suggested Action', value.suggestedAction),
    kv('Reason', value.reason),
    kv('Expected Effect', value.expectedEffect),
    kv('Risk', value.risk),
  ];
}

function stopLossPlan(trace: PositionAdviserTrace): string[] {
  const value = trace.stopLossPlan;
  return [
    kv('Current SL', value.currentStopLoss),
    kv('Suggested SL', value.suggestedStopLoss),
    kv('Reason', value.reason),
    kv('Protection Type', value.protectionType),
    kv('Break Even', value.breakEven),
    kv('Trailing', value.trailing),
    kv('Worsens Protection', value.worsensProtection ?? null),
  ];
}

function takeProfitPlan(trace: PositionAdviserTrace): string[] {
  const value = trace.takeProfitPlan;
  return [
    kv('Current TP', value.currentTakeProfit),
    kv('Suggested TP', value.suggestedTakeProfit),
    kv('Scale Out %', value.scaleOutPct),
    kv('Remaining %', value.remainingPct),
    kv('Reason', value.reason),
  ];
}

function riskReview(trace: PositionAdviserTrace): string[] {
  const value = trace.riskReview;
  return [
    kv('Current Risk', value.currentRisk),
    kv('Allowed Risk', value.allowedRisk),
    kv('Drawdown', value.drawdown),
    kv('Exposure', value.exposure),
    kv('Rule Status', value.ruleStatus),
  ];
}

function contribution(trace: PositionAdviserTrace): string[] {
  return [
    'Contributions are copied from the Adviser — never summed or recalculated.',
    '',
    ...(trace.contributions.length > 0
      ? trace.contributions.map(
          (item) =>
            `${item.name}: ${item.contribution} — ${item.reason}`,
        )
      : [UNAVAILABLE]),
  ];
}

function decisionChain(trace: PositionAdviserTrace): string[] {
  return [
    kv('Market Snapshot', trace.marketSnapshot.length > 0 ? 'PROVIDED' : null),
    '  |',
    kv('Rule Trace', 'SEE 01_RULEBOOK.md'),
    '  |',
    kv('Score Trace', 'SEE 02_SCORE_ENGINE.md'),
    '  |',
    kv('Entry Trace', 'SEE 03_ENTRY_DECISION.md'),
    '  |',
    kv('Position Adviser', trace.positionSnapshot.currentAdviserState),
    '  |',
    kv('Recommendation', trace.decision.recommendation ?? null),
  ];
}

function dependency(trace: PositionAdviserTrace): string[] {
  return trace.checks.map(
    (check) => `- ${check.name} depends ${check.dependency}`,
  );
}

function conflictDetection(trace: PositionAdviserTrace): string[] {
  if (!trace.conflict.detected) return ['Conflict: NO'];
  return [
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
    '| Wrong Recommendation | □ | |',
    '| Wrong Rule | □ | |',
    '| Missing Evidence | □ | |',
    '| Missing Check | □ | |',
    '| Wrong Stop Loss | □ | |',
    '| Wrong Take Profit | □ | |',
    '| Wrong Scale Out | □ | |',
    '| Wrong Risk | □ | |',
    '| Adviser Conflict | □ | |',
    '| Need Optimization | □ | |',
  ];
}

/** Render the complete Position Adviser trace as Markdown. */
export function formatPositionAdviserTrace(
  trace: PositionAdviserTrace,
): string {
  return [
    ...metadata(trace),
    '',
    ...section('POSITION SNAPSHOT', positionSnapshot(trace)),
    '',
    ...section(
      'MARKET SNAPSHOT',
      renderTraceSnapshotFieldLines(trace.marketSnapshot),
    ),
    '',
    ...section('ADVISER DECISION', adviserDecision(trace)),
    '',
    ...section('ADVISER DECISION TREE', decisionTree(trace)),
    '',
    ...section('ADVISER CHECKLIST', adviserChecklist(trace)),
    '',
    ...section('ADVISER RULES', adviserRules(trace)),
    '',
    ...section('POSITION ACTION', positionAction(trace)),
    '',
    ...section('STOP LOSS PLAN', stopLossPlan(trace)),
    '',
    ...section('TAKE PROFIT PLAN', takeProfitPlan(trace)),
    '',
    ...section('RISK REVIEW', riskReview(trace)),
    '',
    ...section('ADVISER CONTRIBUTION', contribution(trace)),
    '',
    ...section('DECISION CHAIN', decisionChain(trace)),
    '',
    ...section('DEPENDENCY', dependency(trace)),
    '',
    ...section('CONFLICT DETECTION', conflictDetection(trace)),
    '',
    ...section('AI REVIEW', aiReview()),
    '',
    ...aiReviewSpecificationSection(),
    '',
  ].join('\n');
}
