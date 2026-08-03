/**
 * Task 15.0.3 — Performance Dashboard ViewModel Validator.
 *
 * Guarantees safe UI data only.
 * Never calculate / aggregate / rank / score / analyze.
 * Never throws. Deep-frozen output.
 *
 * Imports: performanceDashboardTypes only (no UL Engine / React / Journal).
 */

import type {
  PerformanceCoinRowVM,
  PerformanceDashboardViewModel,
  PerformanceDailyPointVM,
  PerformanceEquityPointVM,
  PerformanceInsightCardVM,
  PerformanceRecommendationItemVM,
  PerformanceRiskLevelDisplay,
} from './performanceDashboardTypes';
import { PERFORMANCE_DASHBOARD_VM_VERSION } from './performanceDashboardTypes';

const VALID_GRADES = new Set(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']);

const VALID_RISK: ReadonlySet<string> = new Set([
  'Low',
  'Medium',
  'High',
  'Critical',
]);

function isDev(): boolean {
  try {
    // Expo / RN
    if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  } catch {
    /* ignore */
  }
  try {
    return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

function warn(message: string): void {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.warn(`[PerformanceDashboardValidator] ${message}`);
}

function finiteOr(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function finiteOrNull(n: unknown): number | null {
  if (n == null) return null;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function clampScore(n: unknown, fallback = 0): number {
  const v = finiteOr(n, fallback);
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function asString(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return typeof v === 'string' ? v : fallback;
}

/** bestCoin / worstCoin: never undefined — null if absent. */
function coinLabel(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  return v;
}

function validGrade(g: unknown): string {
  const s = asString(g, 'F');
  if (VALID_GRADES.has(s)) return s;
  warn(`Invalid grade "${s}" → F`);
  return 'F';
}

function validRiskLevel(level: unknown): PerformanceRiskLevelDisplay {
  if (typeof level === 'string' && VALID_RISK.has(level)) {
    return level as PerformanceRiskLevelDisplay;
  }
  if (level != null) warn(`Invalid risk level "${String(level)}" → Unknown`);
  return 'Unknown';
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== 'object') return value as Readonly<T>;
  if (Object.isFrozen(value)) return value as Readonly<T>;
  for (const key of Object.keys(value as object)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value) as Readonly<T>;
}

function emptyVm(): PerformanceDashboardViewModel {
  return {
    version: PERFORMANCE_DASHBOARD_VM_VERSION,
    generatedAt: '',
    tradeCount: 0,
    fingerprint: 'empty',
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
      level: 'Unknown',
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

function sanitizeCoinRows(rows: unknown): PerformanceCoinRowVM[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      rank: finiteOr(r.rank, 0),
      symbol: asString(r.symbol),
      trades: Math.max(0, finiteOr(r.trades, 0)),
      wins: Math.max(0, finiteOr(r.wins, 0)),
      losses: Math.max(0, finiteOr(r.losses, 0)),
      winRate: finiteOr(r.winRate, 0),
      totalPnl: finiteOr(r.totalPnl, 0),
      averageRr: finiteOrNull(r.averageRr),
      expectancy: finiteOr(r.expectancy, 0),
      score: finiteOr(r.score, 0),
    };
  });
}

function sanitizeRecommendations(items: unknown): PerformanceRecommendationItemVM[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((raw) => raw != null && typeof raw === 'object')
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      const title = asString(r.title);
      const description = asString(r.description);
      const reason = asString(r.reason);
      const action = asString(r.action);
      const evidence = Array.isArray(r.evidence)
        ? r.evidence.map((e) => asString(e)).filter((s) => s.length > 0)
        : [description, reason].filter((s) => s.length > 0);
      return {
        id: asString(r.id, 'rec'),
        priority: asString(r.priority, 'INFO'),
        title,
        description,
        reason,
        severity: asString(r.severity, 'INFO'),
        action,
        evidence,
        target: asString(r.target, title || action || '—'),
      };
    });
}

function sanitizeEquity(data: unknown): PerformanceEquityPointVM[] {
  if (!Array.isArray(data)) return [];
  return data.map((raw, i) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    return {
      index: finiteOr(p.index, i),
      equity: finiteOr(p.equity, 0),
      pnl: finiteOr(p.pnl, 0),
      closedAt: finiteOr(p.closedAt, 0),
    };
  });
}

function sanitizeDaily(data: unknown): PerformanceDailyPointVM[] {
  if (!Array.isArray(data)) return [];
  return data.map((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    return {
      dayKey: asString(p.dayKey),
      pnl: finiteOr(p.pnl, 0),
      trades: Math.max(0, finiteOr(p.trades, 0)),
    };
  });
}

function sanitizeInsights(cards: unknown): PerformanceInsightCardVM[] {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter((c) => c != null && typeof c === 'object')
    .map((raw) => {
      const c = raw as Record<string, unknown>;
      return {
        id: asString(c.id),
        title: asString(c.title),
        subtitle: asString(c.subtitle),
        value: asString(c.value),
        tint: asString(c.tint, 'blue'),
      };
    });
}

/**
 * Validate + sanitize PerformanceDashboardViewModel for safe UI consumption.
 * Never throws. Returns a deep-frozen normalized copy.
 */
export function validatePerformanceDashboardVM(
  vm: PerformanceDashboardViewModel | Partial<PerformanceDashboardViewModel> | null | undefined,
): Readonly<PerformanceDashboardViewModel> {
  try {
    if (vm == null || typeof vm !== 'object') {
      warn('VM null/undefined → empty defaults');
      return deepFreeze(emptyVm());
    }

    const src = vm as Partial<PerformanceDashboardViewModel>;
    const summaryIn = (src.summary ?? {}) as Partial<PerformanceDashboardViewModel['summary']>;
    const coinIn = (src.coinPerformance ?? {}) as Partial<
      PerformanceDashboardViewModel['coinPerformance']
    >;
    const riskIn = (src.riskWidget ?? {}) as Partial<PerformanceDashboardViewModel['riskWidget']>;
    const scoreIn = (src.scoreWidget ?? {}) as Partial<PerformanceDashboardViewModel['scoreWidget']>;
    const patternsIn = (src.patterns ?? {}) as Partial<PerformanceDashboardViewModel['patterns']>;
    const equityIn = (src.equityChart ?? {}) as Partial<PerformanceDashboardViewModel['equityChart']>;
    const dailyIn = (src.dailyChart ?? {}) as Partial<PerformanceDashboardViewModel['dailyChart']>;
    const recIn = (src.recommendationPanel ?? {}) as Partial<
      PerformanceDashboardViewModel['recommendationPanel']
    >;

    const performanceScore = clampScore(
      summaryIn.performanceScore ?? scoreIn.performanceScore,
      0,
    );
    const grade = validGrade(summaryIn.grade ?? scoreIn.grade);
    const riskLevel = validRiskLevel(summaryIn.riskLevel ?? riskIn.level);
    const tradeCount = Math.max(0, finiteOr(src.tradeCount, 0));

    const winRate = finiteOr(summaryIn.winRate, 0);
    const profitFactor = finiteOr(summaryIn.profitFactor, 0);
    const expectancy = finiteOr(summaryIn.expectancy, 0);
    const netPnl = finiteOr(summaryIn.netPnl, 0);

    if (!Number.isFinite(summaryIn.winRate as number) && summaryIn.winRate != null) {
      warn('summary.winRate non-finite → 0');
    }
    if (!Number.isFinite(summaryIn.profitFactor as number) && summaryIn.profitFactor != null) {
      warn('summary.profitFactor non-finite → 0');
    }

    const out: PerformanceDashboardViewModel = {
      version: PERFORMANCE_DASHBOARD_VM_VERSION,
      generatedAt: asString(src.generatedAt),
      tradeCount,
      fingerprint: asString(src.fingerprint, 'empty'),

      summary: {
        totalTrades: Math.max(0, finiteOr(summaryIn.totalTrades, tradeCount)),
        wins: Math.max(0, finiteOr(summaryIn.wins, 0)),
        losses: Math.max(0, finiteOr(summaryIn.losses, 0)),
        breakevens: Math.max(0, finiteOr(summaryIn.breakevens, 0)),
        winRate,
        profitFactor,
        expectancy,
        netPnl,
        averageRr: finiteOrNull(summaryIn.averageRr),
        averageWinner: finiteOrNull(summaryIn.averageWinner),
        averageLoser: finiteOrNull(summaryIn.averageLoser),
        largestWin: finiteOrNull(summaryIn.largestWin),
        largestLoss: finiteOrNull(summaryIn.largestLoss),
        averageHoldingTime: finiteOrNull(summaryIn.averageHoldingTime),
        maxDrawdown: finiteOr(summaryIn.maxDrawdown, 0),
        currentDrawdown: finiteOr(summaryIn.currentDrawdown, 0),
        recoveryFactor: finiteOrNull(summaryIn.recoveryFactor),
        calmarRatio: finiteOrNull(summaryIn.calmarRatio),
        consistencyScore: clampScore(summaryIn.consistencyScore, 0),
        stabilityScore: clampScore(summaryIn.stabilityScore, 0),
        performanceScore,
        grade,
        riskLevel,
      },

      coinPerformance: {
        rows: sanitizeCoinRows(coinIn.rows),
        bestCoin: coinLabel(coinIn.bestCoin),
        worstCoin: coinLabel(coinIn.worstCoin),
      },

      recommendationPanel: {
        items: sanitizeRecommendations(recIn.items),
      },

      riskWidget: {
        level: validRiskLevel(riskIn.level ?? summaryIn.riskLevel),
        score: clampScore(riskIn.score, 0),
        summary: asString(riskIn.summary),
        drawdown: finiteOrNull(riskIn.drawdown),
        winRate: finiteOrNull(riskIn.winRate),
        profitFactor: finiteOrNull(riskIn.profitFactor),
        recoveryFactor: finiteOrNull(riskIn.recoveryFactor),
        consistency: finiteOrNull(riskIn.consistency),
      },

      equityChart: {
        data: sanitizeEquity(equityIn.data),
      },

      dailyChart: {
        data: sanitizeDaily(dailyIn.data),
      },

      scoreWidget: {
        performanceScore: clampScore(scoreIn.performanceScore ?? performanceScore, 0),
        consistencyScore: clampScore(scoreIn.consistencyScore ?? summaryIn.consistencyScore, 0),
        stabilityScore: clampScore(scoreIn.stabilityScore ?? summaryIn.stabilityScore, 0),
        riskScore: clampScore(scoreIn.riskScore ?? riskIn.score, 0),
        expectancyScore: clampScore(scoreIn.expectancyScore, 0),
        grade: validGrade(scoreIn.grade ?? grade),
      },

      insightCards: sanitizeInsights(src.insightCards),

      patterns: {
        winningStreak: Math.max(0, finiteOr(patternsIn.winningStreak, 0)),
        losingStreak: Math.max(0, finiteOr(patternsIn.losingStreak, 0)),
        bestTradingHour: finiteOrNull(patternsIn.bestTradingHour),
        worstTradingHour: finiteOrNull(patternsIn.worstTradingHour),
        bestWeekday: finiteOrNull(patternsIn.bestWeekday),
        worstWeekday: finiteOrNull(patternsIn.worstWeekday),
        bestStrategy:
          patternsIn.bestStrategy == null ? null : asString(patternsIn.bestStrategy),
        worstStrategy:
          patternsIn.worstStrategy == null ? null : asString(patternsIn.worstStrategy),
        averageTradeDuration: finiteOrNull(patternsIn.averageTradeDuration),
      },
    };

    return deepFreeze(out);
  } catch {
    warn('Unexpected error → empty defaults');
    return deepFreeze(emptyVm());
  }
}
