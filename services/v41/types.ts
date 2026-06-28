/**
 * V4.1 core types — design source: docs/V4.1_ARCHITECTURE.md, docs/V4.1_FORMULAS.md
 * Types only; no runtime logic.
 */

/** Theo V4.1_FORMULAS.md — Market State Engine (8 category). */
export type MarketState =
  | 'StrongUptrend'
  | 'HealthyUptrend'
  | 'LateUptrend'
  | 'Distribution'
  | 'Accumulation'
  | 'WeakDowntrend'
  | 'StrongDowntrend'
  | 'Transition';

/** Theo V4.1_FORMULAS.md Engine 1 — trend_direction. */
export type TrendDirection = 'BULL' | 'BEAR' | 'NEUTRAL';

/** Hướng lệnh mở (Bước 2 — position_state). */
export type OpenDirection = 'LONG' | 'SHORT';

/**
 * Gói output Bước 1 — Market Intelligence Layer.
 * Theo V4.1_ARCHITECTURE.md § Bước 1 (Engine 1–4 + Market State).
 */
export interface MarketIntelligenceSnapshot {
  /** Engine 1 — TrendStrength, thang 0–100. Theo V4.1_FORMULAS.md Engine 1. */
  trendStrength: number;
  /** Engine 1 — trend_direction. Theo V4.1_FORMULAS.md Engine 1. */
  trendDirection: TrendDirection;
  /** Engine 2 — TrendExhaustion, thang 0–100. Theo V4.1_FORMULAS.md Engine 2. */
  trendExhaustion: number;
  /** Engine 2 Bước 3 — Volume_Divergence_pts (0 hoặc 20). Theo V4.1_FORMULAS.md. */
  volumeDivergencePts: 0 | 20;
  /** Engine 3 — ReversalProbability, thang 0–100. Theo V4.1_FORMULAS.md Engine 3. */
  reversalProbability: number;
  /** Engine 3 — RSI_Divergence_Score (0, 50, hoặc 100). Theo V4.1_FORMULAS.md Engine 3. */
  rsiDivergenceScore: 0 | 50 | 100;
  /** Engine 3 — CVD_Divergence_Score (0, 50, hoặc 100). Theo V4.1_FORMULAS.md Engine 3. */
  cvdDivergenceScore: 0 | 50 | 100;
  /** Engine 4 — MarketConfidence, thang 0–100. Theo V4.1_FORMULAS.md Engine 4. */
  marketConfidence: number;
  /** Engine 4 — BTCAlignmentFactor, thang 0.5–1.0. Theo V4.1_ARCHITECTURE.md Bước 1. */
  btcAlignmentFactor: number;
  /** Engine 4 — hướng BTC (mapped to TrendDirection trong V4.1). Theo V4.1_ARCHITECTURE.md Bước 1. */
  btcDirection: TrendDirection;
  /** Market State Engine — 1 trong 8 category. Theo V4.1_FORMULAS.md Market State. */
  marketState: MarketState;
  /** Unix ms — thời điểm scan (scan_timestamp). Theo V4.1_ARCHITECTURE.md Bước 1. */
  scanTimestamp: number;
}

/**
 * visibility_mode — output Bước 2 Visibility Manager.
 * Theo V4.1_ARCHITECTURE.md § Bước 2.
 */
export type VisibilityMode = 'INACTIVE' | 'WATCH_MODE' | 'TRADE_MODE' | 'POSITION_MODE';

/**
 * position_state — input Bước 2 Visibility Manager.
 * Theo V4.1_ARCHITECTURE.md § Bước 2.
 */
export interface PositionState {
  hasOpenPosition: boolean;
  openDirection: OpenDirection | null;
  symbol: string | null;
}

/**
 * Kết quả Visibility Manager (Bước 2) sau một lần đánh giá.
 * Theo V4.1_ARCHITECTURE.md § Bước 2 + Buy/Sell Score sơ bộ.
 */
export interface VisibilityResult {
  visibilityMode: VisibilityMode;
  /** visibility_reason — debug/UI. Theo V4.1_ARCHITECTURE.md Bước 2. */
  visibilityReason: string;
  /** buy_score_preliminary — bộ lọc thô HIỆN/ẨN, không phải entry_quality Bước 3. */
  buyScorePreliminary: number;
  /** sell_score_preliminary — bộ lọc thô HIỆN/ẨN, không phải entry_quality Bước 3. */
  sellScorePreliminary: number;
}

/**
 * Ngưỡng Visibility Manager — không hardcode trong logic engine.
 * Theo V4.1_ARCHITECTURE.md § Bước 2 (Hysteresis + WATCH↔TRADE).
 */
export interface VisibilityConfig {
  /** Ngưỡng HIỆN — Buy/Sell Score sơ bộ (default 10). */
  showBuySellThreshold: number;
  /** Ngưỡng HIỆN — ReversalProbability (default 60). */
  showReversalThreshold: number;
  /** Ngưỡng HIỆN — TrendExhaustion (default 60). */
  showExhaustionThreshold: number;
  /** Ngưỡng ẨN — Buy/Sell Score sơ bộ (default 8). */
  hideBuySellThreshold: number;
  /** Ngưỡng ẨN — ReversalProbability (default 50). */
  hideReversalThreshold: number;
  /** Ngưỡng ẨN — TrendExhaustion (default 50). */
  hideExhaustionThreshold: number;
  /** Ngưỡng WATCH_MODE → TRADE_MODE — entry_quality hướng tốt nhất (default 70). */
  tradeModeEntryQualityThreshold: number;
}

/** Giá trị mặc định VisibilityConfig — khớp spec Hysteresis V4.1_ARCHITECTURE.md. */
export const DEFAULT_VISIBILITY_CONFIG: VisibilityConfig = {
  showBuySellThreshold: 10,
  showReversalThreshold: 60,
  showExhaustionThreshold: 60,
  hideBuySellThreshold: 8,
  hideReversalThreshold: 50,
  hideExhaustionThreshold: 50,
  tradeModeEntryQualityThreshold: 70,
};
