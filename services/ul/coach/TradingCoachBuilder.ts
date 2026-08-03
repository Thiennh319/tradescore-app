/**
 * Task 15.8 — Trading Coach builder.
 * Prioritize · summarize · organize · merge. Never calculate / analyze / predict.
 */

import type { ULCompareReport } from '../compare/ULCompareTypes';
import type { EntryQualityReport } from '../entry/EntryQualityTypes';
import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { TradingPsychologyReport } from '../psychology/TradingPsychologyTypes';
import type { TradingRecommendationReport } from '../recommendation/TradingRecommendationTypes';
import type { StrategyAnalyticsReport } from '../strategy/StrategyAnalyticsTypes';
import type { ULDashboardData } from '../types';
import { clampCoachScore } from './TradingCoachFormatter';
import {
  COACH_MESSAGE_BY_SOURCE,
  COACH_RULES,
  coachGradeFromScore,
  DEFAULT_CHECKLIST,
  DEFAULT_WEEKLY_GOAL_TEMPLATES,
  mapEffortToDifficulty,
  mapRecPriority,
  mapSeverityToPriority,
  overallStatusFromSignals,
} from './TradingCoachRules';
import type {
  TradingCoachAction,
  TradingCoachChecklistItem,
  TradingCoachEvidenceRef,
  TradingCoachMessage,
  TradingCoachPriority,
  TradingCoachPriorityItem,
  TradingCoachReport,
  TradingCoachSummary,
  TradingCoachWeeklyGoal,
} from './TradingCoachTypes';
import { TRADING_COACH_PRIORITY_RANK, TRADING_COACH_VERSION } from './TradingCoachTypes';

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  let s = 0;
  for (const n of nums) s += n;
  return s / nums.length;
}

function sortByPriority<T extends { priority: TradingCoachPriority }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const p = TRADING_COACH_PRIORITY_RANK[a.priority] - TRADING_COACH_PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return a.id.localeCompare(b.id);
  });
}

/** Mean of already-computed report confidences / scores — no trade loops. */
export function mergeCoachConfidence(input: {
  insight: TradingInsightReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
}): number {
  const parts: number[] = [];
  if (input.insight?.insights?.length) {
    const a = avg(input.insight.insights.map((i) => i.confidence));
    if (a != null) parts.push(a);
  }
  if (input.psychology?.findings?.length) {
    const a = avg(input.psychology.findings.map((f) => f.confidence));
    if (a != null) parts.push(a);
  } else if (input.psychology && Number.isFinite(input.psychology.score)) {
    parts.push(input.psychology.score);
  }
  if (input.entry && Number.isFinite(input.entry.confidence)) {
    parts.push(input.entry.confidence);
  }
  if (input.strategy && Number.isFinite(input.strategy.confidence)) {
    parts.push(input.strategy.confidence);
  }
  if (parts.length === 0) return 0;
  return clampCoachScore(avg(parts)!);
}

/** Merge already-computed scores into a coach score (organize only). */
export function mergeCoachScore(input: {
  dashboard: ULDashboardData | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
}): number {
  const parts: number[] = [];
  const perf = input.dashboard?.score?.performanceScore ?? input.dashboard?.metrics?.performanceScore;
  if (Number.isFinite(perf)) parts.push(perf as number);
  if (input.psychology && Number.isFinite(input.psychology.score)) parts.push(input.psychology.score);
  if (input.strategy?.bestStrategy && Number.isFinite(input.strategy.bestStrategy.score)) {
    parts.push(input.strategy.bestStrategy.score);
  } else if (input.strategy && Number.isFinite(input.strategy.confidence)) {
    parts.push(input.strategy.confidence);
  }
  if (input.entry && Number.isFinite(input.entry.score)) parts.push(input.entry.score);
  if (parts.length === 0) return 0;
  return clampCoachScore(avg(parts)!);
}

export function collectCoachEvidence(input: {
  insight: TradingInsightReport | null | undefined;
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
}): TradingCoachEvidenceRef[] {
  const out: TradingCoachEvidenceRef[] = [];
  const seen = new Set<string>();
  const push = (ref: TradingCoachEvidenceRef) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ref);
  };

  for (const i of input.insight?.insights ?? []) {
    push({ kind: 'insight', id: i.id, label: i.title });
  }
  for (const r of input.recommendation?.recommendations ?? []) {
    push({ kind: 'recommendation', id: r.id, label: r.title });
  }
  for (const f of input.psychology?.findings ?? []) {
    push({ kind: 'psychology', id: f.id, label: f.title });
  }
  for (const s of input.strategy?.strategies ?? []) {
    push({ kind: 'strategy', id: s.id, label: s.name });
  }
  for (const c of input.entry?.checks ?? []) {
    push({ kind: 'entry_check', id: c.id, label: c.title });
  }
  for (const e of input.entry?.evidence ?? []) {
    push({ kind: 'entry_evidence', id: e.checkId, label: e.title });
  }
  return out;
}

export function buildTopPriorities(input: {
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
}): TradingCoachPriorityItem[] {
  const items: TradingCoachPriorityItem[] = [];

  for (const r of input.recommendation?.recommendations ?? []) {
    if (r.priority === 'INFO') continue;
    items.push({
      id: `pri-${r.id}`,
      title: r.title,
      priority: mapRecPriority(r.priority),
      source: 'recommendation',
      evidenceRefs: [r.id, ...r.sourceInsightIds],
    });
  }

  for (const f of input.psychology?.warnings ?? []) {
    items.push({
      id: `pri-${f.id}`,
      title: f.title,
      priority: mapSeverityToPriority(f.severity),
      source: 'psychology',
      evidenceRefs: [f.id],
    });
  }
  for (const f of input.psychology?.weaknesses ?? []) {
    if (items.some((x) => x.id === `pri-${f.id}`)) continue;
    items.push({
      id: `pri-${f.id}`,
      title: f.title,
      priority: mapSeverityToPriority(f.severity),
      source: 'psychology',
      evidenceRefs: [f.id],
    });
  }

  if (input.entry?.decision === 'AVOID') {
    items.push({
      id: 'pri-entry-avoid',
      title: 'Entry quality blocked — avoid new entries',
      priority: 'CRITICAL',
      source: 'entry',
      evidenceRefs: input.entry.failedChecks.map((c) => c.id),
    });
  } else if (input.entry?.decision === 'WAIT') {
    items.push({
      id: 'pri-entry-wait',
      title: 'Entry quality incomplete — wait',
      priority: 'HIGH',
      source: 'entry',
      evidenceRefs: input.entry.failedChecks.map((c) => c.id),
    });
  }

  const weak = input.strategy?.strategies?.find(
    (s) => s.status === 'Weak' || s.status === 'Deprecated' || s.tags.includes('Declining Strategy'),
  );
  if (weak) {
    items.push({
      id: `pri-strat-weak-${weak.id}`,
      title: `Reduce or pause weak strategy: ${weak.name}`,
      priority: weak.status === 'Deprecated' ? 'HIGH' : 'MEDIUM',
      source: 'strategy',
      evidenceRefs: [weak.id],
    });
  }

  return sortByPriority(items).slice(0, COACH_RULES.MAX_PRIORITIES);
}

export function buildActionPlan(input: {
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
}): TradingCoachAction[] {
  const actions: TradingCoachAction[] = [];

  for (const r of input.recommendation?.recommendations ?? []) {
    if (r.priority === 'INFO') continue;
    actions.push({
      id: `act-${r.id}`,
      title: r.action,
      description: r.description,
      priority: mapRecPriority(r.priority),
      expectedBenefit: r.expectedBenefit,
      estimatedDifficulty: mapEffortToDifficulty(r.effort),
      source: 'recommendation',
      evidenceRefs: [r.id, ...r.sourceInsightIds],
    });
  }

  for (const f of input.psychology?.findings ?? []) {
    if (f.psychologyType === 'Healthy Habit') continue;
    if (f.severity === 'INFO' || f.severity === 'LOW') continue;
    actions.push({
      id: `act-${f.id}`,
      title: f.improvement,
      description: f.habit,
      priority: mapSeverityToPriority(f.severity),
      expectedBenefit: 'Discipline',
      estimatedDifficulty: 'MEDIUM',
      source: 'psychology',
      evidenceRefs: [f.id],
    });
  }

  for (const rec of input.entry?.recommendations ?? []) {
    actions.push({
      id: `act-entry-${actions.length}`,
      title: rec,
      description: rec,
      priority: input.entry?.decision === 'AVOID' ? 'CRITICAL' : 'HIGH',
      expectedBenefit: 'Execution',
      estimatedDifficulty: 'EASY',
      source: 'entry',
      evidenceRefs: (input.entry?.failedChecks ?? []).map((c) => c.id),
    });
  }

  const best = input.strategy?.bestStrategy;
  if (best && (best.status === 'Excellent' || best.status === 'Healthy')) {
    actions.push({
      id: `act-strat-best-${best.id}`,
      title: `Focus size on ${best.name}`,
      description: best.recommendation,
      priority: 'MEDIUM',
      expectedBenefit: 'Consistency',
      estimatedDifficulty: 'EASY',
      source: 'strategy',
      evidenceRefs: [best.id],
    });
  }

  // Dedupe by title
  const byTitle = new Map<string, TradingCoachAction>();
  for (const a of sortByPriority(actions)) {
    const key = a.title.trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, a);
  }
  return [...byTitle.values()].slice(0, COACH_RULES.MAX_ACTIONS);
}

export function buildCoachMessages(input: {
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  priorities: readonly TradingCoachPriorityItem[];
}): TradingCoachMessage[] {
  const msgs: TradingCoachMessage[] = [];
  const push = (id: string, text: string, priority: TradingCoachPriority, source: string) => {
    if (!text) return;
    if (msgs.some((m) => m.text === text)) return;
    msgs.push({ id, text, priority, source });
  };

  for (const r of input.recommendation?.recommendations ?? []) {
    for (const sid of r.sourceInsightIds) {
      const line = COACH_MESSAGE_BY_SOURCE[sid];
      if (line) push(`msg-${sid}`, line, mapRecPriority(r.priority), 'recommendation');
    }
    // Fallback: use recommendation action (already short)
    if (r.action && r.priority !== 'INFO') {
      push(`msg-${r.id}`, r.action.endsWith('.') ? r.action : `${r.action}.`, mapRecPriority(r.priority), 'recommendation');
    }
  }

  for (const f of input.psychology?.findings ?? []) {
    const line = COACH_MESSAGE_BY_SOURCE[f.id] ?? null;
    if (line) {
      push(`msg-${f.id}`, line, mapSeverityToPriority(f.severity), 'psychology');
    } else if (f.psychologyType === 'Revenge Trading') {
      push(`msg-${f.id}`, COACH_MESSAGE_BY_SOURCE['psy-revenge']!, mapSeverityToPriority(f.severity), 'psychology');
    } else if (f.psychologyType === 'Poor RR Discipline') {
      push(`msg-${f.id}`, COACH_MESSAGE_BY_SOURCE['psy-poor-rr']!, mapSeverityToPriority(f.severity), 'psychology');
    }
  }

  if (input.entry?.decision === 'AVOID') {
    push('msg-entry-avoid', COACH_MESSAGE_BY_SOURCE.entry_avoid!, 'CRITICAL', 'entry');
  } else if (input.entry?.decision === 'WAIT') {
    push('msg-entry-wait', COACH_MESSAGE_BY_SOURCE.entry_wait!, 'HIGH', 'entry');
  }

  const weak = input.strategy?.strategies?.find(
    (s) => s.status === 'Weak' || s.status === 'Deprecated',
  );
  if (weak) {
    push('msg-strat-weak', COACH_MESSAGE_BY_SOURCE.strategy_weak!, 'HIGH', 'strategy');
  }
  const strong = input.strategy?.bestStrategy;
  if (strong && (strong.status === 'Excellent' || strong.status === 'Healthy')) {
    push('msg-strat-strong', COACH_MESSAGE_BY_SOURCE.strategy_strong!, 'MEDIUM', 'strategy');
  }

  if (input.priorities.some((p) => p.priority === 'CRITICAL')) {
    push('msg-protect', COACH_MESSAGE_BY_SOURCE.protect_capital!, 'CRITICAL', 'coach');
  }

  return sortByPriority(msgs).slice(0, COACH_RULES.MAX_MESSAGES);
}

export function buildDailyFocus(input: {
  messages: readonly TradingCoachMessage[];
  priorities: readonly TradingCoachPriorityItem[];
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
}): string[] {
  const focus: string[] = [];
  const add = (s: string) => {
    if (s && !focus.includes(s) && focus.length < COACH_RULES.MAX_DAILY_FOCUS) focus.push(s);
  };

  if (
    input.priorities.some((p) => p.priority === 'CRITICAL') ||
    input.messages.some((m) =>
      /position size|consecutive losses|Protect capital/i.test(m.text),
    )
  ) {
    add('Protect Capital');
  }
  if (
    input.messages.some((m) => /RR/i.test(m.text)) ||
    input.entry?.detections?.includes('Poor RR')
  ) {
    add('Improve RR');
  }
  const best = input.strategy?.bestStrategy?.name;
  if (best) add(`Trade ${best} only`);

  for (const m of input.messages) {
    if (focus.length >= COACH_RULES.MAX_DAILY_FOCUS) break;
    // Shorten message to focus phrase
    const short = m.text.replace(/\.$/, '');
    if (short.length <= 40) add(short);
  }

  if (focus.length === 0) add('Follow checklist before entry');
  return focus.slice(0, COACH_RULES.MAX_DAILY_FOCUS);
}

export function buildWeeklyGoals(input: {
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
}): TradingCoachWeeklyGoal[] {
  const needRr =
    input.entry?.detections?.includes('Poor RR') ||
    input.psychology?.findings?.some((f) => f.psychologyType === 'Poor RR Discipline') ||
    input.recommendation?.recommendations?.some((r) => /rr/i.test(r.id) || /rr/i.test(r.title));
  const needRisk =
    input.psychology?.findings?.some((f) => f.psychologyType === 'Large Drawdown Behavior') ||
    input.recommendation?.critical?.length;
  const needDisc =
    (input.psychology?.traits?.find((t) => t.id === 'Discipline')?.score ?? 100) < 80 ||
    input.psychology?.warnings?.length;
  const needStrat = input.strategy?.worstStrategy != null;

  const goals: TradingCoachWeeklyGoal[] = [];
  for (const t of DEFAULT_WEEKLY_GOAL_TEMPLATES) {
    if (goals.length >= COACH_RULES.MAX_WEEKLY_GOALS) break;
    if (t.when === 'always' || t.when === 'performance') {
      goals.push({ id: t.id, label: t.label, target: t.target, source: 'coach' });
      continue;
    }
    if (t.when === 'rr' && needRr) {
      goals.push({ id: t.id, label: t.label, target: t.target, source: 'entry/psychology' });
    }
    if (t.when === 'risk' && needRisk) {
      goals.push({ id: t.id, label: t.label, target: t.target, source: 'psychology' });
    }
    if (t.when === 'discipline' && needDisc) {
      goals.push({ id: t.id, label: t.label, target: t.target, source: 'psychology' });
    }
    if (t.when === 'strategy' && needStrat) {
      goals.push({ id: t.id, label: t.label, target: t.target, source: 'strategy' });
    }
  }
  return goals.slice(0, COACH_RULES.MAX_WEEKLY_GOALS);
}

export function buildNextSessionChecklist(
  entry: EntryQualityReport | null | undefined,
): TradingCoachChecklistItem[] {
  return DEFAULT_CHECKLIST.map((ck) => {
    const check = ck.entryCheckId
      ? entry?.checks?.find((c) => c.id === ck.entryCheckId)
      : undefined;
    return {
      id: ck.id,
      label: ck.label,
      status: check?.status ?? null,
      source: check ? 'entry' : 'coach',
      evidenceRefs: check ? [check.id] : [],
    };
  }).slice(0, COACH_RULES.MAX_CHECKLIST);
}

export function buildCoachSummary(input: {
  coachScore: number;
  priorities: readonly TradingCoachPriorityItem[];
  compare: ULCompareReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
}): TradingCoachSummary {
  const hasCritical =
    input.priorities.some((p) => p.priority === 'CRITICAL') ||
    input.entry?.decision === 'AVOID' ||
    input.psychology?.summary?.topSeverity === 'CRITICAL';
  const hasWarning =
    input.priorities.some((p) => p.priority === 'HIGH') ||
    input.entry?.decision === 'WAIT' ||
    (input.compare?.summary?.worsenedCount ?? 0) > (input.compare?.summary?.improvedCount ?? 0);
  const improving =
    (input.compare?.summary?.improvedCount ?? 0) > (input.compare?.summary?.worsenedCount ?? 0);

  const overallStatus = overallStatusFromSignals({
    coachScore: input.coachScore,
    hasCritical,
    hasWarning,
    improving,
  });
  const grade = coachGradeFromScore(input.coachScore);

  let headline = `Coach status: ${overallStatus}`;
  if (input.priorities[0]) headline = input.priorities[0].title;
  else if (input.psychology?.summary?.headline) headline = input.psychology.summary.headline;

  return {
    headline,
    overallStatus,
    coachScore: input.coachScore,
    grade,
  };
}

export function assembleTradingCoachReport(parts: {
  summary: TradingCoachSummary;
  dailyFocus: readonly string[];
  topPriorities: readonly TradingCoachPriorityItem[];
  actionPlan: readonly TradingCoachAction[];
  coachMessages: readonly TradingCoachMessage[];
  weeklyGoals: readonly TradingCoachWeeklyGoal[];
  nextSessionChecklist: readonly TradingCoachChecklistItem[];
  confidence: number;
  evidence: readonly TradingCoachEvidenceRef[];
}): TradingCoachReport {
  return {
    version: TRADING_COACH_VERSION,
    summary: parts.summary,
    dailyFocus: parts.dailyFocus,
    topPriorities: parts.topPriorities,
    actionPlan: parts.actionPlan,
    coachMessages: parts.coachMessages,
    weeklyGoals: parts.weeklyGoals,
    nextSessionChecklist: parts.nextSessionChecklist,
    confidence: parts.confidence,
    evidence: parts.evidence,
  };
}

export function buildTradingCoachFromInputs(
  dashboard: ULDashboardData | null | undefined,
  compare: ULCompareReport | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
  psychology: TradingPsychologyReport | null | undefined,
  strategy: StrategyAnalyticsReport | null | undefined,
  entry: EntryQualityReport | null | undefined,
): TradingCoachReport {
  const topPriorities = buildTopPriorities({ recommendation, psychology, entry, strategy });
  const actionPlan = buildActionPlan({ recommendation, psychology, entry, strategy });
  const coachMessages = buildCoachMessages({
    recommendation,
    psychology,
    entry,
    strategy,
    priorities: topPriorities,
  });
  const dailyFocus = buildDailyFocus({ messages: coachMessages, priorities: topPriorities, entry, strategy });
  const weeklyGoals = buildWeeklyGoals({ recommendation, psychology, entry, strategy });
  const nextSessionChecklist = buildNextSessionChecklist(entry);
  const coachScore = mergeCoachScore({ dashboard, psychology, strategy, entry });
  const confidence = mergeCoachConfidence({ insight, psychology, strategy, entry });
  const evidence = collectCoachEvidence({ insight, recommendation, psychology, strategy, entry });
  const summary = buildCoachSummary({ coachScore, priorities: topPriorities, compare, psychology, entry });

  return assembleTradingCoachReport({
    summary,
    dailyFocus,
    topPriorities,
    actionPlan,
    coachMessages,
    weeklyGoals,
    nextSessionChecklist,
    confidence,
    evidence,
  });
}
