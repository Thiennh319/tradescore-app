/**
 * Task 14.3 — Project Statistics VM → Performance sections (no metrics).
 */

import type { StatisticsViewModel } from '../statistics';
import { buildComparisons } from './performanceComparison';
import { buildPerformanceSnapshot } from './performanceMetadata';
import { buildRecommendations } from './performanceRecommendation';
import { rankByWinRate, rankGroups } from './performanceRanking';
import { buildTrends, growthFromTrends } from './performanceTrend';
import type {
  ConfidenceAnalysis,
  PerformanceGrade,
  PerformanceOverall,
  PerformanceViewModel,
  TagIntelligence,
} from './performanceTypes';

function gradeFromScore(score: number | null): PerformanceGrade {
  if (score == null) return 'NA';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function buildOverall(stats: StatisticsViewModel, growth: PerformanceOverall['growthTrend']): PerformanceOverall {
  const wr = stats.overview.winRate;
  const pf = stats.profit.profitFactor;
  const exp = stats.profit.expectancyUsdt;
  const dd = stats.drawdown.maxDrawdownUsdt;
  let score: number | null = null;
  if (stats.sampleSize > 0) {
    score =
      (wr ?? 0) * 0.5 +
      Math.min(pf ?? 1, 5) * 6 +
      (exp ?? 0) * 0.4 -
      Math.min(dd ?? 0, 100) * 0.15;
  }
  const consistency =
    stats.sampleSize > 0
      ? Math.max(
          0,
          100 -
            stats.drawdown.longestLosingStreak * 8 +
            stats.drawdown.longestWinningStreak * 2,
        )
      : null;
  const stability =
    dd == null || stats.overview.netPnlUsdt == null
      ? null
      : Math.max(0, 100 - (dd / Math.max(1, Math.abs(stats.overview.netPnlUsdt) + dd)) * 100);

  return {
    overallScore: score == null ? null : Math.round(score * 10) / 10,
    overallRank: score == null ? 'UNRANKED' : score >= 70 ? 'STRONG' : score >= 50 ? 'FAIR' : 'WEAK',
    overallGrade: gradeFromScore(score),
    systemStability: stability == null ? null : Math.round(stability * 10) / 10,
    consistency: consistency == null ? null : Math.round(Math.min(100, consistency) * 10) / 10,
    growthTrend: growth,
  };
}

function buildConfidence(stats: StatisticsViewModel): ConfidenceAnalysis[] {
  const sampleExp = stats.profit.expectancyUsdt;
  return [...stats.byConfidence]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => {
      let note = 'Insufficient sample';
      if (r.trades > 0 && r.expectancyUsdt != null && sampleExp != null) {
        if (r.key === 'High' && r.expectancyUsdt >= sampleExp) {
          note = 'High confidence cohort at/above sample expectancy — calibration OK';
        } else if (r.key === 'High' && r.expectancyUsdt < sampleExp) {
          note = 'High confidence underperforms sample expectancy — check calibration';
        } else if (r.key === 'Low' && (r.winRate ?? 0) > (stats.overview.winRate ?? 0)) {
          note = 'Low confidence outperforms — confidence may be miscalibrated';
        } else {
          note = 'Aligned with Statistics cohort';
        }
      }
      return {
        key: r.key,
        trades: r.trades,
        winRate: r.winRate,
        averageRr: r.averageRr,
        pnlUsdt: r.pnlUsdt,
        calibrationNote: note,
      };
    });
}

function buildTagIntelligence(stats: StatisticsViewModel): TagIntelligence {
  const topWinningTags = rankByWinRate(stats.byTag, 'best', 5);
  const topLosingTags = rankByWinRate(stats.byTag, 'worst', 5);
  const combos = rankGroups(stats.byTagCombo);
  return {
    topWinningTags,
    topLosingTags,
    bestTagCombination: combos[0] ?? null,
    worstTagCombination: combos.length > 0 ? combos[combos.length - 1]! : null,
  };
}

/** Pure projector: StatisticsViewModel → PerformanceViewModel */
export function projectPerformanceViewModel(
  stats: StatisticsViewModel,
  generatedAt?: string,
): PerformanceViewModel {
  const strategyRanking = rankGroups(stats.byStrategy);
  const coinRanking = rankGroups(stats.byCoin);
  const triggerRanking = rankGroups(stats.byTrigger);
  const advisorRanking = rankGroups(stats.byAdvisor);
  const tagIntelligence = buildTagIntelligence(stats);
  const trends = buildTrends(stats);
  const growthTrend = growthFromTrends(trends);
  const overall = buildOverall(stats, growthTrend);
  const recommendations = buildRecommendations(stats, coinRanking, strategyRanking, tagIntelligence);
  const comparisons = buildComparisons(stats);

  return Object.freeze({
    overall,
    strategyRanking,
    coinRanking,
    triggerRanking,
    confidenceAnalysis: buildConfidence(stats),
    advisorRanking,
    tagIntelligence: Object.freeze(tagIntelligence),
    trends,
    recommendations,
    comparisons,
    snapshot: buildPerformanceSnapshot(stats, generatedAt),
  }) as PerformanceViewModel;
}
