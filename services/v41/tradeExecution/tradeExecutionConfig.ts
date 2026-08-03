/**
 * V4.1 Task 6 — Trade Execution Planner configuration.
 * Toàn bộ tham số entry/SL/TP/risk — thuật toán không hard-code số.
 */

export const V41_TRADE_EXECUTION_CONFIG = {
  entry: {
    /** Biên entry zone ±% quanh giá tham chiếu. */
    zoneBufferPct: 0.35,
    /** Confidence ≥ ngưỡng → ưu tiên LIMIT trong vùng. */
    limitConfidenceMin: 75,
  },

  stopLoss: {
    /** SL mặc định theo % so với entry khi không có structureStopPrice. */
    defaultDistancePct: 1.2,
    /** Buffer thêm quanh mức structure từ metrics. */
    structureBufferPct: 0.3,
    /** Giới hạn SL tối đa (%). */
    maxStopDistancePct: 3.0,
  },

  takeProfit: {
    tp1RewardRisk: 1.0,
    tp2RewardRisk: 2.0,
    tp3RewardRisk: 3.0,
    minRewardRisk: 1.0,
  },

  risk: {
    lowConfidenceMin: 80,
    mediumConfidenceMin: 65,
    lowRiskSizePct: 100,
    mediumRiskSizePct: 75,
    highRiskSizePct: 50,
  },

  messages: {
    watch: 'Tiếp tục theo dõi.',
    ignore: 'Không sinh kế hoạch giao dịch — Decision IGNORE.',
    missingMarkPrice: 'Thiếu markPrice trong metrics — không thể lập Entry/SL/TP.',
  },

  metricsKeys: {
    markPrice: 'markPrice',
    structureStopPrice: 'structureStopPrice',
  },
} as const;

export type V41TradeExecutionConfig = typeof V41_TRADE_EXECUTION_CONFIG;
