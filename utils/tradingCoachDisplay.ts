/**
 * Task 15.8.1 — Trading Coach UI localization (Vietnamese).
 * Display-only. Does not mutate TradingCoachReport / engine / tests.
 */

import { vi } from '../constants/vi';
import type {
  TradingCoachAction,
  TradingCoachChecklistItem,
  TradingCoachEvidenceRef,
  TradingCoachMessage,
  TradingCoachOverallStatus,
  TradingCoachPriority,
  TradingCoachPriorityItem,
  TradingCoachReport,
  TradingCoachSummary,
  TradingCoachWeeklyGoal,
} from '../services/ul/coach/TradingCoachTypes';

const tc = vi.tradingCoach;

export type TradingCoachUiLabels = {
  title: string;
  sections: typeof tc.sections;
};

export const tradingCoachUiLabels: TradingCoachUiLabels = {
  title: tc.title,
  sections: tc.sections,
};

export function formatCoachStatusVi(status: TradingCoachOverallStatus): string {
  return tc.status[status] ?? status;
}

export function formatCoachPriorityVi(
  priority: TradingCoachPriority | 'INFO' | string,
): string {
  const key = priority as keyof typeof tc.priority;
  return tc.priority[key] ?? priority;
}

/** Translate a known English display phrase; leave unknown text as-is only if no pattern matches. */
export function localizeCoachPhrase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const exact = tc.phrases[trimmed as keyof typeof tc.phrases];
  if (exact) return exact;

  // "Trade V4 only" / "Trade BTC only"
  const tradeOnly = trimmed.match(/^Trade\s+(.+)\s+only$/i);
  if (tradeOnly) {
    return `Ưu tiên giao dịch ${tradeOnly[1]}`;
  }

  // "Reduce or pause weak strategy: NAME"
  const weakStrat = trimmed.match(/^Reduce or pause weak strategy:\s*(.+)$/i);
  if (weakStrat) {
    return `Giảm hoặc tạm dừng chiến lược yếu: ${weakStrat[1]}`;
  }

  // "Focus size on NAME"
  const focusSize = trimmed.match(/^Focus size on\s+(.+)$/i);
  if (focusSize) {
    return `Tập trung khối lượng vào ${focusSize[1]}`;
  }

  // "Coach status: X"
  const coachStatus = trimmed.match(/^Coach status:\s*(.+)$/i);
  if (coachStatus) {
    const st = coachStatus[1] as TradingCoachOverallStatus;
    return `Trạng thái HLV: ${formatCoachStatusVi(st)}`;
  }

  // Checklist keys
  const ck = tc.checklist[trimmed as keyof typeof tc.checklist];
  if (ck) return ck;

  return trimmed;
}

export function localizeCoachChecklistLabel(label: string): string {
  return tc.checklist[label as keyof typeof tc.checklist] ?? localizeCoachPhrase(label);
}

export type TradingCoachUiView = {
  labels: TradingCoachUiLabels;
  summary: {
    headline: string;
    overallStatus: string;
    overallStatusKey: TradingCoachOverallStatus;
    coachScore: number;
    grade: string;
  };
  dailyFocus: readonly string[];
  topPriorities: readonly {
    id: string;
    title: string;
    priority: string;
    priorityKey: TradingCoachPriority;
    source: string;
    evidenceRefs: readonly string[];
  }[];
  actionPlan: readonly {
    id: string;
    title: string;
    description: string;
    priority: string;
    priorityKey: TradingCoachPriority;
    expectedBenefit: string;
    estimatedDifficulty: string;
    source: string;
    evidenceRefs: readonly string[];
  }[];
  coachMessages: readonly {
    id: string;
    text: string;
    priority: string;
    priorityKey: TradingCoachPriority;
    source: string;
  }[];
  weeklyGoals: readonly {
    id: string;
    label: string;
    target: string;
    source: string;
  }[];
  nextSessionChecklist: readonly {
    id: string;
    label: string;
    status: TradingCoachChecklistItem['status'];
    source: string;
    evidenceRefs: readonly string[];
  }[];
  confidence: number;
  evidence: readonly TradingCoachEvidenceRef[];
};

function localizeSummary(summary: TradingCoachSummary): TradingCoachUiView['summary'] {
  return {
    headline: localizeCoachPhrase(summary.headline),
    overallStatus: formatCoachStatusVi(summary.overallStatus),
    overallStatusKey: summary.overallStatus,
    coachScore: summary.coachScore,
    grade: summary.grade,
  };
}

function localizePriority(p: TradingCoachPriorityItem): TradingCoachUiView['topPriorities'][number] {
  return {
    id: p.id,
    title: localizeCoachPhrase(p.title),
    priority: formatCoachPriorityVi(p.priority),
    priorityKey: p.priority,
    source: p.source,
    evidenceRefs: p.evidenceRefs,
  };
}

function localizeAction(a: TradingCoachAction): TradingCoachUiView['actionPlan'][number] {
  return {
    id: a.id,
    title: localizeCoachPhrase(a.title),
    description: localizeCoachPhrase(a.description),
    priority: formatCoachPriorityVi(a.priority),
    priorityKey: a.priority,
    expectedBenefit: a.expectedBenefit,
    estimatedDifficulty: a.estimatedDifficulty,
    source: a.source,
    evidenceRefs: a.evidenceRefs,
  };
}

function localizeMessage(m: TradingCoachMessage): TradingCoachUiView['coachMessages'][number] {
  return {
    id: m.id,
    text: localizeCoachPhrase(m.text),
    priority: formatCoachPriorityVi(m.priority),
    priorityKey: m.priority,
    source: m.source,
  };
}

function localizeGoal(g: TradingCoachWeeklyGoal): TradingCoachUiView['weeklyGoals'][number] {
  return {
    id: g.id,
    label: localizeCoachPhrase(g.label),
    target: g.target,
    source: g.source,
  };
}

function localizeChecklist(
  c: TradingCoachChecklistItem,
): TradingCoachUiView['nextSessionChecklist'][number] {
  return {
    id: c.id,
    label: localizeCoachChecklistLabel(c.label),
    status: c.status,
    source: c.source,
    evidenceRefs: c.evidenceRefs,
  };
}

/**
 * Map TradingCoachReport → Vietnamese UI view.
 * Engine report is never mutated.
 */
export function localizeTradingCoachReportForUi(
  report: TradingCoachReport,
): TradingCoachUiView {
  return {
    labels: tradingCoachUiLabels,
    summary: localizeSummary(report.summary),
    dailyFocus: report.dailyFocus.map(localizeCoachPhrase),
    topPriorities: report.topPriorities.map(localizePriority),
    actionPlan: report.actionPlan.map(localizeAction),
    coachMessages: report.coachMessages.map(localizeMessage),
    weeklyGoals: report.weeklyGoals.map(localizeGoal),
    nextSessionChecklist: report.nextSessionChecklist.map(localizeChecklist),
    confidence: report.confidence,
    evidence: report.evidence,
  };
}
