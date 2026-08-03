/**
 * Task 15.0.2 — UL Dashboard Adapter Layer.
 *
 * ULDashboardData → PerformanceDashboardViewModel
 *
 * Pure mapping only:
 * ✓ rename / flatten / merge display / normalize null / convert enums
 * ✗ compute / aggregate / rank / score / analyze
 *
 * UI must never import this module directly in Task 15.0.2
 * (bind happens in Task 15.1 without layout changes).
 */

import type { ULDashboardData, UlRiskLevel } from '../types';
import type {
  PerformanceCoinRowVM,
  PerformanceDashboardViewModel,
  PerformanceRiskLevelDisplay,
  PerformanceRecommendationItemVM,
} from './performanceDashboardTypes';
import { PERFORMANCE_DASHBOARD_VM_VERSION } from './performanceDashboardTypes';

function num(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function numOrNull(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Enum convert only — no scoring. */
export function mapRiskLevel(level: UlRiskLevel | string | null | undefined): PerformanceRiskLevelDisplay {
  switch (level) {
    case 'LOW':
      return 'Low';
    case 'MEDIUM':
      return 'Medium';
    case 'HIGH':
      return 'High';
    case 'CRITICAL':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

function emptyVm(generatedAt: string, fingerprint: string): PerformanceDashboardViewModel {
  return {
    version: PERFORMANCE_DASHBOARD_VM_VERSION,
    generatedAt,
    tradeCount: 0,
    fingerprint,
    summary: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winRate: 0,
      profitFactor: 0,
      expectancy: 0,
      netPnl: 0,
      averageRr: null,
      averageWinner: null,
      averageLoser: null,
      largestWin: null,
      largestLoss: null,
      averageHoldingTime: null,
      maxDrawdown: 0,
      currentDrawdown: 0,
      recoveryFactor: null,
      calmarRatio: null,
      consistencyScore: 0,
      stabilityScore: 0,
      performanceScore: 0,
      grade: 'F',
      riskLevel: 'Low',
    },
    coinPerformance: { rows: [], bestCoin: null, worstCoin: null },
    recommendationPanel: { items: [] },
    riskWidget: {
      level: 'Low',
      score: 0,
      summary: '',
      drawdown: null,
      winRate: null,
      profitFactor: null,
      recoveryFactor: null,
      consistency: null,
    },
    equityChart: { data: [] },
    dailyChart: { data: [] },
    scoreWidget: {
      performanceScore: 0,
      consistencyScore: 0,
      stabilityScore: 0,
      riskScore: 0,
      expectancyScore: 0,
      grade: 'F',
    },
    insightCards: [],
    patterns: {
      winningStreak: 0,
      losingStreak: 0,
      bestTradingHour: null,
      worstTradingHour: null,
      bestWeekday: null,
      worstWeekday: null,
      bestStrategy: null,
      worstStrategy: null,
      averageTradeDuration: null,
    },
  };
}

function mapCoinRows(rows: unknown): readonly PerformanceCoinRowVM[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      rank: num(r.rank),
      symbol: str(r.symbol),
      trades: num(r.trades),
      wins: num(r.wins),
      losses: num(r.losses),
      winRate: num(r.winRate),
      totalPnl: num(r.totalPnl),
      averageRr: numOrNull(r.averageRr),
      expectancy: num(r.expectancy),
      score: num(r.score),
    };
  });
}

function mapRecommendations(recs: unknown): readonly PerformanceRecommendationItemVM[] {
  if (!Array.isArray(recs)) return [];
  return recs.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = str(r.title);
    const description = str(r.description);
    const reason = str(r.reason);
    const action = str(r.action);
    const evidence = [description, reason].filter((s) => s.length > 0);
    return {
      id: str(r.id, 'ul-rec'),
      priority: str(r.priority, 'INFO'),
      title,
      description,
      reason,
      severity: str(r.severity, 'INFO'),
      action,
      evidence,
      target: title || action || str(r.id, '—'),
    };
  });
}

/** Deep-freeze for immutability contract (non-mutating toward input). */
export function deepFreezeVm<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== 'object') return value as Readonly<T>;
  if (Object.isFrozen(value)) return value as Readonly<T>;
  for (const key of Object.keys(value as object)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      deepFreezeVm(child);
    }
  }
  return Object.freeze(value) as Readonly<T>;
}

/**
 * Convert UL analytics output → Performance Dashboard ViewModel.
 * Accepts partial / null input and returns safe defaults (never throws).
 */
export function buildPerformanceDashboardVM(
  dashboard: ULDashboardData | Partial<ULDashboardData> | null | undefined,
): Readonly<PerformanceDashboardViewModel> {
  if (dashboard == null || typeof dashboard !== 'object') {
    return deepFreezeVm(emptyVm('', 'empty'));
  }

  const d = dashboard as Partial<ULDashboardData>;
  const metrics = (d.metrics ?? {}) as Partial<NonNullable<ULDashboardData['metrics']>>;
  const kpi = (d.kpi ?? {}) as Partial<NonNullable<ULDashboardData['kpi']>>;
  const coinTable = (d.coinTable ?? {}) as Partial<NonNullable<ULDashboardData['coinTable']>>;
  const risk = (d.risk ?? {}) as Partial<NonNullable<ULDashboardData['risk']>>;
  const riskFactors = (risk.factors ?? {}) as Partial<
    NonNullable<NonNullable<ULDashboardData['risk']>['factors']>
  >;
  const charts = (d.charts ?? {}) as Partial<NonNullable<ULDashboardData['charts']>>;
  const score = (d.score ?? {}) as Partial<NonNullable<ULDashboardData['score']>>;
  const patterns = (d.patterns ?? {}) as Partial<NonNullable<ULDashboardData['patterns']>>;
  const insights = Array.isArray(d.insights) ? d.insights : [];

  const winRate = num(metrics.winRate ?? kpi.winRate);
  const profitFactor = num(metrics.profitFactor ?? kpi.profitFactor);
  const expectancy = num(metrics.expectancy ?? kpi.expectancy);
  const netPnl = num(metrics.netPnl ?? kpi.netPnl);
  const performanceScore = num(score.performanceScore ?? metrics.performanceScore ?? kpi.performanceScore);
  const grade = str(score.grade ?? kpi.grade, 'F');
  const riskLevelRaw = risk.riskLevel ?? kpi.riskLevel;
  const riskLevel = mapRiskLevel(riskLevelRaw as UlRiskLevel | undefined);

  const equitySrc = Array.isArray(charts.equityCurve) ? charts.equityCurve : [];
  const dailySrc = Array.isArray(charts.dailyPnl) ? charts.dailyPnl : [];

  const vm: PerformanceDashboardViewModel = {
    version: PERFORMANCE_DASHBOARD_VM_VERSION,
    generatedAt: str(d.generatedAt),
    tradeCount: num(d.tradeCount),
    fingerprint: str(d.fingerprint, 'empty'),

    // UL metrics.* / kpi.* → summary.*
    summary: {
      totalTrades: num(metrics.totalTrades ?? kpi.totalTrades ?? d.tradeCount),
      wins: num(metrics.wins),
      losses: num(metrics.losses),
      breakevens: num(metrics.breakevens),
      winRate,
      profitFactor,
      expectancy,
      netPnl,
      averageRr: numOrNull(metrics.averageRr),
      averageWinner: numOrNull(metrics.averageWinner),
      averageLoser: numOrNull(metrics.averageLoser),
      largestWin: numOrNull(metrics.largestWin),
      largestLoss: numOrNull(metrics.largestLoss),
      averageHoldingTime: numOrNull(metrics.averageHoldingTime),
      maxDrawdown: num(metrics.maxDrawdown),
      currentDrawdown: num(metrics.currentDrawdown),
      recoveryFactor: numOrNull(metrics.recoveryFactor),
      calmarRatio: numOrNull(metrics.calmarRatio),
      consistencyScore: num(metrics.consistencyScore),
      stabilityScore: num(metrics.stabilityScore),
      performanceScore,
      grade,
      riskLevel,
    },

    // UL coinTable.rows → coinPerformance.rows
    coinPerformance: {
      rows: mapCoinRows(coinTable.rows),
      bestCoin: coinTable.bestCoin == null ? null : str(coinTable.bestCoin),
      worstCoin: coinTable.worstCoin == null ? null : str(coinTable.worstCoin),
    },

    // UL recommendations → recommendationPanel.items
    recommendationPanel: {
      items: mapRecommendations(d.recommendations),
    },

    // UL risk.* → riskWidget.*
    riskWidget: {
      level: riskLevel,
      score: num(risk.score),
      summary: str(risk.summary),
      drawdown: numOrNull(riskFactors.drawdown),
      winRate: numOrNull(riskFactors.winRate),
      profitFactor: numOrNull(riskFactors.profitFactor),
      recoveryFactor: numOrNull(riskFactors.recoveryFactor),
      consistency: numOrNull(riskFactors.consistency),
    },

    // UL charts.equityCurve → equityChart.data
    equityChart: {
      data: equitySrc.map((p, i) => ({
        index: num((p as { index?: number }).index, i),
        equity: num((p as { equity?: number }).equity),
        pnl: num((p as { pnl?: number }).pnl),
        closedAt: num((p as { closedAt?: number }).closedAt),
      })),
    },

    dailyChart: {
      data: dailySrc.map((p) => ({
        dayKey: str((p as { dayKey?: string }).dayKey),
        pnl: num((p as { pnl?: number }).pnl),
        trades: num((p as { trades?: number }).trades),
      })),
    },

    scoreWidget: {
      performanceScore,
      consistencyScore: num(score.consistencyScore ?? metrics.consistencyScore),
      stabilityScore: num(score.stabilityScore ?? metrics.stabilityScore),
      riskScore: num(score.riskScore ?? risk.score),
      expectancyScore: num(score.expectancyScore),
      grade,
    },

    insightCards: insights.map((card) => ({
      id: str(card?.id),
      title: str(card?.title),
      subtitle: str(card?.subtitle),
      value: str(card?.value),
      tint: str(card?.tint, 'blue'),
    })),

    patterns: {
      winningStreak: num(patterns.winningStreak),
      losingStreak: num(patterns.losingStreak),
      bestTradingHour: numOrNull(patterns.bestTradingHour),
      worstTradingHour: numOrNull(patterns.worstTradingHour),
      bestWeekday: numOrNull(patterns.bestWeekday),
      worstWeekday: numOrNull(patterns.worstWeekday),
      bestStrategy: patterns.bestStrategy == null ? null : str(patterns.bestStrategy),
      worstStrategy: patterns.worstStrategy == null ? null : str(patterns.worstStrategy),
      averageTradeDuration: numOrNull(patterns.averageTradeDuration),
    },
  };

  return deepFreezeVm(vm);
}
