/**
 * Task 15.3 — Deterministic insight rule evaluation (O(n) over fixed rules + coin/hour maps).
 */

import type { ULCompareMetricRow, ULCompareReport } from '../compare/ULCompareTypes';
import type { ULDashboardData } from '../types';
import { clampConfidence, fmtNum, fmtPct } from './TradingInsightFormatter';
import { INSIGHT_RULES as R } from './TradingInsightRules';
import type {
  TradingInsight,
  TradingInsightBucket,
  TradingInsightSeverity,
} from './TradingInsightTypes';

export type BuiltInsight = TradingInsight & { bucket: TradingInsightBucket };

function rowOf(compare: ULCompareReport | null | undefined, key: string): ULCompareMetricRow | null {
  if (!compare) return null;
  return compare.rows.find((r) => r.key === key) ?? null;
}

function insight(
  partial: Omit<BuiltInsight, 'confidence'> & { confidence: number },
): BuiltInsight {
  return {
    ...partial,
    confidence: clampConfidence(partial.confidence),
  };
}

/** Evaluate all deterministic rules. Never throws. */
export function evaluateInsightRules(
  dashboard: ULDashboardData | null | undefined,
  compare: ULCompareReport | null | undefined,
): BuiltInsight[] {
  const out: BuiltInsight[] = [];
  if (dashboard == null || typeof dashboard !== 'object') return out;

  const m = dashboard.metrics;
  const patterns = dashboard.patterns;
  const coins = dashboard.coinTable;
  const risk = dashboard.risk;
  const tradeCount = dashboard.tradeCount ?? m.totalTrades ?? 0;

  if (tradeCount === 0) {
    out.push(
      insight({
        id: 'ti-empty',
        title: 'No closed trades yet',
        description: 'Insight engine needs completed trades to produce signals.',
        category: 'Performance',
        severity: 'INFO',
        confidence: 100,
        evidence: ['tradeCount=0'],
        recommendation: 'Continue logging closed trades with full outcomes.',
        bucket: 'opportunities',
      }),
    );
    return out;
  }

  // ——— Performance / compare ———
  const wrRow = rowOf(compare, 'winRate');
  if (
    wrRow &&
    wrRow.trend === 'UP' &&
    (wrRow.delta ?? 0) >= R.WR_IMPROVE_ABS &&
    (compare?.previous.metrics.trades ?? 0) >= R.MIN_TRADES_FOR_COMPARE
  ) {
    out.push(
      insight({
        id: 'ti-wr-up',
        title: 'Win Rate increased',
        description: `Win rate moved from ${fmtPct(wrRow.previous)} to ${fmtPct(wrRow.current)}.`,
        category: 'Performance',
        severity: 'HIGH',
        confidence: 70 + Math.min(22, Math.abs(wrRow.delta ?? 0) * 2),
        evidence: [
          `winRate ${fmtPct(wrRow.previous)} → ${fmtPct(wrRow.current)}`,
          `delta=${fmtNum(wrRow.delta, 1)}`,
          `trend=${wrRow.trend}`,
        ],
        recommendation: 'Keep the setups that drove the win-rate lift; avoid expanding size too fast.',
        bucket: 'strengths',
      }),
    );
  }

  if (
    wrRow &&
    wrRow.trend === 'DOWN' &&
    (wrRow.delta ?? 0) <= -R.WR_IMPROVE_ABS &&
    (compare?.previous.metrics.trades ?? 0) >= R.MIN_TRADES_FOR_COMPARE
  ) {
    out.push(
      insight({
        id: 'ti-wr-down',
        title: 'Win Rate declined',
        description: `Win rate fell from ${fmtPct(wrRow.previous)} to ${fmtPct(wrRow.current)}.`,
        category: 'Performance',
        severity: 'HIGH',
        confidence: 70 + Math.min(22, Math.abs(wrRow.delta ?? 0) * 2),
        evidence: [
          `winRate ${fmtPct(wrRow.previous)} → ${fmtPct(wrRow.current)}`,
          `delta=${fmtNum(wrRow.delta, 1)}`,
        ],
        recommendation: 'Tighten entry filters and review recent losing setups.',
        bucket: 'weaknesses',
      }),
    );
  }

  const expRow = rowOf(compare, 'expectancy');
  if (
    expRow &&
    expRow.trend === 'DOWN' &&
    (expRow.delta ?? 0) <= -R.EXPECTANCY_FALL_ABS &&
    (compare?.previous.metrics.trades ?? 0) >= R.MIN_TRADES_FOR_COMPARE
  ) {
    out.push(
      insight({
        id: 'ti-exp-fall',
        title: 'Expectancy falling',
        description: `Expectancy declined from ${fmtNum(expRow.previous, 2)} to ${fmtNum(expRow.current, 2)} USDT.`,
        category: 'Performance',
        severity: 'HIGH',
        confidence: 85,
        evidence: [
          `expectancy ${fmtNum(expRow.previous, 2)} → ${fmtNum(expRow.current, 2)}`,
          `trend=${expRow.trend}`,
        ],
        recommendation: 'Pause size increases until expectancy stabilizes above break-even.',
        bucket: 'warnings',
      }),
    );
  }

  const pfRow = rowOf(compare, 'profitFactor');
  if (pfRow && pfRow.trend === 'UP' && (pfRow.current ?? 0) >= R.PF_STRONG) {
    out.push(
      insight({
        id: 'ti-pf-up',
        title: 'Profit factor increased',
        description: `Profit factor improved to ${fmtNum(pfRow.current, 2)}.`,
        category: 'Performance',
        severity: 'MEDIUM',
        confidence: 80,
        evidence: [`PF ${fmtNum(pfRow.previous, 2)} → ${fmtNum(pfRow.current, 2)}`],
        recommendation: 'Maintain current risk rules while PF stays above 1.5.',
        bucket: 'strengths',
      }),
    );
  }

  // Absolute performance
  if (m.winRate >= R.WIN_RATE_STRONG && tradeCount >= R.MIN_TRADES_FOR_COMPARE) {
    out.push(
      insight({
        id: 'ti-wr-strong',
        title: 'Strong win rate',
        description: `Win rate is ${fmtPct(m.winRate)} across ${tradeCount} trades.`,
        category: 'Performance',
        severity: 'MEDIUM',
        confidence: 75,
        evidence: [`winRate=${fmtPct(m.winRate)}`, `trades=${tradeCount}`],
        recommendation: 'Protect edge — avoid revenge size after wins.',
        bucket: 'strengths',
      }),
    );
  }

  if (m.winRate > 0 && m.winRate < R.WIN_RATE_WEAK && tradeCount >= R.MIN_TRADES_FOR_COMPARE) {
    out.push(
      insight({
        id: 'ti-wr-weak',
        title: 'Win rate below target',
        description: `Win rate is ${fmtPct(m.winRate)} — below ${R.WIN_RATE_WEAK}%.`,
        category: 'Performance',
        severity: 'HIGH',
        confidence: 82,
        evidence: [`winRate=${fmtPct(m.winRate)}`, `trades=${tradeCount}`],
        recommendation: 'Reduce trade frequency and focus on A+ setups only.',
        bucket: 'weaknesses',
      }),
    );
  }

  if (tradeCount >= 2 && m.winRate === 100) {
    out.push(
      insight({
        id: 'ti-all-wins',
        title: 'All winning sample',
        description: 'Every closed trade in this window is a win.',
        category: 'Performance',
        severity: 'INFO',
        confidence: 90,
        evidence: [`wins=${m.wins}`, `trades=${tradeCount}`],
        recommendation: 'Sample may be small — do not overfit size to a perfect streak.',
        bucket: 'strengths',
      }),
    );
  }

  if (tradeCount >= 2 && m.winRate === 0 && m.losses === tradeCount) {
    out.push(
      insight({
        id: 'ti-all-losses',
        title: 'All losing sample',
        description: 'Every closed trade in this window is a loss.',
        category: 'Performance',
        severity: 'CRITICAL',
        confidence: 95,
        evidence: [`losses=${m.losses}`, `trades=${tradeCount}`],
        recommendation: 'Stop trading this window profile until root cause is reviewed.',
        bucket: 'warnings',
      }),
    );
  }

  // ——— Risk ———
  const ddRow = rowOf(compare, 'maxDrawdown');
  if (
    ddRow &&
    ddRow.trend === 'DOWN' &&
    Math.abs(ddRow.delta ?? 0) >= R.DD_IMPROVE_ABS
  ) {
    out.push(
      insight({
        id: 'ti-dd-reduced',
        title: 'Drawdown reduced',
        description: `Max drawdown fell from ${fmtNum(ddRow.previous, 2)} to ${fmtNum(ddRow.current, 2)}.`,
        category: 'Risk',
        severity: 'MEDIUM',
        confidence: 88,
        evidence: [
          `maxDrawdown ${fmtNum(ddRow.previous, 2)} → ${fmtNum(ddRow.current, 2)}`,
          `trend=${ddRow.trend}`,
        ],
        recommendation: 'Keep risk caps that produced the drawdown improvement.',
        bucket: 'strengths',
      }),
    );
  }

  if (risk.riskLevel === 'HIGH' || risk.score >= R.RISK_HIGH_SCORE) {
    const sev: TradingInsightSeverity =
      risk.riskLevel === 'CRITICAL' || risk.score >= R.RISK_CRITICAL_SCORE
        ? 'CRITICAL'
        : 'HIGH';
    out.push(
      insight({
        id: 'ti-risk-elevated',
        title: 'Elevated risk level',
        description: risk.summary || `Risk score is ${risk.score} (${risk.riskLevel}).`,
        category: 'Risk',
        severity: sev,
        confidence: 90,
        evidence: [`riskLevel=${risk.riskLevel}`, `riskScore=${risk.score}`],
        recommendation: 'Reduce position size until risk returns to MEDIUM or lower.',
        bucket: 'warnings',
      }),
    );
  }

  const recRow = rowOf(compare, 'recoveryFactor');
  if (recRow && recRow.trend === 'UP' && (recRow.delta ?? 0) > 0) {
    out.push(
      insight({
        id: 'ti-recovery-up',
        title: 'Recovery improved',
        description: `Recovery factor rose to ${fmtNum(recRow.current, 2)}.`,
        category: 'Risk',
        severity: 'MEDIUM',
        confidence: 78,
        evidence: [`recovery ${fmtNum(recRow.previous, 2)} → ${fmtNum(recRow.current, 2)}`],
        recommendation: 'Continue disciplined exits that support recovery.',
        bucket: 'strengths',
      }),
    );
  }

  // ——— Psychology ———
  if (patterns.losingStreak >= R.LOSING_STREAK_WARN) {
    const sev: TradingInsightSeverity =
      patterns.losingStreak >= R.LOSING_STREAK_CRIT ? 'CRITICAL' : 'HIGH';
    out.push(
      insight({
        id: 'ti-lose-streak',
        title: 'Losing streak pressure',
        description: `Losing streak reached ${patterns.losingStreak} trades.`,
        category: 'Psychology',
        severity: sev,
        confidence: 86,
        evidence: [`losingStreak=${patterns.losingStreak}`],
        recommendation: 'Take a break or cut size — avoid revenge trading.',
        bucket: 'warnings',
      }),
    );
  }

  // ——— Strategy ———
  if (
    m.averageRr != null &&
    m.averageRr < R.RR_TARGET &&
    tradeCount >= R.MIN_TRADES_FOR_COMPARE
  ) {
    out.push(
      insight({
        id: 'ti-rr-low',
        title: 'Average RR below target',
        description: `Average RR is ${fmtNum(m.averageRr, 2)} vs target ${R.RR_TARGET}.`,
        category: 'Strategy',
        severity: 'HIGH',
        confidence: 84,
        evidence: [`averageRr=${fmtNum(m.averageRr, 2)}`, `target=${R.RR_TARGET}`],
        recommendation: 'Skip setups that cannot clear minimum RR.',
        bucket: 'weaknesses',
      }),
    );
  }

  if (patterns.bestStrategy && patterns.worstStrategy && patterns.bestStrategy !== patterns.worstStrategy) {
    out.push(
      insight({
        id: 'ti-strategy-gap',
        title: 'Strategy performance gap',
        description: `${patterns.bestStrategy} leads while ${patterns.worstStrategy} lags.`,
        category: 'Strategy',
        severity: 'MEDIUM',
        confidence: 72,
        evidence: [
          `bestStrategy=${patterns.bestStrategy}`,
          `worstStrategy=${patterns.worstStrategy}`,
        ],
        recommendation: `Prioritize ${patterns.bestStrategy}; reduce ${patterns.worstStrategy} size.`,
        bucket: 'opportunities',
      }),
    );
  }

  // ——— Coin ———
  if (
    coins.bestCoin &&
    coins.worstCoin &&
    coins.bestCoin !== coins.worstCoin &&
    coins.rows.length >= 2
  ) {
    const best = coins.rows[0];
    const worst = coins.rows[coins.rows.length - 1];
    if (
      best &&
      worst &&
      best.trades >= R.MIN_TRADES_FOR_COIN &&
      worst.trades >= R.MIN_TRADES_FOR_COIN &&
      best.totalPnl > worst.totalPnl
    ) {
      out.push(
        insight({
          id: 'ti-coin-gap',
          title: `${coins.bestCoin} outperforming ${coins.worstCoin}`,
          description: `${coins.bestCoin} PnL ${fmtNum(best.totalPnl, 2)} vs ${coins.worstCoin} ${fmtNum(worst.totalPnl, 2)}.`,
          category: 'Coin',
          severity: 'HIGH',
          confidence: 80 + Math.min(15, coins.rows.length),
          evidence: [
            `best=${coins.bestCoin} pnl=${fmtNum(best.totalPnl, 2)} wr=${fmtPct(best.winRate)}`,
            `worst=${coins.worstCoin} pnl=${fmtNum(worst.totalPnl, 2)} wr=${fmtPct(worst.winRate)}`,
          ],
          recommendation: `Allocate more focus to ${coins.bestCoin}; trim ${coins.worstCoin}.`,
          bucket: 'opportunities',
        }),
      );
    }
  }

  // ——— Timing ———
  if (patterns.worstTradingHour != null && tradeCount >= R.MIN_TRADES_FOR_TIMING) {
    const hour = patterns.pnlByHour.find((h) => h.hour === patterns.worstTradingHour);
    if (hour && hour.trades >= R.MIN_HOUR_TRADES && hour.pnl < 0) {
      const late = hour.hour >= R.LATE_HOUR_START;
      out.push(
        insight({
          id: 'ti-timing-worst-hour',
          title: late
            ? `Trading after ${String(R.LATE_HOUR_START).padStart(2, '0')}:00 losing`
            : `Weak hour UTC ${String(hour.hour).padStart(2, '0')}:00`,
          description: `Hour ${hour.hour} UTC shows PnL ${fmtNum(hour.pnl, 2)} over ${hour.trades} trades.`,
          category: 'Timing',
          severity: 'HIGH',
          confidence: 70 + Math.min(20, hour.trades * 3),
          evidence: [
            `worstHour=${hour.hour}`,
            `pnl=${fmtNum(hour.pnl, 2)}`,
            `trades=${hour.trades}`,
          ],
          recommendation: `Avoid new entries around ${String(hour.hour).padStart(2, '0')}:00 UTC.`,
          bucket: 'warnings',
        }),
      );
    }
  }

  // ——— Execution ———
  if (
    patterns.averageTradeDuration != null &&
    patterns.averageTradeDuration >= R.HOLD_LONG_MINUTES &&
    m.winRate < R.WIN_RATE_STRONG
  ) {
    out.push(
      insight({
        id: 'ti-hold-long',
        title: 'Holding too long',
        description: `Average hold is ${fmtNum(patterns.averageTradeDuration, 0)} minutes with WR ${fmtPct(m.winRate)}.`,
        category: 'Execution',
        severity: 'MEDIUM',
        confidence: 74,
        evidence: [
          `avgDuration=${fmtNum(patterns.averageTradeDuration, 0)}m`,
          `winRate=${fmtPct(m.winRate)}`,
        ],
        recommendation: 'Respect plan exits — avoid extending losers past invalidation.',
        bucket: 'weaknesses',
      }),
    );
  }

  // ——— Consistency ———
  if (m.consistencyScore < R.CONSISTENCY_WEAK && tradeCount >= R.MIN_TRADES_FOR_COMPARE) {
    out.push(
      insight({
        id: 'ti-consistency-low',
        title: 'Consistency lower',
        description: `Consistency score is ${fmtNum(m.consistencyScore, 0)}.`,
        category: 'Consistency',
        severity: 'MEDIUM',
        confidence: 77,
        evidence: [`consistencyScore=${fmtNum(m.consistencyScore, 0)}`],
        recommendation: 'Stabilize session rules and avoid mixing conflicting strategies.',
        bucket: 'weaknesses',
      }),
    );
  }

  if (m.consistencyScore >= R.CONSISTENCY_STRONG && tradeCount >= R.MIN_TRADES_FOR_COMPARE) {
    out.push(
      insight({
        id: 'ti-consistency-high',
        title: 'Consistency solid',
        description: `Consistency score is ${fmtNum(m.consistencyScore, 0)}.`,
        category: 'Consistency',
        severity: 'LOW',
        confidence: 70,
        evidence: [`consistencyScore=${fmtNum(m.consistencyScore, 0)}`],
        recommendation: 'Keep process unchanged while consistency stays elevated.',
        bucket: 'strengths',
      }),
    );
  }

  // ——— Market (light, from risk/net) ———
  if (m.netPnl < 0 && m.profitFactor < R.PF_WEAK && tradeCount >= R.MIN_TRADES_FOR_COMPARE) {
    out.push(
      insight({
        id: 'ti-market-hostile',
        title: 'Negative expectancy regime',
        description: 'Net PnL and profit factor are both weak in this window.',
        category: 'Market',
        severity: 'HIGH',
        confidence: 79,
        evidence: [
          `netPnl=${fmtNum(m.netPnl, 2)}`,
          `profitFactor=${fmtNum(m.profitFactor, 2)}`,
        ],
        recommendation: 'Stand down or trade only highest-conviction setups.',
        bucket: 'warnings',
      }),
    );
  }

  return out;
}
