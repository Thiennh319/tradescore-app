/**
 * Task 15.4 — Static recommendation mapping rules (no calculation).
 */

import type { TradingInsight, TradingInsightSeverity } from '../insight/TradingInsightTypes';
import type {
  TradingRecommendationCategory,
  TradingRecommendationEffort,
  TradingRecommendationExpectedBenefit,
  TradingRecommendationImpact,
  TradingRecommendationPriority,
} from './TradingRecommendationTypes';

export type RecommendationTemplate = {
  /** Stable recommendation id stem (prefixed with tr-). */
  id: string;
  title: string;
  description: string;
  action: string;
  category: TradingRecommendationCategory;
  impact: TradingRecommendationImpact;
  effort: TradingRecommendationEffort;
  expectedBenefit: TradingRecommendationExpectedBenefit;
  /** Optional title override using dashboard labels (bestCoin etc.). */
  titleFromInsight?: boolean;
};

/** Map insight severity → recommendation priority (copy, no scoring). */
export function priorityFromSeverity(
  severity: TradingInsightSeverity,
): TradingRecommendationPriority {
  switch (severity) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    case 'LOW':
      return 'LOW';
    case 'INFO':
    default:
      return 'INFO';
  }
}

/**
 * Insight id → recommendation template.
 * Unknown ids fall back to insight.recommendation text.
 */
export const RECOMMENDATION_BY_INSIGHT_ID: Record<string, RecommendationTemplate> = {
  'ti-empty': {
    id: 'keep-journaling',
    title: 'Keep completing journaled trades',
    description: 'Build a closed-trade sample before acting on recommendations.',
    action: 'Continue logging closed trades',
    category: 'Portfolio',
    impact: 'LOW',
    effort: 'EASY',
    expectedBenefit: 'Consistency',
  },
  'ti-wr-up': {
    id: 'protect-wr-edge',
    title: 'Protect the win-rate edge',
    description: 'Do not ramp size aggressively after a win-rate lift.',
    action: 'Hold size steady for next 10 trades',
    category: 'Performance',
    impact: 'MEDIUM',
    effort: 'EASY',
    expectedBenefit: 'Win Rate',
  },
  'ti-wr-down': {
    id: 'tighten-entries-wr',
    title: 'Tighten entry filters',
    description: 'Win rate declined — reduce frequency to A+ setups only.',
    action: 'Trade A+ setups only until WR recovers',
    category: 'Performance',
    impact: 'HIGH',
    effort: 'MEDIUM',
    expectedBenefit: 'Win Rate',
  },
  'ti-exp-fall': {
    id: 'pause-size-expectancy',
    title: 'Pause size increases',
    description: 'Expectancy is falling — freeze size until expectancy stabilizes.',
    action: 'Freeze position size until expectancy recovers',
    category: 'Performance',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Expectancy',
  },
  'ti-pf-up': {
    id: 'maintain-pf-rules',
    title: 'Maintain current risk rules',
    description: 'Profit factor improved — keep the rules that produced it.',
    action: 'Keep current SL/TP and size rules unchanged',
    category: 'Performance',
    impact: 'MEDIUM',
    effort: 'EASY',
    expectedBenefit: 'Profit Factor',
  },
  'ti-wr-strong': {
    id: 'avoid-revenge-after-wins',
    title: 'Avoid revenge sizing after wins',
    description: 'Strong WR — protect edge by keeping size disciplined.',
    action: 'Cap size at current max for next sessions',
    category: 'Psychology',
    impact: 'MEDIUM',
    effort: 'EASY',
    expectedBenefit: 'Discipline',
  },
  'ti-wr-weak': {
    id: 'reduce-frequency-wr',
    title: 'Reduce trade frequency',
    description: 'Win rate is below target — cut low-quality setups.',
    action: 'Cut trade count by focusing on A+ setups only',
    category: 'Performance',
    impact: 'HIGH',
    effort: 'MEDIUM',
    expectedBenefit: 'Win Rate',
  },
  'ti-all-wins': {
    id: 'do-not-overfit-streak',
    title: 'Do not overfit a perfect streak',
    description: 'All-win sample may be small — keep size conservative.',
    action: 'Keep size unchanged despite perfect streak',
    category: 'Psychology',
    impact: 'MEDIUM',
    effort: 'EASY',
    expectedBenefit: 'Discipline',
  },
  'ti-all-losses': {
    id: 'stop-window-profile',
    title: 'Stop this trading window profile',
    description: 'All-loss sample — halt until root cause is reviewed.',
    action: 'Pause trading this profile until review is done',
    category: 'Risk',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Risk',
  },
  'ti-dd-reduced': {
    id: 'keep-drawdown-caps',
    title: 'Keep drawdown risk caps',
    description: 'Drawdown improved — preserve the caps that worked.',
    action: 'Maintain current max risk per trade',
    category: 'Risk',
    impact: 'MEDIUM',
    effort: 'EASY',
    expectedBenefit: 'Drawdown',
  },
  'ti-risk-elevated': {
    id: 'reduce-size-30',
    title: 'Reduce position size by 30%',
    description: 'Risk level is elevated — cut size to protect capital.',
    action: 'Reduce position size by 30%',
    category: 'Risk',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Risk',
  },
  'ti-recovery-up': {
    id: 'keep-recovery-exits',
    title: 'Keep disciplined recovery exits',
    description: 'Recovery improved — continue plan-based exits.',
    action: 'Continue following plan exits without extension',
    category: 'Risk',
    impact: 'MEDIUM',
    effort: 'EASY',
    expectedBenefit: 'Drawdown',
  },
  'ti-lose-streak': {
    id: 'break-revenge-cycle',
    title: 'Take a break — no revenge trades',
    description: 'Losing streak pressure — step away or cut size hard.',
    action: 'Pause new entries for one session or cut size 50%',
    category: 'Psychology',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Discipline',
  },
  'ti-rr-low': {
    id: 'min-rr-2',
    title: 'Increase minimum RR to 2.0',
    description: 'Average RR is below target — raise the entry RR floor.',
    action: 'Increase minimum RR to 2.0',
    category: 'Strategy',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Expectancy',
  },
  'ti-strategy-gap': {
    id: 'prioritize-best-strategy',
    title: 'Prioritize leading strategy',
    description: 'Strategy gap detected — allocate to the leader.',
    action: 'Prioritize best strategy; reduce worst strategy size',
    category: 'Strategy',
    impact: 'MEDIUM',
    effort: 'MEDIUM',
    expectedBenefit: 'Profit Factor',
  },
  'ti-coin-gap': {
    id: 'prioritize-best-coin',
    title: 'Prioritize leading coin setups',
    description: 'Coin performance gap — focus on the outperforming symbol.',
    action: 'Prioritize BTC setups',
    category: 'Coin',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Win Rate',
    titleFromInsight: true,
  },
  'ti-timing-worst-hour': {
    id: 'avoid-late-entries',
    title: 'Avoid opening positions after 22:00 UTC',
    description: 'Weak timing window — block new entries in the losing hour band.',
    action: 'Avoid opening positions after 22:00 UTC',
    category: 'Timing',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Win Rate',
  },
  'ti-hold-long': {
    id: 'cut-hold-under-4h',
    title: 'Reduce average holding time below 4 hours',
    description: 'Holds are too long vs results — tighten time stops.',
    action: 'Reduce average holding time below 4 hours',
    category: 'Execution',
    impact: 'MEDIUM',
    effort: 'MEDIUM',
    expectedBenefit: 'Execution',
  },
  'ti-consistency-low': {
    id: 'stabilize-session-rules',
    title: 'Stabilize session rules',
    description: 'Consistency is low — one playbook per session.',
    action: 'Use one strategy playbook per session',
    category: 'Portfolio',
    impact: 'MEDIUM',
    effort: 'MEDIUM',
    expectedBenefit: 'Consistency',
  },
  'ti-consistency-high': {
    id: 'keep-process',
    title: 'Keep the current process',
    description: 'Consistency is solid — avoid process churn.',
    action: 'Keep process unchanged this week',
    category: 'Portfolio',
    impact: 'LOW',
    effort: 'EASY',
    expectedBenefit: 'Consistency',
  },
  'ti-market-hostile': {
    id: 'stand-down-hostile',
    title: 'Stand down in hostile regime',
    description: 'Negative expectancy regime — trade only highest conviction.',
    action: 'Stand down or trade A+ only until PF recovers',
    category: 'Risk',
    impact: 'HIGH',
    effort: 'EASY',
    expectedBenefit: 'Risk',
  },
};

/** Fallback when insight id has no template — use insight fields only. */
export function fallbackTemplate(insight: TradingInsight): RecommendationTemplate {
  return {
    id: `from-${insight.id}`,
    title: insight.recommendation || insight.title,
    description: insight.description,
    action: insight.recommendation || insight.title,
    category: mapInsightCategory(insight.category),
    impact: insight.severity === 'CRITICAL' || insight.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
    effort: 'MEDIUM',
    expectedBenefit: 'Discipline',
  };
}

function mapInsightCategory(
  cat: TradingInsight['category'],
): TradingRecommendationCategory {
  switch (cat) {
    case 'Risk':
      return 'Risk';
    case 'Performance':
      return 'Performance';
    case 'Coin':
      return 'Coin';
    case 'Timing':
      return 'Timing';
    case 'Execution':
      return 'Execution';
    case 'Strategy':
      return 'Strategy';
    case 'Psychology':
      return 'Psychology';
    case 'Market':
      return 'Risk';
    case 'Consistency':
      return 'Portfolio';
    default:
      return 'Portfolio';
  }
}
