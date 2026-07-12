export const FEATURE_FLAGS = {
  TP_PROBABILITY_FILTER: false,
  // Bật lại khi Journal có >= 300 closed trades
  // Xem tab Hiệu suất HT để theo dõi
  TP_PROBABILITY_MIN_TRADES: 300,
  /** ESM production wiring — compile-time default OFF; DEV/staging auto-enable via isEntryStateManagerEnabled (UL-04.2). */
  ENTRY_STATE_MANAGER_ENABLED: false,
} as const;

declare const __DEV__: boolean | undefined;

/** True when running Expo dev client or web dev server. */
function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Staging override — set EXPO_PUBLIC_TRADESCORE_STAGING=1 in staging builds only. */
function isStagingRuntime(): boolean {
  if (typeof process === 'undefined') return false;
  const flag = process.env.EXPO_PUBLIC_TRADESCORE_STAGING;
  return flag === '1' || flag === 'true';
}

/**
 * App-level ESM feature flag — sole runtime switch for production wiring.
 *
 * Production release: OFF (FEATURE_FLAGS false, no __DEV__, no staging env).
 * DEV / Staging: ON automatically (UL-04.2).
 */
export function isEntryStateManagerEnabled(): boolean {
  if (FEATURE_FLAGS.ENTRY_STATE_MANAGER_ENABLED === true) return true;
  if (isDevRuntime() || isStagingRuntime()) return true;
  return false;
}

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
