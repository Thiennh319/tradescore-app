/**
 * V4.1 Task 4 — Decision Engine configuration.
 * Toàn bộ ngưỡng quyết định — thuật toán không hard-code số.
 */

export const V41_DECISION_CONFIG = {
  thresholds: {
    long: 75,
    short: 75,
    watch: 45,
    ignore: 25,
  },

  eligibility: {
    requiredTrendSignalCount: 4,
    minCompletenessMultiplier: 0.65,
    requireMarketContextPass: true,
    requireTrendReversalConfirmed: true,
  },

  hardBlockPolicy: {
    /** Hard block → WATCH (không IGNORE trừ khi đồng thời confidence quá thấp). */
    downgradeToWatch: true,
    blockCodes: {
      MARKET_CONTEXT_DENIED: 'Market Context phủ định',
      TREND_REVERSAL_UNCONFIRMED: 'Trend Reversal chưa xác nhận',
      DATA_COMPLETENESS_LOW: 'Dữ liệu không đủ độ tin cậy',
    },
  },

  ignorePolicy: {
    minCompletenessMultiplier: 0.55,
    neutralTrendDirection: true,
    zeroTrendSignals: true,
  },
} as const;

export type V41DecisionConfig = typeof V41_DECISION_CONFIG;
