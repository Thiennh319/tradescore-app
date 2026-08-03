/**
 * Task 15.8 — Trading Coach Engine orchestrator.
 * Reads reports only. Deterministic. No AI / UI / mutations.
 */

import type { ULCompareReport } from '../compare/ULCompareTypes';
import type { EntryQualityReport } from '../entry/EntryQualityTypes';
import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { TradingPsychologyReport } from '../psychology/TradingPsychologyTypes';
import type { TradingRecommendationReport } from '../recommendation/TradingRecommendationTypes';
import type { StrategyAnalyticsReport } from '../strategy/StrategyAnalyticsTypes';
import type { ULDashboardData } from '../types';
import { buildTradingCoachFromInputs } from './TradingCoachBuilder';
import type { TradingCoachReport } from './TradingCoachTypes';
import { TRADING_COACH_VERSION } from './TradingCoachTypes';

function emptyReport(headline: string): TradingCoachReport {
  return {
    version: TRADING_COACH_VERSION,
    summary: {
      headline,
      overallStatus: 'Neutral',
      coachScore: 0,
      grade: 'F',
    },
    dailyFocus: ['Follow checklist before entry'],
    topPriorities: [],
    actionPlan: [],
    coachMessages: [],
    weeklyGoals: [],
    nextSessionChecklist: [],
    confidence: 0,
    evidence: [],
  };
}

function allNull(
  dashboard: unknown,
  compare: unknown,
  insight: unknown,
  recommendation: unknown,
  psychology: unknown,
  strategy: unknown,
  entry: unknown,
): boolean {
  return (
    dashboard == null &&
    compare == null &&
    insight == null &&
    recommendation == null &&
    psychology == null &&
    strategy == null &&
    entry == null
  );
}

/**
 * Primary API — merge existing UL reports into TradingCoachReport.
 * Never throws. Does not mutate inputs. O(1) vs trade history.
 */
export function buildTradingCoachReport(
  dashboard: ULDashboardData | null | undefined,
  compare: ULCompareReport | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
  psychology: TradingPsychologyReport | null | undefined,
  strategy: StrategyAnalyticsReport | null | undefined,
  entry: EntryQualityReport | null | undefined,
): TradingCoachReport {
  try {
    if (allNull(dashboard, compare, insight, recommendation, psychology, strategy, entry)) {
      return emptyReport('No coaching inputs.');
    }
    return buildTradingCoachFromInputs(
      dashboard,
      compare,
      insight,
      recommendation,
      psychology,
      strategy,
      entry,
    );
  } catch {
    return emptyReport('Coach evaluation failed safely.');
  }
}
