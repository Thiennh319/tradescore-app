/**
 * TASK 16.0 — Domain adapters.
 *
 * Each adapter converts one frozen domain input into the standard
 * document body (INPUT / ANALYSIS / DECISION / OUTPUT / CHECKLIST /
 * WARNINGS / NOTES). Values are copied verbatim — no recalculation,
 * no inference, no engine access. Missing data → UNAVAILABLE.
 */

import { bullets, fmt, kv, table, UNAVAILABLE } from '../formatters/markdown';
import type {
  AiDocumentBody,
  AiExportInput,
  AiExportScalar,
  EntryQualityExportInput,
  JournalExportInput,
  MarketSnapshotExportInput,
  PositionAdviserExportInput,
  RuleBookExportInput,
  ScoreEngineExportInput,
  SignalDecisionExportInput,
  SummaryExportInput,
  TradePlanExportInput,
  UlAnalyticsExportInput,
} from '../types';

function emptyBody(): AiDocumentBody {
  return {
    input: [],
    analysis: [],
    decision: [],
    output: [],
    checklist: [],
    warnings: [],
    notes: [],
  };
}

function warningsForMissing(present: boolean, domain: string): string[] {
  return present ? [] : [`- ${domain} data was not provided to the export — all fields are ${UNAVAILABLE}.`];
}

export function adaptRuleBook(input: RuleBookExportInput | null | undefined): AiDocumentBody {
  const rules = input?.rules ?? [];
  return {
    ...emptyBody(),
    input: [
      kv('Total Rules', input?.totalRules ?? (input?.rules ? rules.length : null)),
      kv('Passed', input?.passedRules),
      kv('Warnings', input?.warningRules),
      kv('Failed', input?.failedRules),
    ],
    analysis: table(
      ['Rule ID', 'Title', 'Layer', 'Mandatory', 'Status', 'Score', 'Max', 'Reason'],
      rules.map((r) => [
        r.id,
        r.title,
        r.layer,
        r.mandatory ?? null,
        r.status,
        r.score,
        r.maxScore,
        r.reason,
      ]),
    ),
    decision: rules
      .filter((r) => fmt(r.status) === 'FAIL' && r.mandatory === true)
      .map((r) => `- Mandatory rule failed: ${fmt(r.id)} — ${fmt(r.reason)}`),
    output: bullets(
      rules.map((r) => `${fmt(r.id)} [${fmt(r.status)}] ${fmt(r.recommendation)}`),
    ),
    checklist: [
      '- [ ] Every mandatory rule has an explicit PASS/FAIL status',
      '- [ ] Every FAIL has a reason',
      '- [ ] Scores stay within their max',
    ],
    warnings: warningsForMissing(rules.length > 0, 'RuleBook'),
  };
}

export function adaptScoreEngine(input: ScoreEngineExportInput | null | undefined): AiDocumentBody {
  const layers = input?.layers ?? [];
  const groups = input?.groupScores ?? {};
  const groupLines = Object.keys(groups)
    .sort()
    .map((key) => kv(key, groups[key]));
  return {
    ...emptyBody(),
    input: table(
      ['Layer', 'Score', 'Max', 'Reason'],
      layers.map((l) => [l.name, l.score, l.maxScore, l.reason]),
    ),
    analysis: groupLines,
    decision: [
      kv('Total Score', input?.totalScore),
      kv('Max Score', input?.maxScore),
      kv('Grade', input?.grade),
      kv('Decision', input?.decision),
    ],
    output: [kv('Final Score', input?.totalScore), kv('Final Decision', input?.decision)],
    checklist: [
      '- [ ] Layer scores sum consistently with group scores',
      '- [ ] Grade matches the total score band',
    ],
    warnings: warningsForMissing(layers.length > 0 || groupLines.length > 0, 'Score Engine'),
  };
}

export function adaptEntryQuality(
  input: EntryQualityExportInput | null | undefined,
): AiDocumentBody {
  const checks = input?.checks ?? [];
  return {
    ...emptyBody(),
    input: table(
      ['Check', 'Status', 'Detail'],
      checks.map((c) => [c.name, c.status, c.detail]),
    ),
    analysis: [kv('Entry Score', input?.entryScore)],
    decision: [kv('Entry Decision', input?.entryDecision), kv('Reason', input?.reason)],
    output: [kv('Entry Quality Verdict', input?.entryDecision)],
    checklist: [
      '- [ ] Every check has a status',
      '- [ ] Entry decision is supported by the checks above',
    ],
    warnings: warningsForMissing(checks.length > 0, 'Entry Quality'),
  };
}

export function adaptPositionAdviser(
  input: PositionAdviserExportInput | null | undefined,
): AiDocumentBody {
  const actions = input?.actions ?? [];
  return {
    ...emptyBody(),
    input: [kv('Position State', input?.positionState), kv('Risk Level', input?.riskLevel)],
    analysis: table(
      ['Priority', 'Action', 'Reason'],
      actions.map((a) => [a.priority, a.action, a.reason]),
    ),
    decision: [kv('Advice', input?.advice)],
    output: bullets(actions.map((a) => `${fmt(a.priority)} — ${fmt(a.action)}`)),
    checklist: [
      '- [ ] Action priorities are consistent (no duplicate top priority)',
      '- [ ] Advice matches the position state and risk level',
    ],
    warnings: warningsForMissing(actions.length > 0, 'Position Adviser'),
  };
}

export function adaptTradePlan(input: TradePlanExportInput | null | undefined): AiDocumentBody {
  const takeProfits = input?.takeProfits ?? [];
  return {
    ...emptyBody(),
    input: [
      kv('Entry Price', input?.entryPrice),
      kv('Stop Loss', input?.stopLoss),
      ...takeProfits.map((tp, i) => kv(`Take Profit ${i + 1}`, tp)),
      ...(takeProfits.length === 0 ? [kv('Take Profit', null)] : []),
    ],
    analysis: [kv('Risk / Reward', input?.riskReward), kv('Position Size', input?.positionSize)],
    decision: [kv('Invalidation', input?.invalidation)],
    output: bullets(input?.planNotes),
    checklist: [
      '- [ ] Stop loss sits on the correct side of entry',
      '- [ ] Risk/Reward is consistent with entry, stop and targets',
    ],
    warnings: warningsForMissing(
      input?.entryPrice !== null && input?.entryPrice !== undefined,
      'Trade Plan',
    ),
  };
}

export function adaptMarketSnapshot(
  input: MarketSnapshotExportInput | null | undefined,
): AiDocumentBody {
  const categories = input?.categories ?? {};
  const categoryNames = Object.keys(categories).sort();
  const inputLines: string[] = [kv('Symbol', input?.symbol), kv('Timeframe', input?.timeframe)];
  const analysisLines: string[] = [];
  for (const name of categoryNames) {
    const values = categories[name] ?? {};
    analysisLines.push(`## ${name}`, '');
    const keys = Object.keys(values).sort();
    if (keys.length === 0) {
      analysisLines.push(`- ${UNAVAILABLE}`);
    } else {
      for (const key of keys) analysisLines.push(`- ${kv(key, values[key])}`);
    }
    analysisLines.push('');
  }
  return {
    ...emptyBody(),
    input: inputLines,
    analysis: analysisLines,
    decision: ['Raw values only — the snapshot makes no decision. AI evaluates the raw inputs.'],
    output: [kv('Categories Exported', categoryNames.length)],
    checklist: [
      '- [ ] Raw indicator values present (EMA/RSI/Volume/Funding/OI/CVD/Spread)',
      '- [ ] No interpreted labels replacing raw values',
    ],
    warnings: warningsForMissing(categoryNames.length > 0, 'Market Snapshot'),
  };
}

export function adaptSignalDecision(
  input: SignalDecisionExportInput | null | undefined,
): AiDocumentBody {
  const flow = input?.flow ?? [];
  return {
    ...emptyBody(),
    input: [
      kv('Direction', input?.direction),
      kv('Confidence', input?.confidence),
      kv('Hard Blocked', input?.hardBlocked ?? null),
    ],
    analysis: table(
      ['Step', 'Result', 'Detail'],
      flow.map((s) => [s.step, s.result, s.detail]),
    ),
    decision: [kv('Decision', input?.decision)],
    output: bullets(input?.blockedReasons),
    checklist: [
      '- [ ] Decision is consistent with the flow steps',
      '- [ ] Every blocked reason maps to a failing step',
    ],
    warnings: warningsForMissing(
      input?.decision !== null && input?.decision !== undefined,
      'Signal Decision',
    ),
  };
}

export function adaptUlAnalytics(
  input: UlAnalyticsExportInput | null | undefined,
): AiDocumentBody {
  const metrics = input?.metrics ?? [];
  return {
    ...emptyBody(),
    input: table(
      ['Metric', 'Value'],
      metrics.map((m) => [m.label, m.value]),
    ),
    analysis: bullets(input?.insights),
    decision: ['Analytics is descriptive — no decision is made in this domain.'],
    output: [kv('Metrics Exported', metrics.length)],
    checklist: ['- [ ] Metrics are internally consistent', '- [ ] Insights cite metric evidence'],
    warnings: warningsForMissing(metrics.length > 0, 'UL Analytics'),
  };
}

export function adaptJournal(input: JournalExportInput | null | undefined): AiDocumentBody {
  const entries = input?.entries ?? [];
  return {
    ...emptyBody(),
    input: [kv('Entries', entries.length)],
    analysis: table(
      ['Trade ID', 'Coin', 'Side', 'Result', 'PnL', 'Note'],
      entries.map((e) => [e.tradeId, e.coin, e.side, e.result, e.pnl, e.note]),
    ),
    decision: ['Journal is historical evidence — no new decision is made here.'],
    output: [kv('Entries Exported', entries.length)],
    checklist: ['- [ ] Each entry has a result', '- [ ] PnL values are present where closed'],
    warnings: warningsForMissing(entries.length > 0, 'Journal'),
  };
}

export function adaptSummary(
  input: SummaryExportInput | null | undefined,
  full: AiExportInput,
): AiDocumentBody {
  const domainPresence: readonly (readonly [string, boolean])[] = [
    ['RuleBook', (full.ruleBook?.rules?.length ?? 0) > 0],
    ['Score Engine', (full.scoreEngine?.layers?.length ?? 0) > 0],
    ['Entry Quality', (full.entryQuality?.checks?.length ?? 0) > 0],
    ['Position Adviser', (full.positionAdviser?.actions?.length ?? 0) > 0],
    ['Trade Plan', full.tradePlan?.entryPrice !== null && full.tradePlan?.entryPrice !== undefined],
    ['Market Snapshot', Object.keys(full.marketSnapshot?.categories ?? {}).length > 0],
    ['Signal Decision', full.signalDecision?.decision !== null && full.signalDecision?.decision !== undefined],
    ['UL Analytics', (full.ulAnalytics?.metrics?.length ?? 0) > 0],
    ['Journal', (full.journal?.entries?.length ?? 0) > 0],
  ];
  return {
    ...emptyBody(),
    input: domainPresence.map(([name, present]) => kv(name, present ? 'PROVIDED' : UNAVAILABLE)),
    analysis: bullets(input?.keyFindings),
    decision: [kv('Overall Decision', input?.overallDecision)],
    output: bullets(input?.openQuestions),
    checklist: [
      '- [ ] All provided domains were reviewed',
      '- [ ] Open questions are actionable',
    ],
    warnings: domainPresence
      .filter(([, present]) => !present)
      .map(([name]) => `- ${name} was not provided — review is partial.`),
  };
}
