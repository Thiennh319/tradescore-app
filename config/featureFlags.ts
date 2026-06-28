export const FEATURE_FLAGS = {
  TP_PROBABILITY_FILTER: false,
  // Bật lại khi Journal có >= 300 closed trades
  // Xem tab Hiệu suất HT để theo dõi
  TP_PROBABILITY_MIN_TRADES: 300,
} as const;

let tpFilterEnableHintLogged = false;

/** Gợi ý bật lại filter — không tự động bật. */
export function maybeLogTpProbabilityFilterEnableHint(closedTradesCount: number): void {
  if (
    tpFilterEnableHintLogged ||
    closedTradesCount < FEATURE_FLAGS.TP_PROBABILITY_MIN_TRADES ||
    FEATURE_FLAGS.TP_PROBABILITY_FILTER
  ) {
    return;
  }
  console.log('[FeatureFlag] Đủ 300 lệnh — cân nhắc bật TP_PROBABILITY_FILTER');
  tpFilterEnableHintLogged = true;
}

/** Reset hint guard — chỉ dùng trong test. */
export function resetTpProbabilityFilterHintForTests(): void {
  tpFilterEnableHintLogged = false;
}

export function formatTpProbabilityFilterStatus(closedTradesCount: number): string {
  const status = FEATURE_FLAGS.TP_PROBABILITY_FILTER ? 'Bật' : 'Tắt';
  return [
    `TP Probability Filter: ${status}`,
    `Bật lại sau khi đủ ${FEATURE_FLAGS.TP_PROBABILITY_MIN_TRADES} lệnh đóng`,
    `Hiện tại: ${closedTradesCount} lệnh đóng`,
  ].join('\n');
}
