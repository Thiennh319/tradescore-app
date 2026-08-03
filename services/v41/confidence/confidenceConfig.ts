/**
 * V4.1 Task 3 — Confidence Engine configuration.
 * Mọi trọng số / ngưỡng nằm ở đây — thuật toán không hard-code số.
 */

export const V41_CONFIDENCE_CONFIG = {
  /** Trọng số lớp tổng hợp (phải cộng = 1). */
  layerWeights: {
    trendReversal: 0.5,
    marketContext: 0.5,
  },

  /** Trọng số tín hiệu Trend Reversal (phải cộng = 1). */
  trendReversalSignalWeights: {
    cvdFlip: 0.25,
    volumeConfirmation: 0.25,
    trendExhaustion: 0.25,
    structureBreak: 0.25,
  },

  /** Trọng số chiều Market Context (phải cộng = 1). */
  marketContextDimensionWeights: {
    btc: 0.22,
    funding: 0.18,
    oi: 0.2,
    whale: 0.2,
    volatility: 0.2,
  },

  /** Điểm chuẩn hóa 0–100 cho từng trạng thái đọc-only. */
  pointValues: {
    signalConfirmed: 100,
    signalFailed: 0,
    dimensionPass: 100,
    dimensionFail: 0,
    dimensionSkipped: 40,
    /** Pha trộn confidence nội bộ Task 2 vào lớp trend. */
    trendInternalConfidenceBlend: 0.35,
    /** Điểm lớp context khi filter chưa được áp (trend chưa ACTIVE). */
    contextNotAppliedScore: 35,
  },

  /** Phạt thiếu dữ liệu — giảm completeness multiplier. */
  dataCompleteness: {
    skippedDimensionPenaltyPct: 8,
    contextNotAppliedPenaltyPct: 15,
    minCompletenessMultiplier: 0.4,
  },
} as const;

export type V41ConfidenceConfig = typeof V41_CONFIDENCE_CONFIG;
