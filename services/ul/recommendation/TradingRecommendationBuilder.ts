/**
 * Task 15.4 — Map insights → recommendations (no analysis / no calculation).
 */

import type { TradingInsight, TradingInsightReport } from '../insight/TradingInsightTypes';
import type { ULDashboardData } from '../types';
import { clampRecConfidence } from './TradingRecommendationFormatter';
import {
  RECOMMENDATION_BY_INSIGHT_ID,
  fallbackTemplate,
  priorityFromSeverity,
  type RecommendationTemplate,
} from './TradingRecommendationRules';
import type { TradingRecommendation } from './TradingRecommendationTypes';

function enrichCoinTitle(template: RecommendationTemplate, insight: TradingInsight, dashboard: ULDashboardData | null | undefined): { title: string; action: string } {
  if (!template.titleFromInsight) {
    return { title: template.title, action: template.action };
  }
  const best = dashboard?.coinTable?.bestCoin;
  const worst = dashboard?.coinTable?.worstCoin;
  if (best && worst && best !== worst) {
    return {
      title: `Prioritize ${best} setups`,
      action: `Prioritize ${best} setups; reduce ${worst} exposure`,
    };
  }
  // Fall back to parsing insight title "X outperforming Y"
  const m = insight.title.match(/^(\S+)\s+outperforming\s+(\S+)/i);
  if (m) {
    return {
      title: `Prioritize ${m[1]} setups`,
      action: `Prioritize ${m[1]} setups; reduce ${m[2]} exposure`,
    };
  }
  return { title: template.title, action: template.action };
}

function mapOne(
  insight: TradingInsight,
  dashboard: ULDashboardData | null | undefined,
): TradingRecommendation {
  const template = RECOMMENDATION_BY_INSIGHT_ID[insight.id] ?? fallbackTemplate(insight);
  const { title, action } = enrichCoinTitle(template, insight, dashboard);
  return {
    id: `tr-${template.id}`,
    title,
    description: template.description,
    reason: insight.title,
    priority: priorityFromSeverity(insight.severity),
    confidence: clampRecConfidence(insight.confidence),
    impact: template.impact,
    effort: template.effort,
    expectedBenefit: template.expectedBenefit,
    category: template.category,
    action,
    evidence: [...insight.evidence],
    sourceInsightIds: [insight.id],
  };
}

/**
 * Build raw recommendations from insight list.
 * Dedupes by action key (keep higher priority / confidence).
 */
export function buildRecommendationsFromInsights(
  insightReport: TradingInsightReport | null | undefined,
  dashboard: ULDashboardData | null | undefined,
): TradingRecommendation[] {
  if (insightReport == null || !Array.isArray(insightReport.insights)) {
    return [];
  }

  const mapped = insightReport.insights.map((i) => mapOne(i, dashboard));

  // Duplicate removal by action (case-insensitive), merge source ids
  const byAction = new Map<string, TradingRecommendation>();
  for (const rec of mapped) {
    const key = rec.action.trim().toLowerCase();
    const prev = byAction.get(key);
    if (!prev) {
      byAction.set(key, rec);
      continue;
    }
    // Prefer higher priority (lower rank number), then confidence
    const preferNew =
      priorityRank(rec.priority) < priorityRank(prev.priority) ||
      (priorityRank(rec.priority) === priorityRank(prev.priority) &&
        rec.confidence > prev.confidence);
    if (preferNew) {
      byAction.set(key, {
        ...rec,
        sourceInsightIds: uniqueIds([...prev.sourceInsightIds, ...rec.sourceInsightIds]),
        evidence: uniqueStrings([...prev.evidence, ...rec.evidence]),
      });
    } else {
      byAction.set(key, {
        ...prev,
        sourceInsightIds: uniqueIds([...prev.sourceInsightIds, ...rec.sourceInsightIds]),
        evidence: uniqueStrings([...prev.evidence, ...rec.evidence]),
      });
    }
  }

  return [...byAction.values()];
}

function priorityRank(p: TradingRecommendation['priority']): number {
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  return order[p];
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function uniqueStrings(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}
