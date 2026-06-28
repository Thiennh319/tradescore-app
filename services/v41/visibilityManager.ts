import type {
  MarketIntelligenceSnapshot,
  PositionState,
  VisibilityMode,
  VisibilityConfig,
} from './types';
import { DEFAULT_VISIBILITY_CONFIG } from './types';

/**
 * Buy/Sell Score sơ bộ — bộ lọc thô cho Visibility Manager.
 * Theo V4.1_ARCHITECTURE.md § Bước 2 (Buy/Sell Score sơ bộ).
 * CHỈ dùng MarketIntelligenceSnapshot, KHÔNG phải entry_quality
 * đầy đủ (Bước 3) — mục đích chỉ để quyết định hiện/ẩn.
 */
export function calculatePreliminaryScores(
  mi: MarketIntelligenceSnapshot,
): { buyScorePreliminary: number; sellScorePreliminary: number } {
  let buyScorePreliminary = 0;
  let sellScorePreliminary = 0;

  if (mi.trendDirection === 'BULL') {
    buyScorePreliminary += 5;
  }
  if (mi.marketState === 'StrongUptrend' || mi.marketState === 'HealthyUptrend') {
    buyScorePreliminary += 5;
  }
  if (mi.trendStrength >= 50) {
    buyScorePreliminary += 3;
  }

  if (mi.trendDirection === 'BEAR') {
    sellScorePreliminary += 5;
  }
  if (mi.marketState === 'StrongDowntrend' || mi.marketState === 'WeakDowntrend') {
    sellScorePreliminary += 5;
  }
  if (mi.trendStrength >= 50) {
    sellScorePreliminary += 3;
  }

  return { buyScorePreliminary, sellScorePreliminary };
}

/**
 * Giai đoạn 1 — Hysteresis state machine cho Visibility Manager.
 * Theo V4.1_ARCHITECTURE.md § Bước 2 (Hysteresis State Machine).
 * Đánh giá theo thứ tự ưu tiên, dừng tại điều kiện đầu tiên khớp.
 * KHÔNG xử lý nâng/hạ WATCH_MODE↔TRADE_MODE (xem resolveTradeModeUpgrade,
 * cần entry_quality từ Bước 3, viết ở task riêng).
 */
export function resolveVisibilityHysteresis(
  mi: MarketIntelligenceSnapshot,
  position: PositionState,
  previousMode: VisibilityMode,
  config: VisibilityConfig = DEFAULT_VISIBILITY_CONFIG,
): {
  mode: VisibilityMode;
  reason: string;
  buyScorePreliminary: number;
  sellScorePreliminary: number;
} {
  const { buyScorePreliminary, sellScorePreliminary } =
    calculatePreliminaryScores(mi);

  // Bước 1: Open Position luôn ghi đè, không bao giờ tự ẩn
  if (position.hasOpenPosition) {
    return {
      mode: 'POSITION_MODE',
      reason: 'Có vị thế đang mở — luôn hiển thị, không tự ẩn',
      buyScorePreliminary,
      sellScorePreliminary,
    };
  }

  // Bước 2: điều kiện HIỆN
  const showCondition =
    buyScorePreliminary >= config.showBuySellThreshold ||
    sellScorePreliminary >= config.showBuySellThreshold ||
    mi.reversalProbability >= config.showReversalThreshold ||
    mi.trendExhaustion >= config.showExhaustionThreshold;

  if (showCondition) {
    if (previousMode === 'INACTIVE') {
      return {
        mode: 'WATCH_MODE',
        reason: 'Mới đạt điều kiện hiển thị — bắt đầu giám sát',
        buyScorePreliminary,
        sellScorePreliminary,
      };
    }
    return {
      mode: previousMode,
      reason: 'Vẫn đạt điều kiện hiển thị — giữ trạng thái hiện tại',
      buyScorePreliminary,
      sellScorePreliminary,
    };
  }

  // Bước 3: điều kiện ẨN
  const hideCondition =
    buyScorePreliminary < config.hideBuySellThreshold &&
    sellScorePreliminary < config.hideBuySellThreshold &&
    mi.reversalProbability < config.hideReversalThreshold &&
    mi.trendExhaustion < config.hideExhaustionThreshold;

  if (hideCondition) {
    return {
      mode: 'INACTIVE',
      reason: 'Dưới ngưỡng ẩn ở mọi chỉ số — không còn đáng chú ý',
      buyScorePreliminary,
      sellScorePreliminary,
    };
  }

  // Bước 4: vùng hysteresis gap — giữ nguyên trạng thái cũ
  return {
    mode: previousMode,
    reason: 'Vùng trung gian giữa ngưỡng hiện/ẩn — giữ trạng thái trước',
    buyScorePreliminary,
    sellScorePreliminary,
  };
}

/**
 * Giai đoạn 2 — Nâng/hạ WATCH_MODE ↔ TRADE_MODE.
 * Theo V4.1_ARCHITECTURE.md § Bước 2 (Nâng/hạ WATCH↔TRADE).
 * Gọi SAU khi đã có entry_quality từ Bước 3 (Opportunity Detection),
 * trong CÙNG 1 lần scan, sau khi resolveVisibilityHysteresis đã
 * xác định currentMode ∈ {WATCH_MODE, TRADE_MODE}.
 * KHÔNG xử lý INACTIVE (chỉ resolveVisibilityHysteresis mới đưa
 * ra INACTIVE).
 */
export function resolveTradeModeUpgrade(
  currentMode: VisibilityMode,
  hasOpenPosition: boolean,
  bestEntryQuality: number,
  config: VisibilityConfig = DEFAULT_VISIBILITY_CONFIG,
): VisibilityMode {
  if (hasOpenPosition) {
    return 'POSITION_MODE';
  }

  if (currentMode === 'WATCH_MODE' || currentMode === 'TRADE_MODE') {
    return bestEntryQuality >= config.tradeModeEntryQualityThreshold
      ? 'TRADE_MODE'
      : 'WATCH_MODE';
  }

  // INACTIVE hoặc POSITION_MODE (không qua hysteresis nâng/hạ) —
  // giữ nguyên, không xử lý ở hàm này
  return currentMode;
}
