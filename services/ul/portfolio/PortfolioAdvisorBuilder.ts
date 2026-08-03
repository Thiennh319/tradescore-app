/**
 * Task 15.9 — Portfolio Advisor report builder.
 * Merges existing reports only. Never scans trades or recalculates analytics.
 */

import type { ULCompareReport } from '../compare/ULCompareTypes';
import type { EntryQualityReport } from '../entry/EntryQualityTypes';
import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { TradingPsychologyReport } from '../psychology/TradingPsychologyTypes';
import type {
  TradingRecommendation,
  TradingRecommendationReport,
} from '../recommendation/TradingRecommendationTypes';
import { TRADING_RECOMMENDATION_PRIORITY_RANK } from '../recommendation/TradingRecommendationTypes';
import type { StrategyAnalyticsReport, StrategyAnalyticsRow } from '../strategy/StrategyAnalyticsTypes';
import type { TradingCoachReport } from '../coach/TradingCoachTypes';
import type { ULCoinStats, ULDashboardData } from '../types';
import { normalizePortfolioSymbol } from './PortfolioAdvisorFormatter';
import {
  cashReserveForRisk,
  clampPortfolioScore,
  maxPositionForLevel,
  maxTradesForStatus,
  PORTFOLIO_ADVISOR_RULES,
  portfolioGradeFromScore,
  portfolioStatusFromSignals,
  riskLevelFromSignals,
  riskPerTradeForLevel,
} from './PortfolioAdvisorRules';
import type {
  PortfolioAdvisorEvidence,
  PortfolioAdvisorReport,
  PortfolioAdvisorStatus,
  PortfolioCapitalAllocation,
  PortfolioCoinPlan,
  PortfolioLimits,
  PortfolioPreferredSide,
  PortfolioRiskPlan,
  PortfolioSessionPlan,
  PortfolioStrategyAllocation,
  PortfolioTradePlan,
  PortfolioWarning,
} from './PortfolioAdvisorTypes';
import { PORTFOLIO_ADVISOR_VERSION } from './PortfolioAdvisorTypes';

const BASE_CAPITAL_SYMBOLS = ['BTC', 'SOL', 'BNB', 'NEAR'] as const;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function rankCoins(dashboard: ULDashboardData | null | undefined): ULCoinStats[] {
  return [...(dashboard?.coinTable?.rows ?? [])].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.totalPnl !== a.totalPnl) return b.totalPnl - a.totalPnl;
    return normalizePortfolioSymbol(a.symbol).localeCompare(normalizePortfolioSymbol(b.symbol));
  });
}

function recommendationCoinSignals(
  rows: readonly ULCoinStats[],
  recommendation: TradingRecommendationReport | null | undefined,
): { preferred: Set<string>; avoid: Set<string> } {
  const preferred = new Set<string>();
  const avoid = new Set<string>();
  const sorted = [...(recommendation?.recommendations ?? [])].sort((a, b) => {
    const priority =
      TRADING_RECOMMENDATION_PRIORITY_RANK[a.priority] -
      TRADING_RECOMMENDATION_PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return a.id.localeCompare(b.id);
  });

  for (const row of rows) {
    const symbol = normalizePortfolioSymbol(row.symbol);
    for (const rec of sorted) {
      const text = `${rec.title} ${rec.action} ${rec.description}`.toUpperCase();
      if (!text.includes(symbol)) continue;
      if (/REDUCE|AVOID|PAUSE|HẠN CHẾ|TRÁNH|TẠM DỪNG/.test(text)) avoid.add(symbol);
      if (/PRIORITIZE|FOCUS|ƯU TIÊN|TẬP TRUNG/.test(text)) preferred.add(symbol);
    }
  }
  return { preferred, avoid };
}

export function buildPortfolioCoinPlan(
  dashboard: ULDashboardData | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
  entry: EntryQualityReport | null | undefined,
): PortfolioCoinPlan {
  const ranked = rankCoins(dashboard);
  const symbols = unique(ranked.map((row) => normalizePortfolioSymbol(row.symbol)));
  if (symbols.length === 0) {
    return { preferredCoins: [], avoidCoins: [], watchCoins: [] };
  }

  if (entry?.decision === 'AVOID') {
    return {
      preferredCoins: [],
      avoidCoins: symbols.slice(0, PORTFOLIO_ADVISOR_RULES.MAX_AVOID_COINS),
      watchCoins: [],
    };
  }
  if (entry?.decision === 'WAIT') {
    return {
      preferredCoins: [],
      avoidCoins: [],
      watchCoins: symbols.slice(0, PORTFOLIO_ADVISOR_RULES.MAX_WATCH_COINS),
    };
  }

  const signals = recommendationCoinSignals(ranked, recommendation);
  const positiveInsightText = (insight?.strengths ?? [])
    .concat(insight?.opportunities ?? [])
    .map((item) => `${item.title} ${item.description}`.toUpperCase())
    .join(' ');
  const negativeInsightText = (insight?.warnings ?? [])
    .concat(insight?.weaknesses ?? [])
    .map((item) => `${item.title} ${item.description}`.toUpperCase())
    .join(' ');

  const preferred: string[] = [];
  const avoid: string[] = [];
  const watch: string[] = [];
  for (const row of ranked) {
    const symbol = normalizePortfolioSymbol(row.symbol);
    const insightPositive = positiveInsightText.includes(symbol);
    const insightNegative = negativeInsightText.includes(symbol);
    const isPreferred =
      !signals.avoid.has(symbol) &&
      !insightNegative &&
      (signals.preferred.has(symbol) ||
        insightPositive ||
        (row.score >= PORTFOLIO_ADVISOR_RULES.MIN_PREFERRED_COIN_SCORE &&
          row.winRate >= PORTFOLIO_ADVISOR_RULES.MIN_PREFERRED_WIN_RATE &&
          row.totalPnl >= 0));
    const isAvoid =
      signals.avoid.has(symbol) ||
      insightNegative ||
      row.score <= PORTFOLIO_ADVISOR_RULES.MAX_AVOID_COIN_SCORE ||
      row.totalPnl < 0;

    if (isPreferred && preferred.length < PORTFOLIO_ADVISOR_RULES.MAX_PREFERRED_COINS) {
      preferred.push(symbol);
    } else if (isAvoid && avoid.length < PORTFOLIO_ADVISOR_RULES.MAX_AVOID_COINS) {
      avoid.push(symbol);
    } else if (watch.length < PORTFOLIO_ADVISOR_RULES.MAX_WATCH_COINS) {
      watch.push(symbol);
    }
  }

  return {
    preferredCoins: unique(preferred),
    avoidCoins: unique(avoid.filter((symbol) => !preferred.includes(symbol))),
    watchCoins: unique(
      watch.filter((symbol) => !preferred.includes(symbol) && !avoid.includes(symbol)),
    ),
  };
}

function allocateIntegerPercent(
  entries: readonly { key: string; weight: number }[],
  totalPct: number,
): Record<string, number> {
  if (entries.length === 0 || totalPct <= 0) return {};
  const positive = entries.map((item) => ({ ...item, weight: Math.max(0, item.weight) }));
  const weightSum = positive.reduce((sum, item) => sum + item.weight, 0);
  const normalized =
    weightSum > 0 ? positive : positive.map((item) => ({ ...item, weight: 1 }));
  const denominator = normalized.reduce((sum, item) => sum + item.weight, 0);
  const exact = normalized.map((item) => ({
    key: item.key,
    exact: (totalPct * item.weight) / denominator,
  }));
  const output: Record<string, number> = {};
  let assigned = 0;
  for (const item of exact) {
    const floor = Math.floor(item.exact);
    output[item.key] = floor;
    assigned += floor;
  }
  const remainder = totalPct - assigned;
  const byFraction = [...exact].sort((a, b) => {
    const fraction = b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact));
    return fraction !== 0 ? fraction : a.key.localeCompare(b.key);
  });
  for (let i = 0; i < remainder; i += 1) {
    const item = byFraction[i % byFraction.length]!;
    output[item.key] = (output[item.key] ?? 0) + 1;
  }
  return output;
}

export function buildCapitalAllocation(
  dashboard: ULDashboardData | null | undefined,
  portfolio: PortfolioCoinPlan,
  riskPlan: PortfolioRiskPlan,
): PortfolioCapitalAllocation {
  const result: Record<string, number> = {
    BTC: 0,
    SOL: 0,
    BNB: 0,
    NEAR: 0,
    Cash: riskPlan.cashReservePct,
  };
  const investable = 100 - riskPlan.cashReservePct;
  if (investable <= 0 || portfolio.preferredCoins.length === 0) {
    result.Cash = 100;
    return result as PortfolioCapitalAllocation;
  }

  const rowBySymbol = new Map(
    rankCoins(dashboard).map((row) => [normalizePortfolioSymbol(row.symbol), row]),
  );
  const allocated = allocateIntegerPercent(
    portfolio.preferredCoins.map((symbol) => ({
      key: symbol,
      weight: Math.max(1, rowBySymbol.get(symbol)?.score ?? 1),
    })),
    investable,
  );
  for (const [symbol, pct] of Object.entries(allocated)) result[symbol] = pct;
  return result as PortfolioCapitalAllocation;
}

export function buildStrategyAllocation(
  strategy: StrategyAnalyticsReport | null | undefined,
): PortfolioStrategyAllocation[] {
  const eligible = [...(strategy?.strategies ?? [])]
    .filter((row) => row.status !== 'Disabled' && row.status !== 'Deprecated')
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor;
      return a.name.localeCompare(b.name);
    })
    .slice(0, PORTFOLIO_ADVISOR_RULES.MAX_STRATEGIES);
  if (eligible.length === 0) return [];

  const allocations = allocateIntegerPercent(
    eligible.map((row) => ({
      key: row.id,
      weight: Math.max(1, row.confidence),
    })),
    100,
  );
  return eligible.map((row) => ({
    strategyId: row.id,
    name: row.name,
    allocationPct: allocations[row.id] ?? 0,
    score: row.score,
    confidence: row.confidence,
    profitFactor: row.profitFactor,
  }));
}

function preferredSideFromReports(
  entry: EntryQualityReport | null | undefined,
  strategy: StrategyAnalyticsReport | null | undefined,
): PortfolioPreferredSide {
  if (entry?.decision === 'AVOID') return 'NONE';
  const trendEvidence = entry?.evidence?.find((item) => item.checkId === 'trend_direction');
  if (trendEvidence?.status === 'PASS') {
    if (trendEvidence.expected === 'BULL') return 'LONG';
    if (trendEvidence.expected === 'BEAR') return 'SHORT';
  }
  const market = [...(strategy?.heatmap?.market ?? [])].sort((a, b) => {
    if (b.pnl !== a.pnl) return b.pnl - a.pnl;
    if (b.trades !== a.trades) return b.trades - a.trades;
    return a.bucket.localeCompare(b.bucket);
  })[0]?.bucket;
  if (market === 'LONG' || market === 'SHORT') return market;
  return entry?.decision === 'ENTER' ? 'BOTH' : 'NONE';
}

export function buildSessionPlan(
  dashboard: ULDashboardData | null | undefined,
  portfolio: PortfolioCoinPlan,
): PortfolioSessionPlan {
  const best = dashboard?.patterns?.bestTradingHour;
  const worst = dashboard?.patterns?.worstTradingHour;
  return {
    bestTradingHours: finite(best) ? [best] : [],
    avoidHours: finite(worst) ? [worst] : [],
    preferredMarket: portfolio.preferredCoins[0] ?? portfolio.watchCoins[0] ?? null,
  };
}

export function buildPortfolioEvidence(input: {
  coach: TradingCoachReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
}): PortfolioAdvisorEvidence {
  return {
    coach: unique([
      ...(input.coach?.topPriorities ?? []).map((item) => item.id),
      ...(input.coach?.actionPlan ?? []).map((item) => item.id),
    ]),
    entry: unique([
      ...(input.entry?.failedChecks ?? []).map((item) => item.id),
      ...(input.entry?.passedChecks ?? []).map((item) => item.id),
    ]),
    strategy: unique(
      (input.strategy?.strategies ?? [])
        .filter(
          (item) =>
            item.id === input.strategy?.bestStrategy?.id ||
            item.id === input.strategy?.worstStrategy?.id ||
            item.status === 'Weak' ||
            item.status === 'Deprecated',
        )
        .map((item) => item.id),
    ),
    recommendation: unique(
      (input.recommendation?.recommendations ?? []).map((item) => item.id),
    ),
    psychology: unique(
      (input.psychology?.findings ?? [])
        .filter((item) => item.severity !== 'INFO')
        .map((item) => item.id),
    ),
  };
}

function warningFromRecommendation(rec: TradingRecommendation): PortfolioWarning {
  return {
    id: `portfolio-${rec.id}`,
    message: rec.title,
    severity:
      rec.priority === 'CRITICAL'
        ? 'CRITICAL'
        : rec.priority === 'HIGH'
          ? 'HIGH'
          : rec.priority === 'MEDIUM'
            ? 'MEDIUM'
            : 'LOW',
    source: 'recommendation',
    evidenceRefs: [rec.id, ...rec.sourceInsightIds],
  };
}

export function buildPortfolioWarnings(input: {
  dashboard: ULDashboardData | null | undefined;
  recommendation: TradingRecommendationReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  coach: TradingCoachReport | null | undefined;
}): PortfolioWarning[] {
  const warnings: PortfolioWarning[] = [];
  if ((input.dashboard?.risk?.score ?? 0) >= 50) {
    warnings.push({
      id: 'portfolio-high-drawdown',
      message: 'Drawdown cao',
      severity: (input.dashboard?.risk?.score ?? 0) >= 75 ? 'CRITICAL' : 'HIGH',
      source: 'dashboard',
      evidenceRefs: ['risk.score'],
    });
  }
  for (const check of input.entry?.failedChecks ?? []) {
    warnings.push({
      id: `portfolio-entry-${check.id}`,
      message: check.title,
      severity: input.entry?.decision === 'AVOID' ? 'CRITICAL' : 'HIGH',
      source: 'entry',
      evidenceRefs: [check.id],
    });
  }
  for (const finding of input.psychology?.warnings ?? []) {
    warnings.push({
      id: `portfolio-${finding.id}`,
      message: finding.title,
      severity:
        finding.severity === 'CRITICAL'
          ? 'CRITICAL'
          : finding.severity === 'HIGH'
            ? 'HIGH'
            : finding.severity === 'MEDIUM'
              ? 'MEDIUM'
              : 'LOW',
      source: 'psychology',
      evidenceRefs: [finding.id],
    });
  }
  const weakStrategies = (input.strategy?.strategies ?? []).filter(
    (item) =>
      item.status === 'Weak' ||
      item.status === 'Deprecated' ||
      item.tags.includes('Declining Strategy'),
  );
  for (const row of weakStrategies) {
    warnings.push({
      id: `portfolio-strategy-${row.id}`,
      message: `Chiến lược yếu: ${row.name}`,
      severity: row.status === 'Deprecated' ? 'HIGH' : 'MEDIUM',
      source: 'strategy',
      evidenceRefs: [row.id],
    });
  }
  const recommendations = [...(input.recommendation?.recommendations ?? [])]
    .filter((item) => item.priority !== 'INFO')
    .sort((a, b) => {
      const priority =
        TRADING_RECOMMENDATION_PRIORITY_RANK[a.priority] -
        TRADING_RECOMMENDATION_PRIORITY_RANK[b.priority];
      return priority !== 0 ? priority : a.id.localeCompare(b.id);
    });
  for (const rec of recommendations) warnings.push(warningFromRecommendation(rec));
  if (input.coach?.summary?.overallStatus === 'Critical') {
    warnings.push({
      id: 'portfolio-coach-critical',
      message: input.coach.summary.headline,
      severity: 'CRITICAL',
      source: 'coach',
      evidenceRefs: input.coach.topPriorities.map((item) => item.id),
    });
  }

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const deduped = new Map<string, PortfolioWarning>();
  for (const warning of warnings) {
    const key = `${warning.source}:${warning.message.toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, warning);
  }
  return [...deduped.values()]
    .sort((a, b) => {
      const priority = rank[a.severity] - rank[b.severity];
      return priority !== 0 ? priority : a.id.localeCompare(b.id);
    })
    .slice(0, PORTFOLIO_ADVISOR_RULES.MAX_WARNINGS);
}

export function mergePortfolioConfidence(input: {
  coach: TradingCoachReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
  insight: TradingInsightReport | null | undefined;
}): number {
  const values: number[] = [];
  if (finite(input.coach?.confidence)) values.push(input.coach.confidence);
  if (finite(input.entry?.confidence)) values.push(input.entry.confidence);
  if (finite(input.strategy?.confidence)) values.push(input.strategy.confidence);
  const psychologyConfidence = mean(
    (input.psychology?.findings ?? []).map((item) => item.confidence).filter(finite),
  );
  if (psychologyConfidence != null) values.push(psychologyConfidence);
  else if (finite(input.psychology?.score)) values.push(input.psychology.score);
  const insightConfidence = mean(
    (input.insight?.insights ?? []).map((item) => item.confidence).filter(finite),
  );
  if (insightConfidence != null) values.push(insightConfidence);
  return values.length === 0 ? 0 : clampPortfolioScore(mean(values) ?? 0);
}

function mergeAdvisorScore(input: {
  dashboard: ULDashboardData | null | undefined;
  coach: TradingCoachReport | null | undefined;
  entry: EntryQualityReport | null | undefined;
  strategy: StrategyAnalyticsReport | null | undefined;
  psychology: TradingPsychologyReport | null | undefined;
}): number {
  const values = [
    input.dashboard?.score?.performanceScore,
    input.coach?.summary?.coachScore,
    input.entry?.score,
    input.strategy?.bestStrategy?.score ?? input.strategy?.confidence,
    input.psychology?.score,
  ].filter(finite);
  return values.length === 0 ? 0 : clampPortfolioScore(mean(values) ?? 0);
}

function buildRiskPlan(level: PortfolioRiskPlan['level']): PortfolioRiskPlan {
  return {
    level,
    posture:
      level === 'Critical'
        ? 'Cash'
        : level === 'High'
          ? 'Defensive'
          : level === 'Medium'
            ? 'Balanced'
            : 'Growth',
    cashReservePct: cashReserveForRisk(level),
  };
}

function buildTradePlan(
  status: PortfolioAdvisorStatus,
  riskPlan: PortfolioRiskPlan,
  psychology: TradingPsychologyReport | null | undefined,
  entry: EntryQualityReport | null | undefined,
  strategy: StrategyAnalyticsReport | null | undefined,
): PortfolioTradePlan {
  const riskPerTrade =
    (psychology?.score ?? 100) < 50
      ? Math.min(0.5, riskPerTradeForLevel(riskPlan.level))
      : riskPerTradeForLevel(riskPlan.level);
  return {
    maxTrades: maxTradesForStatus(status),
    riskPerTrade,
    maxDailyLoss: Math.round(riskPerTrade * 3 * 100) / 100,
    targetRR: PORTFOLIO_ADVISOR_RULES.TARGET_RR,
    preferredSide: preferredSideFromReports(entry, strategy),
  };
}

function buildLimits(riskPlan: PortfolioRiskPlan): PortfolioLimits {
  return {
    maxLeverage: riskPlan.level === 'Critical' ? 0 : PORTFOLIO_ADVISOR_RULES.MAX_LEVERAGE,
    maxPositionSize: maxPositionForLevel(riskPlan.level),
    maxConsecutiveLoss: PORTFOLIO_ADVISOR_RULES.MAX_CONSECUTIVE_LOSS,
    stopTradingAfterLoss: true,
  };
}

export function buildPortfolioAdvisorFromInputs(
  dashboard: ULDashboardData | null | undefined,
  compare: ULCompareReport | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
  psychology: TradingPsychologyReport | null | undefined,
  strategy: StrategyAnalyticsReport | null | undefined,
  entry: EntryQualityReport | null | undefined,
  coach: TradingCoachReport | null | undefined,
): PortfolioAdvisorReport {
  const advisorScore = mergeAdvisorScore({ dashboard, coach, entry, strategy, psychology });
  const improving =
    (compare?.summary?.improvedCount ?? 0) > (compare?.summary?.worsenedCount ?? 0);
  const status = portfolioStatusFromSignals({
    advisorScore,
    coachStatus: coach?.summary?.overallStatus ?? null,
    entryDecision: entry?.decision ?? null,
    improving,
  });
  const riskLevel = riskLevelFromSignals({
    dashboardRiskScore: dashboard?.risk?.score ?? null,
    coachStatus: coach?.summary?.overallStatus ?? null,
    psychologyScore: psychology?.score ?? null,
    entryDecision: entry?.decision ?? null,
  });
  const riskPlan = buildRiskPlan(riskLevel);
  const portfolio = buildPortfolioCoinPlan(dashboard, insight, recommendation, entry);
  const strategyAllocation = buildStrategyAllocation(strategy);
  const warnings = buildPortfolioWarnings({
    dashboard,
    recommendation,
    psychology,
    strategy,
    entry,
    coach,
  });
  const confidence = mergePortfolioConfidence({ coach, entry, strategy, psychology, insight });
  const headline =
    status === 'Critical'
      ? 'Tạm dừng giao dịch và ưu tiên bảo toàn vốn.'
      : portfolio.preferredCoins[0]
        ? `Ưu tiên ${portfolio.preferredCoins[0]} với kế hoạch rủi ro ${riskPlan.posture}.`
        : 'Giữ tiền mặt và chờ thiết lập đạt chất lượng.';

  return {
    version: PORTFOLIO_ADVISOR_VERSION,
    summary: {
      headline,
      status,
      advisorScore,
      grade: portfolioGradeFromScore(advisorScore),
    },
    portfolio,
    riskPlan,
    capitalAllocation: buildCapitalAllocation(dashboard, portfolio, riskPlan),
    strategyAllocation,
    tradePlan: buildTradePlan(status, riskPlan, psychology, entry, strategy),
    sessionPlan: buildSessionPlan(dashboard, portfolio),
    limits: buildLimits(riskPlan),
    warnings,
    confidence,
    evidence: buildPortfolioEvidence({
      coach,
      entry,
      strategy,
      recommendation,
      psychology,
    }),
  };
}
