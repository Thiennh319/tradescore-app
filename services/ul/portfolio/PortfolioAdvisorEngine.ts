/**
 * Task 15.9 — Portfolio Advisor Engine orchestrator.
 * Read-only portfolio planning. No AI / market scan / Journal access.
 */

import type { ULCompareReport } from '../compare/ULCompareTypes';
import type { EntryQualityReport } from '../entry/EntryQualityTypes';
import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { TradingPsychologyReport } from '../psychology/TradingPsychologyTypes';
import type { TradingRecommendationReport } from '../recommendation/TradingRecommendationTypes';
import type { StrategyAnalyticsReport } from '../strategy/StrategyAnalyticsTypes';
import type { TradingCoachReport } from '../coach/TradingCoachTypes';
import type { ULDashboardData } from '../types';
import { buildPortfolioAdvisorFromInputs } from './PortfolioAdvisorBuilder';
import type { PortfolioAdvisorReport } from './PortfolioAdvisorTypes';
import { PORTFOLIO_ADVISOR_VERSION } from './PortfolioAdvisorTypes';

function emptyReport(headline: string): PortfolioAdvisorReport {
  return {
    version: PORTFOLIO_ADVISOR_VERSION,
    summary: {
      headline,
      status: 'Neutral',
      advisorScore: 0,
      grade: 'F',
    },
    portfolio: {
      preferredCoins: [],
      avoidCoins: [],
      watchCoins: [],
    },
    riskPlan: {
      level: 'Critical',
      posture: 'Cash',
      cashReservePct: 100,
    },
    capitalAllocation: {
      BTC: 0,
      SOL: 0,
      BNB: 0,
      NEAR: 0,
      Cash: 100,
    },
    strategyAllocation: [],
    tradePlan: {
      maxTrades: 0,
      riskPerTrade: 0,
      maxDailyLoss: 0,
      targetRR: '>=2',
      preferredSide: 'NONE',
    },
    sessionPlan: {
      bestTradingHours: [],
      avoidHours: [],
      preferredMarket: null,
    },
    limits: {
      maxLeverage: 0,
      maxPositionSize: 0,
      maxConsecutiveLoss: 2,
      stopTradingAfterLoss: true,
    },
    warnings: [],
    confidence: 0,
    evidence: {
      coach: [],
      entry: [],
      strategy: [],
      recommendation: [],
      psychology: [],
    },
  };
}

/**
 * Public API — existing Phase 15 reports → PortfolioAdvisorReport.
 * Never throws and never mutates inputs. O(1) relative to historical trades.
 */
export function buildPortfolioAdvisorReport(
  dashboard: ULDashboardData | null | undefined,
  compare: ULCompareReport | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
  psychology: TradingPsychologyReport | null | undefined,
  strategy: StrategyAnalyticsReport | null | undefined,
  entry: EntryQualityReport | null | undefined,
  coach: TradingCoachReport | null | undefined,
): PortfolioAdvisorReport {
  try {
    if (
      dashboard == null &&
      compare == null &&
      insight == null &&
      recommendation == null &&
      psychology == null &&
      strategy == null &&
      entry == null &&
      coach == null
    ) {
      return emptyReport('Chưa có dữ liệu tư vấn danh mục.');
    }
    return buildPortfolioAdvisorFromInputs(
      dashboard,
      compare,
      insight,
      recommendation,
      psychology,
      strategy,
      entry,
      coach,
    );
  } catch {
    return emptyReport('Không thể tạo kế hoạch danh mục.');
  }
}
