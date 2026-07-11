// ─── SMC & Swing Structure ───────────────────────────────────────────────────

export type StructureType = 'BOS' | 'CHOCH' | 'NONE';

export type MarketTrend = 'BULLISH' | 'BEARISH' | 'SIDEWAYS';

export interface SwingPoint {
  price: number;
  timestamp: number;
  type: 'HIGH' | 'LOW';
}

export interface SMCSignal {
  type: StructureType;
  trend: MarketTrend;
  breakPrice: number;
  timestamp: number;
}

// ─── Multi-Timeframe & Liquidity ───────────────────────────────────────────────

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';

export interface LiquidityPool {
  price: number;
  volume: number;
  strength: number;
  type: 'LIQUIDATION' | 'ORDERBOOK_WALL';
}

// ─── Advanced Funding & OI ─────────────────────────────────────────────────────

export type FundingOIRegime =
  | 'LONG_SQUEEZE_RISK'
  | 'SHORT_SQUEEZE_RISK'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'NEUTRAL';

export interface FundingOISignal {
  DeltaOI: number;
  fundingVelocity: number;
  regime: FundingOIRegime;
}

// ─── AI Scoring Engine ─────────────────────────────────────────────────────────

export type MarketRegime =
  | 'TRENDING_BULL'
  | 'TRENDING_BEAR'
  | 'MEAN_REVERSION'
  | 'HIGH_VOLATILITY_CHOP';

export type AIMatrixWeights = Record<string, number>;

export interface EntryQualityScore {
  score: number;
  mae: number;
  liquidityDistance: number;
  note: string;
}

// ─── Advanced Backtest Engine ──────────────────────────────────────────────────

/** Futures/perp pair identifier, e.g. BTCUSDT */
export type TradeSymbol = string;

/** Supported perpetual pairs in the dashboard */
export const TRADE_SYMBOLS = ['BTCUSDT', 'NEARUSDT', 'SOLUSDT', 'BNBUSDT'] as const;

export type AppTradeSymbol = (typeof TRADE_SYMBOLS)[number];

export interface BacktestConfig {
  symbol: TradeSymbol;
  timeframe: Timeframe;
  startDate: number;
  endDate: number;
  initialBalance: number;
  slippagePercent: number;
  includeFundingFee: boolean;
}

export interface BacktestResult {
  totalTrades: number;
  winRate: number;
  netProfit: number;
  maxDrawdown: number;
  profitFactor: number;
  totalSlippagePaid: number;
  totalFundingPaid: number;
  avgEntryQuality: number;
  equityCurve: Float32Array;
}

// ─── App Settings ──────────────────────────────────────────────────────────────

export interface AppSettings {
  /** Vốn hiện tại (USDT) — đồng bộ với currentCapital */
  accountSize: number;
  /** Vốn gốc lần đầu nhập — mốc tính tier GD */
  initialCapital: number;
  /** Vốn tại milestone hiện tại — nâng tier khi +30% */
  lastMilestoneCapital: number;
  sizePerTrade: number;
  leverage: number;
  maxLossPerTrade: number;
  maxLossPerWeek: number;
  maxLossPerMonth: number;
  refreshInterval: number;
  timezone: string;
  autoCheckStartHour: number;
  autoCheckEndHour: number;
  triggerMinute: number;
}

// ─── Technical Layers (14) ─────────────────────────────────────────────────────

export const LAYER_NAMES = [
  'EMA_TREND',
  'BOS_CHOCH',
  'RSI',
  'MACD',
  'BOLLINGER',
  'VOLUME_PROFILE',
  'CVD_DIVERGENCE',
  'FUNDING_OI',
  'LIQUIDITY_POOL',
  'ORDERBOOK_IMBALANCE',
  'ATR_VOLATILITY',
  'SUPPORT_RESISTANCE',
  'MTF_CONFLUENCE',
  'ENTRY_QUALITY',
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

// ─── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  accountSize: 34,
  initialCapital: 34,
  lastMilestoneCapital: 34,
  sizePerTrade: 6,
  leverage: 5,
  maxLossPerTrade: 1.5,
  maxLossPerWeek: 15,
  maxLossPerMonth: 34,
  refreshInterval: 60,
  timezone: 'UTC+7',
  autoCheckStartHour: 6,
  autoCheckEndHour: 22,
  triggerMinute: 2,
};

export const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

/** Khung phân tích chính — người dùng chọn 1 trong 3 */
export const ANALYSIS_TIMEFRAMES = ['1h', '4h', '1d'] as const;
export type AnalysisTimeframe = (typeof ANALYSIS_TIMEFRAMES)[number];

/**
 * Dynamic AI weight matrix per market regime.
 * TRENDING regimes amplify BOS/CHoCH + trend layers.
 * MEAN_REVERSION amplifies Bollinger + RSI layers.
 */
export const REGIME_WEIGHTS: Record<MarketRegime, AIMatrixWeights> = {
  TRENDING_BULL: {
    EMA_TREND: 0.14,
    BOS_CHOCH: 0.18,
    RSI: 0.04,
    MACD: 0.11,
    BOLLINGER: 0.03,
    VOLUME_PROFILE: 0.06,
    CVD_DIVERGENCE: 0.05,
    FUNDING_OI: 0.07,
    LIQUIDITY_POOL: 0.05,
    ORDERBOOK_IMBALANCE: 0.04,
    ATR_VOLATILITY: 0.03,
    SUPPORT_RESISTANCE: 0.04,
    MTF_CONFLUENCE: 0.11,
    ENTRY_QUALITY: 0.05,
  },
  TRENDING_BEAR: {
    EMA_TREND: 0.13,
    BOS_CHOCH: 0.17,
    RSI: 0.04,
    MACD: 0.11,
    BOLLINGER: 0.03,
    VOLUME_PROFILE: 0.06,
    CVD_DIVERGENCE: 0.06,
    FUNDING_OI: 0.07,
    LIQUIDITY_POOL: 0.06,
    ORDERBOOK_IMBALANCE: 0.04,
    ATR_VOLATILITY: 0.03,
    SUPPORT_RESISTANCE: 0.04,
    MTF_CONFLUENCE: 0.11,
    ENTRY_QUALITY: 0.05,
  },
  MEAN_REVERSION: {
    EMA_TREND: 0.04,
    BOS_CHOCH: 0.04,
    RSI: 0.15,
    MACD: 0.04,
    BOLLINGER: 0.16,
    VOLUME_PROFILE: 0.07,
    CVD_DIVERGENCE: 0.09,
    FUNDING_OI: 0.05,
    LIQUIDITY_POOL: 0.07,
    ORDERBOOK_IMBALANCE: 0.05,
    ATR_VOLATILITY: 0.04,
    SUPPORT_RESISTANCE: 0.11,
    MTF_CONFLUENCE: 0.04,
    ENTRY_QUALITY: 0.05,
  },
  HIGH_VOLATILITY_CHOP: {
    EMA_TREND: 0.04,
    BOS_CHOCH: 0.04,
    RSI: 0.06,
    MACD: 0.04,
    BOLLINGER: 0.07,
    VOLUME_PROFILE: 0.08,
    CVD_DIVERGENCE: 0.07,
    FUNDING_OI: 0.09,
    LIQUIDITY_POOL: 0.11,
    ORDERBOOK_IMBALANCE: 0.10,
    ATR_VOLATILITY: 0.12,
    SUPPORT_RESISTANCE: 0.05,
    MTF_CONFLUENCE: 0.04,
    ENTRY_QUALITY: 0.09,
  },
};

/** Binance Futures dark theme palette */
export const COLORS = {
  background: '#0B0E11',
  surface: '#1E2329',
  surfaceElevated: '#2B3139',
  border: '#363A45',
  textPrimary: '#EAECEF',
  textSecondary: '#848E9C',
  textMuted: '#5E6673',
  accent: '#F0B90B',
  bullish: '#0ECB81',
  bullishMuted: '#2EBD85',
  bearish: '#F6465D',
  bearishMuted: '#E33B54',
  info: '#3861FB',
  warning: '#F0B90B',
  neutral: '#848E9C',
  success: '#22C55E',
  danger: '#EF4444',
  chartGrid: '#2B3139',
  overlay: 'rgba(11, 14, 17, 0.85)',
} as const;

/** Alias palette cho GroupScoreBar / V3 UI */
export const THEME_COLORS = {
  red: COLORS.bearish,
  yellow: COLORS.warning,
  green: COLORS.bullish,
  background: COLORS.background,
  card: COLORS.surface,
  textPrimary: COLORS.textPrimary,
  textSecondary: COLORS.textSecondary,
} as const;

export const SCORE_THRESHOLDS = {
  /** Phase 4 v2 — thang tổng 15đ (2 chiều LONG/SHORT) */
  NO_ENTRY_MAX: 8,
  WAIT_MAX: 9,
  CAN_ENTER_MAX: 10,
  CONFIDENT_MAX: 11.5,
  /** AI spectrum 0–100 (giữ tương thích phần AI / ma trận) */
  strongLong: 80,
  long: 65,
  neutralHigh: 55,
  neutralLow: 45,
  short: 35,
  strongShort: 20,
  minEntryQuality: 50,
  maxMAEPercent: 1.5,
  maxLiquidityDistancePercent: 0.8,
} as const;

/** Lớp bắt buộc Phase 4 v2 — áp dụng cho cả LONG và SHORT */
export const MANDATORY_LAYERS_V2 = [1, 3, 6, 8, 9, 10] as const;

export type MandatoryLayerV2 = (typeof MANDATORY_LAYERS_V2)[number];

/** Chặn cứng trước khi chấm điểm / vào lệnh (v2) */
export const HARD_BLOCK_RULES = {
  BTC_EXTREME_PCT: 8,
  BTC_LONG_BLOCK_PCT: -2,
  BTC_SHORT_BLOCK_PCT: 2,
  FUNDING_LONG_SQUEEZE_PCT: 0.03,
  FUNDING_SHORT_SQUEEZE_PCT: -0.03,
  MAX_CONSECUTIVE_LOSSES: 3,
  MAX_DAILY_LOSS_USDT: 3,
  /** Sau 3 thua liên tiếp trong 24h → khóa vào lệnh, tự mở sau số phút này */
  LOSS_STREAK_LOCK_MINUTES: 180,
  LOSS_STREAK_WINDOW_MS: 24 * 60 * 60 * 1000,
} as const;

// ─── Phase 4: 10-Layer Scorer Engine ───────────────────────────────────────────

export type ScorerLayerId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Tên hiển thị lớp chấm điểm Phase 4 v2 (1–10) */
export const SCORER_LAYER_NAMES: Record<ScorerLayerId, string> = {
  1: 'Giá & EMA/SMA',
  2: 'RSI 14',
  3: 'MACD',
  4: 'Bollinger %B',
  5: 'Volume/OI/CVD',
  6: 'Funding Rate',
  7: 'Long/Short Ratio',
  8: 'BTC 24h',
  9: 'Phiên giao dịch',
  10: 'Tâm lý & Kỷ luật',
};

export const DECISION_LABELS_V2 = {
  KHONG_VAO: { label: 'KHÔNG VÀO', color: '#F6465D', winrate: '~50%' },
  CHO_THEM: { label: 'CHỜ THÊM', color: '#F0B90B', winrate: '~55%' },
  CO_THE_VAO: { label: 'CÓ THỂ VÀO', color: '#F0B90B', winrate: '~65%' },
  VAO_TU_TIN: { label: 'VÀO TỰ TIN', color: '#0ECB81', winrate: '~70-75%' },
  SETUP_NGON: { label: 'SETUP NGON 🔥', color: '#0ECB81', winrate: '~80%+' },
} as const;

export type DecisionTypeV2 = keyof typeof DECISION_LABELS_V2;

export const PSYCHOLOGY_CHECKLIST_ITEMS = [
  { key: 'alert', label: 'Tỉnh táo, không bị cảm xúc chi phối' },
  { key: 'noLossStreak', label: 'Không trong cooldown 3 thua liên tiếp (24h)' },
  { key: 'dailyLossOk', label: 'Lỗ ngày hiện tại < 3 USDT' },
  { key: 'noFomo', label: 'Không FOMO / không revenge trade' },
  { key: 'slTpReady', label: 'Đã đặt sẵn SL/TP trước khi vào lệnh' },
] as const;

export type PsychologyChecklistItemKey =
  (typeof PSYCHOLOGY_CHECKLIST_ITEMS)[number]['key'];

/** Checklist tâm lý v2 — dùng cho Lớp 10 (phần 2 scorer) */
export type PsychologyChecklistV2 = Record<PsychologyChecklistItemKey, boolean>;

/** Alias theo spec Scorer v2 */
export type PsychologyChecklist = PsychologyChecklistV2;

export const DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST: PsychologyChecklistV2 = {
  alert: false,
  noLossStreak: true,
  dailyLossOk: true,
  noFomo: true,
  slTpReady: false,
};

export const LAYER_MAX_POINTS = 1.5;

/** Tổng điểm tối đa Phase 4 v2 */
export const SCORER_MAX_TOTAL_V2 = 10 * LAYER_MAX_POINTS;

export interface LayerResult {
  layer: ScorerLayerId;
  name: string;
  score: number;
  maxScore: number;
  passed: boolean;
  isMandatory: boolean;
  isMandatoryViolation: boolean;
  reason: string;
}

export type TradeDirection = 'LONG' | 'SHORT';

export type TradeDecisionLabel =
  | 'KHONG_VAO'
  | 'CHO_THEM'
  | 'CHO_TAI_CHAM'
  | 'CO_THE_VAO'
  | 'VAO_TU_TIN'
  | 'SETUP_NGON';

/** Phiên bản engine chấm điểm (V3 và V4 code tách biệt) */
export type ScorerVersion = 'v3' | 'v4';

export interface TradeDecision {
  label: TradeDecisionLabel;
  display: string;
  canEnter: boolean;
  totalScore: number;
  blockedByMandatory: boolean;
  mandatoryViolations: string[];
}

export interface TradePlan {
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  positionSize: number;
  marginRequired: number;
  notional: number;
  riskAmount: number;
  atrMultiplier: number;
  rrRatios: [number, number, number];
  notes: string;
  /** Giá mark lúc quét — để so với entry limit */
  marketPrice?: number;
  /** Lý do chọn mức entry (EMA20, ATR pullback, v.v.) */
  entryReason?: string;
  /** Vùng entry thông minh — entryPrice = entryZone.optimal */
  entryZone?: import('../services/indicators').EntryZone;
  /** SL nằm sau whale wall bảo vệ */
  isSafeSL?: boolean;
  safeSLReason?: string;
  /** R:R tại TP1 so với SL */
  rrRatio?: number;
  /** Plan hợp lệ: R:R ≥ 2, TP1 prob ≥ 45%, maxLoss ≤ tier */
  tradePlanValid?: boolean;
}

export interface TradeJournalEntry {
  id?: string;
  symbol: TradeSymbol;
  direction: TradeDirection;
  entryPrice: number;
  entryTime: number;
  leverage: number;
  size: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
}

export interface IndicatorPsychology {
  consecutiveLosses: number;
  /** Chuỗi thua liên tiếp chỉ tính lệnh đóng trong 24h gần nhất */
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
  dailyLossPercent: number;
  maxDailyLossPercent: number;
}

export interface IndicatorSet {
  price: number;
  rsi: number;
  macdHistogram: number;
  macdHistogram4h: number;
  bollingerPosition: number;
  volumeRatio: number;
  oiDelta: number;
  fundingRate: number;
  longShortRatio: number;
  btcChange24h: number;
  sessionHour: number;
  ema20: number;
  ema50: number;
  sma200: number;
  cvd: {
    slope: 'up' | 'down' | 'flat';
    last: number;
  };
  psychology: IndicatorPsychology;
  /** ATR thực tính trên timeframe phân tích (theo % giá hoặc giá tuyệt đối khi có) */
  atr?: number;
  /** Có dữ liệu đủ cho SMA200 thật không (≥200 bar) — dùng để bypass mandatory L1 khi insufficient */
  hasSma200?: boolean;
}

export interface FullAnalysisInput {
  indicators: IndicatorSet;
  direction: TradeDirection;
  settings: AppSettings;
  whaleWalls?: LiquidityPool[];
  currentPrice?: number;
}

export interface FullAnalysisResult {
  layers: LayerResult[];
  totalScore: number;
  decision: TradeDecision;
  tradePlan: TradePlan | null;
}

// ─── Skipped setup (Phase 1 bổ sung 2 — negative training data) ───────────────

export type SkipReason =
  | 'MANDATORY_FAIL'
  | 'LOW_SCORE'
  | 'BAD_SESSION'
  | 'CVD_DIVERGENCE'
  | 'USER_SKIP'
  | 'PLAN_EXPIRED'
  | 'MULTI_CONFIRMATION_CANCEL';

export interface SkippedSetupEntry {
  id: string;
  timestamp: number;
  symbol: string;
  direction: TradeDirection;
  totalScore: number;
  skipReason: SkipReason;
  skipReasonDetail: string;
  priceAtSkip: number;
  priceAfter2h?: number;
  priceAfter4h?: number;
  hypotheticalPnlPct?: number;
  version: string;
  /** Ẩn khỏi UI, vẫn giữ cho export */
  archived?: boolean;
}

export const BINANCE_BASE_URL = 'https://fapi.binance.com';

// ─────────────────────────────────────────
// SCORING V3 — GROUP SYSTEM
// ─────────────────────────────────────────

export const SCORING_GROUPS_V3 = {
  GROUP_A_TREND: {
    layers: [1, 2, 3, 4] as const,
    rawMax: 8, // 4 layers × max 2đ raw mỗi layer
    groupMax: 5, // quy đổi về 5đ
    minRequired: 2.5, // bắt buộc ≥ 2.5đ sau quy đổi
    description: 'Xu hướng kỹ thuật',
  },
  GROUP_B_FLOW: {
    layers: [5, 6, 7] as const,
    rawMax: 6, // 3 layers × max 2đ raw
    groupMax: 5,
    minRequired: 2.0,
    description: 'Dòng tiền & Thanh khoản',
  },
  GROUP_C_CONTEXT: {
    layers: [8, 9, 10] as const,
    rawMax: 6,
    groupMax: 5,
    minRequired: 2.0,
    description: 'Bối cảnh thị trường',
  },
} as const;

// Hàm quy đổi raw score → group score
// Dùng trong scorer: rawScore / group.rawMax * group.groupMax
export function convertToGroupScore(
  rawScore: number,
  groupKey: keyof typeof SCORING_GROUPS_V3,
): number {
  const group = SCORING_GROUPS_V3[groupKey];
  return Math.min(group.groupMax, (rawScore / group.rawMax) * group.groupMax);
}

// ─────────────────────────────────────────
// SESSION RULES V3 — Chi tiết hơn V2
// ─────────────────────────────────────────

export const SESSION_RULES_V3 = [
  {
    name: 'London Open',
    score: 2,
    start: 8,
    end: 12,
    description: '08-12h VN: London mở, thanh khoản cao nhất',
  },
  {
    name: 'NY Peak',
    score: 2,
    start: 20.5,
    end: 23.5,
    description: '20:30-23:30h VN: NY session, alt coin sôi động',
  },
  {
    name: 'NY Pre-Market / London-NY Overlap',
    score: 1.5,
    start: 15,
    end: 20.5,
    description: '15-20:30h VN: Overlap London-NY, trung bình tốt',
  },
  {
    name: 'London Lunch',
    score: 1,
    start: 12,
    end: 15,
    description: '12-15h VN: London nghỉ trưa, thanh khoản giảm',
  },
  {
    name: 'NY Close',
    score: 1,
    start: 23.5,
    end: 26, // wrap: 23.5-02h (02 = 26 - 24)
    description: '23:30-02h VN: NY đóng cửa, giảm dần',
  },
  {
    name: 'Asia Dead Zone',
    score: 0,
    start: 2,
    end: 8,
    description: '02-08h VN: Thanh khoản thấp nhất, dễ bị quét',
  },
] as const;

// ─────────────────────────────────────────
// PSYCHOLOGY CHECKLIST V3 — 5 mục (update)
// ─────────────────────────────────────────

export const PSYCHOLOGY_CHECKLIST_V3_ITEMS = [
  {
    key: 'alert',
    label: 'Tỉnh táo, đã nghỉ ngơi đủ giấc',
  },
  {
    key: 'chartStudied',
    label: 'Đã xem chart ≥ 5 phút trước khi phân tích',
  },
  {
    key: 'noFomo',
    label: 'Không FOMO, không revenge trade',
  },
  {
    key: 'slTpReady',
    label: 'Đã xác định rõ SL và TP trước khi vào',
  },
  {
    key: 'riskAccepted',
    label: 'Chấp nhận mất tối đa 1.5 USDT lệnh này',
  },
] as const;

export type PsychologyChecklistV3 = Record<
  (typeof PSYCHOLOGY_CHECKLIST_V3_ITEMS)[number]['key'],
  boolean
>;

// ─────────────────────────────────────────
// WIN STREAK THRESHOLDS
// ─────────────────────────────────────────

export const WIN_STREAK_CONFIG = {
  warningThreshold: 4, // ≥ 4 lệnh thắng liên tiếp → cảnh báo
  suggestedSizeReduction: 0.5, // giảm 50% size
} as const;

// ─────────────────────────────────────────
// HARD BLOCK RULES V3
// ─────────────────────────────────────────

export const HARD_BLOCK_RULES_V3 = {
  // Giữ nguyên V2
  BTC_EXTREME_PCT: 8,
  BTC_LONG_BLOCK_PCT: -2,
  BTC_SHORT_BLOCK_PCT: 2,
  FUNDING_LONG_SQUEEZE_PCT: 0.03,
  FUNDING_SHORT_SQUEEZE_PCT: -0.03,
  MAX_CONSECUTIVE_LOSSES: 3,
  MAX_DAILY_LOSS_USDT: 3,
  LOSS_STREAK_LOCK_MINUTES: 180,
  LOSS_STREAK_WINDOW_MS: 24 * 60 * 60 * 1000,
  // Thêm V3
  LS_RATIO_EXTREME_HIGH: 3.0, // ratio > 3 = quá đông Long
  LS_RATIO_EXTREME_LOW: 0.5, // ratio < 0.5 = quá đông Short
  CVD_REVERSAL_THRESHOLD: 200000, // CVD đổi chiều > 200K = thật sự đảo
} as const;

// ─────────────────────────────────────────
// LAYER NAMES V3 (cập nhật tên)
// ─────────────────────────────────────────

export const LAYER_NAMES_V3: Record<number, string> = {
  1: 'Giá & EMA (Slope)',
  2: 'RSI 14 + Divergence',
  3: 'MACD + Histogram Momentum',
  4: 'Bollinger %B + Bandwidth',
  5: 'Volume / OI / CVD',
  6: 'Funding Rate + Trend',
  7: 'L/S Ratio + Whale Wall',
  8: 'BTC 24h + 1H Momentum',
  9: 'Phiên giao dịch',
  10: 'Tâm lý & Kỷ luật',
};

// Storage key mới cho V3 journal
export const STORAGE_KEYS_V3 = {
  SCORING_V3_CACHE: 'gd1_scoring_v3_cache',
} as const;

// ─────────────────────────────────────────
// SCORING V4 — GROUP SYSTEM (L5a/L5b split)
// ─────────────────────────────────────────

/** L5b dùng layerNumber 52 để tách khỏi L5a (CVD) trong bảng điểm */
export const LAYER_L5B_ID = 52;

export const SCORING_GROUPS_V4 = {
  GROUP_A_TREND: {
    layers: [1, 2, 3, 4] as const,
    rawMax: 8,
    groupMax: 5,
    minRequired: 2.5,
    description: 'Xu hướng kỹ thuật',
  },
  GROUP_B_FLOW: {
    layers: [5, LAYER_L5B_ID, 6, 7] as const,
    rawMax: 8, // L5a(2) + L5b(2) + L6(1) + L7(2)
    groupMax: 5,
    minRequired: 2.0,
    description: 'Dòng tiền & Thanh khoản',
  },
  GROUP_C_CONTEXT: {
    layers: [8, 9, 10] as const,
    rawMax: 6,
    groupMax: 5,
    minRequired: 2.0,
    description: 'Bối cảnh thị trường',
  },
} as const;

export function convertToGroupScoreV4(
  rawScore: number,
  groupKey: keyof typeof SCORING_GROUPS_V4,
): number {
  const group = SCORING_GROUPS_V4[groupKey];
  return Math.min(group.groupMax, (rawScore / group.rawMax) * group.groupMax);
}

export const HARD_BLOCK_RULES_V4 = {
  BTC_EXTREME_PCT: 8,
  BTC_LONG_BLOCK_PCT: -2,
  BTC_SHORT_BLOCK_PCT: 2,
  FUNDING_LONG_SQUEEZE_PCT: 0.03,
  FUNDING_SHORT_SQUEEZE_PCT: -0.03,
  MAX_CONSECUTIVE_LOSSES: 3,
  MAX_DAILY_LOSS_USDT: 3,
  LOSS_STREAK_LOCK_MINUTES: 180,
  LOSS_STREAK_WINDOW_MS: 24 * 60 * 60 * 1000,
  LS_RATIO_EXTREME_HIGH: 3.0,
  LS_RATIO_EXTREME_LOW: 0.5,
  CVD_LONG_HARD_BLOCK: -2_000_000,
  CVD_SHORT_HARD_BLOCK: 2_000_000,
  CVD_MILD_NEGATIVE: -500_000,
  CVD_MILD_POSITIVE: 500_000,
  CVD_STEEP_SLOPE_DELTA: 200_000,
} as const;

export const LAYER_NAMES_V4: Record<number, string> = {
  1: 'Giá & EMA (Slope)',
  2: 'RSI 14 + Divergence',
  3: 'MACD + Histogram Momentum',
  4: 'Bollinger %B + Bandwidth',
  5: 'L5a — CVD Strength',
  [LAYER_L5B_ID]: 'L5b — Volume / OI',
  6: 'Funding Rate + Trend',
  7: 'L/S Ratio + Whale Wall',
  8: 'BTC 24h + 1H Momentum',
  9: 'Phiên giao dịch',
  10: 'Tâm lý & Kỷ luật',
};

export const DECISION_LABELS_V4 = {
  KHONG_VAO: { label: 'KHÔNG VÀO', color: '#F6465D', winrate: '~50%' },
  CHO_THEM: { label: 'CHỜ THÊM', color: '#F0B90B', winrate: '~55%' },
  CHO_TAI_CHAM: {
    label: 'CHỜ TÁI CHẤM',
    color: '#848E9C',
    winrate: '—',
  },
  CO_THE_VAO: { label: 'CÓ THỂ VÀO', color: '#F0B90B', winrate: '~65%' },
  VAO_TU_TIN: { label: 'VÀO TỰ TIN', color: '#0ECB81', winrate: '~70-75%' },
  SETUP_NGON: { label: 'SETUP NGON 🔥', color: '#0ECB81', winrate: '~80%+' },
} as const;

export type DecisionTypeV4 = keyof typeof DECISION_LABELS_V4;

export const STORAGE_KEYS_V4 = {
  SCORING_V4_CACHE: 'gd1_scoring_v4_cache',
} as const;

// ─────────────────────────────────────────
// SCORING V4 — FUNDING STATE (L6 nâng cao)
// ─────────────────────────────────────────

/** Ngưỡng phân loại funding — đơn vị % (0.01 = 0.01%). */
export const FUNDING_STATE_THRESHOLDS = {
  EXTREME_LONG_CURRENT_PCT: 0.01,
  LONG_FADING_CURRENT_PCT: 0.005,
  LONG_FUNDING_ELEVATED_MAX_PCT: 0.01,
  NEUTRAL_CURRENT_ABS_PCT: 0.005,
  NEUTRAL_VELOCITY_ABS_PCT: 0.002,
  SHORT_FADING_CURRENT_PCT: -0.005,
} as const;

export enum FundingState {
  EXTREME_LONG_EUPHORIA = 'EXTREME_LONG_EUPHORIA',
  LONG_EUPHORIA_FADING = 'LONG_EUPHORIA_FADING',
  LONG_FUNDING_ELEVATED = 'LONG_FUNDING_ELEVATED',
  NEUTRAL = 'NEUTRAL',
  SHORT_EUPHORIA_FADING = 'SHORT_EUPHORIA_FADING',
  SHORT_SQUEEZE_BUILDING = 'SHORT_SQUEEZE_BUILDING',
}

export interface FundingStateLabel {
  icon: string;
  text: string;
}

const FUNDING_STATE_LABELS: Record<FundingState, FundingStateLabel> = {
  [FundingState.EXTREME_LONG_EUPHORIA]: {
    icon: '🔥',
    text: 'Long quá hưng phấn',
  },
  [FundingState.LONG_EUPHORIA_FADING]: {
    icon: '📉',
    text: 'Long đang hạ nhiệt',
  },
  [FundingState.LONG_FUNDING_ELEVATED]: {
    icon: '📊',
    text: 'Funding dương vừa phải',
  },
  [FundingState.NEUTRAL]: {
    icon: '➡️',
    text: 'Thị trường cân bằng',
  },
  [FundingState.SHORT_EUPHORIA_FADING]: {
    icon: '📈',
    text: 'Short đang hạ nhiệt',
  },
  [FundingState.SHORT_SQUEEZE_BUILDING]: {
    icon: '⚡',
    text: 'Short đang bị ép mạnh',
  },
};

/**
 * Phân loại trạng thái funding từ metrics (đơn vị %).
 * `fundingAcceleration` giữ cho phase scoring sau — chưa dùng ở phase này.
 */
export function classifyFundingState(
  fundingCurrent: number,
  fundingVelocity: number,
  _fundingAcceleration: number,
): FundingState {
  const t = FUNDING_STATE_THRESHOLDS;

  if (fundingCurrent > t.EXTREME_LONG_CURRENT_PCT && fundingVelocity > 0) {
    return FundingState.EXTREME_LONG_EUPHORIA;
  }

  if (fundingCurrent > t.LONG_FADING_CURRENT_PCT && fundingVelocity < 0) {
    return FundingState.LONG_EUPHORIA_FADING;
  }

  if (
    fundingCurrent > t.LONG_FADING_CURRENT_PCT &&
    fundingCurrent <= t.LONG_FUNDING_ELEVATED_MAX_PCT &&
    fundingVelocity >= 0
  ) {
    return FundingState.LONG_FUNDING_ELEVATED;
  }

  if (
    Math.abs(fundingCurrent) <= t.NEUTRAL_CURRENT_ABS_PCT &&
    Math.abs(fundingVelocity) <= t.NEUTRAL_VELOCITY_ABS_PCT
  ) {
    return FundingState.NEUTRAL;
  }

  if (fundingCurrent < t.SHORT_FADING_CURRENT_PCT && fundingVelocity > 0) {
    return FundingState.SHORT_EUPHORIA_FADING;
  }

  if (fundingCurrent < t.SHORT_FADING_CURRENT_PCT && fundingVelocity < 0) {
    return FundingState.SHORT_SQUEEZE_BUILDING;
  }

  return FundingState.NEUTRAL;
}

export function getFundingStateLabel(state: FundingState): FundingStateLabel {
  return FUNDING_STATE_LABELS[state];
}

// ─────────────────────────────────────────
// TRADE PLAN V3 CONFIG
// ─────────────────────────────────────────

export const TRADE_PLAN_V3_CONFIG = {
  // ── ATR MULTIPLIERS theo Score ──
  // Score thấp → SL rộng hơn (tránh bị quét)
  // Score cao → SL chặt hơn (R:R tốt hơn)
  ATR_SL_MULTIPLIER: {
    SETUP_NGON: 1.5, // score ≥ 11.5 → SL = 1.5×ATR
    VAO_TU_TIN: 2.0, // score 10-11.5 → SL = 2×ATR
    CO_THE_VAO: 2.5, // score 9-10 → SL = 2.5×ATR
    CHO_THEM: 3.0, // không vào nhưng hiển thị để tham khảo
  } as const,

  // ── R:R TARGETS theo Score ──
  // Score cao → được phép target xa hơn
  RR_TARGETS: {
    SETUP_NGON: { tp1: 2.0, tp2: 3.5, tp3: 5.0 },
    VAO_TU_TIN: { tp1: 2.0, tp2: 3.0, tp3: 4.5 },
    CO_THE_VAO: { tp1: 2.0, tp2: 2.5, tp3: 3.5 },
    CHO_THEM: { tp1: 2.0, tp2: 2.5, tp3: 3.0 },
  } as const,

  // ── ENTRY ZONE AGGRESSIVENESS theo Score ──
  // Score cao → có thể entry ngay (market order / limit gần)
  // Score thấp → phải chờ pullback sâu hơn
  ENTRY_PATIENCE: {
    SETUP_NGON: 0.2, // chờ pullback 0.2% từ giá hiện tại
    VAO_TU_TIN: 0.4, // chờ pullback 0.4%
    CO_THE_VAO: 0.6, // chờ pullback 0.6%
    CHO_THEM: 1.0, // chờ pullback 1%+
  } as const,

  // ── MARKET MODE ADJUSTMENTS ──
  MARKET_MODE_FACTOR: {
    TRENDING: {
      slFactor: 0.9, // SL chặt hơn 10% trong trending (momentum rõ)
      tpFactor: 1.2, // TP xa hơn 20% (có thể chạy dài)
    },
    RANGING: {
      slFactor: 1.1, // SL rộng hơn 10% trong ranging (nhiều nhiễu)
      tpFactor: 0.8, // TP gần hơn 20% (nhanh chốt trước khi đảo)
    },
  } as const,

  // ── GROUP SCORE ADJUSTMENTS ──
  // Nhóm nào mạnh → điều chỉnh entry/TP theo nhóm đó
  GROUP_B_FLOW_BOOST_THRESHOLD: 4.0, // Group B ≥ 4đ = dòng tiền rất mạnh
  GROUP_B_FLOW_TP_BONUS: 0.3, // bonus +0.3 cho R:R targets khi Group B mạnh

  // ── POSITION SIZING ──
  BASE_SIZE_USDT: 6,
  MAX_SIZE_PCT_OF_ACCOUNT: 0.2,
  LEVERAGE: 5,
  MAX_LOSS_USDT: 1.5,

  // ── QUALITY THRESHOLDS ──
  MIN_RR_TO_ENTER: 2.0,
  MIN_WIN_PROBABILITY_TO_ENTER: 0.65,
} as const;

/** Bucket điểm ↔ winrate kỳ vọng thiết kế — dùng dashboard hiệu suất thực tế */
export const WINRATE_EXPECTED_BY_BUCKET = [
  {
    id: '8-9',
    label: '8–9',
    decisionHint: 'CHỜ THÊM',
    min: 8,
    max: 9,
    expectedWinratePct: 55,
    expectedLabel: '~55%',
  },
  {
    id: '9-10',
    label: '9–10',
    decisionHint: 'CÓ THỂ VÀO',
    min: 9,
    max: 10,
    expectedWinratePct: 65,
    expectedLabel: '~65%',
  },
  {
    id: '10-11.5',
    label: '10–11.5',
    decisionHint: 'VÀO TỰ TIN',
    min: 10,
    max: 11.5,
    expectedWinratePct: 72.5,
    expectedLabel: '~70-75%',
  },
  {
    id: '11.5+',
    label: '≥11.5',
    decisionHint: 'SETUP NGON',
    min: 11.5,
    max: Infinity,
    expectedWinratePct: 80,
    expectedLabel: '~80%+',
  },
] as const;

export type WinrateBucketId = (typeof WINRATE_EXPECTED_BY_BUCKET)[number]['id'];

export const WINRATE_SAMPLE_WARN_MIN = 10;
export const WINRATE_SAMPLE_MEANINGFUL_MIN = 25;

/** Trade Plan V4 — điều chỉnh SL theo nguồn điểm mạnh (L5a vs Group A) */
export const TRADE_PLAN_V4_CONFIG = {
  /** Giảm multiplier khi setup CVD-dominant */
  CVD_SL_TIGHTEN: 0.3,
  /** Group A vừa đủ ngưỡng tối thiểu (≤ min + buffer) */
  GROUP_A_NEAR_MIN_MAX: 2.8,
  /** Group A mạnh — trend kỹ thuật dẫn dắt */
  GROUP_A_STRONG_MIN: 4.5,
  /** L5a raw ≥ ngưỡng này = CVD mạnh */
  L5A_STRONG_RAW_MIN: 1.5,
  /** L5a raw ≤ ngưỡng này = CVD chỉ đạt tối thiểu */
  L5A_WEAK_RAW_MAX: 1.25,
} as const;

// ─────────────────────────────────────────
// TRADE PLAN V3 TYPES
// ─────────────────────────────────────────

export type EntryQuality =
  | 'PERFECT' // giá đúng vùng entry tối ưu
  | 'GOOD' // giá trong vùng hợp lệ
  | 'ACCEPTABLE' // giá chấp nhận được, R:R vẫn đủ
  | 'RISKY' // giá đã xa vùng tối ưu, cân nhắc bỏ qua
  | 'MISS'; // giá quá xa, không nên vào

export type SLType =
  | 'ATR_BASED' // dựa trên ATR × multiplier
  | 'STRUCTURE_BASED' // dựa trên mức hỗ trợ/kháng cự
  | 'WHALE_PROTECTED' // sau Whale Wall
  | 'EMA_BASED'; // dưới/trên EMA quan trọng

export type TPType =
  | 'RR_BASED' // thuần R:R
  | 'STRUCTURE_TARGET' // đến mức kháng cự/hỗ trợ quan trọng
  | 'EMA_TARGET'; // đến đường EMA tiếp theo

export type EntryBufferSource = 'MIN_FLOOR' | 'ATR_BASED' | 'ATR_CAPPED';

export interface EntryZoneV3 {
  optimal: number; // giá limit lý tưởng
  aggressive: number; // giá entry nếu muốn vào ngay
  conservative: number; // giá entry nếu muốn chờ sâu hơn
  rangeLow: number;
  rangeHigh: number;
  quality: EntryQuality;
  distanceFromCurrentPct: number;
  reasoning: string;
  entryType: 'LIMIT_WAIT' | 'LIMIT_NEAR' | 'MARKET_OK';
  /** Buffer thực tế dùng cho entry S/R (USDT) */
  entryBufferUsed?: number;
  entryBufferSource?: EntryBufferSource;
  /** % buffer so với giá hiện tại khi tính plan */
  entryBufferPct?: number;
}

export interface StopLossV3 {
  price: number;
  type: SLType;
  atrDistance: number; // SL cách entry bao nhiêu × ATR
  distancePct: number; // % từ entry đến SL
  maxLossUSDT: number; // lỗ tối đa nếu chạm SL (thực tế hoặc sau cap tier)
  /** Giới hạn max loss theo tier vốn hiện tại */
  tierMaxLossPerTrade?: number;
  tierName?: string;
  /** SL đã thu hẹp vì vượt giới hạn tier */
  slAdjustedForTier?: boolean;
  isProtectedByWall: boolean;
  wallPrice?: number;
  reasoning: string;
  quality: 'TIGHT' | 'NORMAL' | 'WIDE';
  /** Multiplier ATR đã cấu hình (trước structure override) — V4 */
  targetAtrMultiplier?: number;
  /** Ghi chú điều chỉnh multiplier — V4 */
  slMultiplierNote?: string;
}

export interface TakeProfitLevel {
  price: number;
  rrRatio: number;
  type: TPType;
  sizeToClose: number; // % vị thế đóng tại TP này (0-1)
  expectedPnlUSDT: number;
  reasoning: string;
  probability: number; // xác suất chạm được TP này (0-1)
}

export interface TradePlanV3 {
  // Metadata
  symbol: string;
  direction: 'LONG' | 'SHORT';
  generatedAt: number;
  totalScore: number;
  decision: string;
  marketMode: 'TRENDING' | 'RANGING';
  groupScores: { A: number; B: number; C: number };

  // Entry
  entryZone: EntryZoneV3;
  recommendedEntry: number; // = entryZone.optimal
  /** Buffer entry S/R thực tế (USDT) — mirror entryZone khi có */
  entryBufferUsed?: number;
  entryBufferSource?: EntryBufferSource;
  entryBufferPct?: number;

  // Stop Loss
  stopLoss: StopLossV3;

  // Take Profits (3 levels)
  tp1: TakeProfitLevel;
  tp2: TakeProfitLevel;
  tp3: TakeProfitLevel;

  // Position
  positionSize: number; // USDT margin
  positionSizeAdjusted: number; // sau khi điều chỉnh theo ATR SL
  notionalValue: number; // positionSize × leverage

  // Risk metrics
  primaryRR: number; // R:R đến TP1
  expectedValueUSDT: number; // EV = (prob_win × profit) - (prob_loss × loss)
  winProbabilityEstimate: number;
  riskRewardScore: number; // composite score 0-100

  // Validation
  isValid: boolean;
  /** false khi TP1 xác suất < TP_MIN_PROBABILITY — dùng FinalEntryStatus */
  tradePlanValid: boolean;
  /** Cảnh báo đỏ khi TP1 quá thấp */
  tp1LowProbabilityWarning?: string | null;
  warnings: string[];
  blockReasons: string[];

  /** Tier vốn dùng khi sizing — hiển thị tooltip Max Loss */
  capitalTierName?: string;

  /** Thời hạn plan theo score — chỉ khi plan hợp lệ */
  expiryHours?: number;
  expiryTier?: 'LOW' | 'MEDIUM' | 'HIGH';
  expiresAt?: string;

  /** Sức khỏe plan khi có lệnh chờ — cập nhật mỗi lần scan */
  planHealth?: import('../types/tradePlan').PlanHealth;
}

export { FinalEntryStatus } from '../types/scoring';

/** Ngưỡng ADX — dùng bởi getADXAnalysis / adxGate (tham chiếu UI & docs). */
export const ADX_THRESHOLDS = {
  CHOPPY: 15,
  RANGING_MAX: 25,
  TRENDING_STRONG: 35,
} as const;
