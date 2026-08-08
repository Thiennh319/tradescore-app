import type { AppTradeSymbol } from './scoring';



export interface WhaleSymbolConfig {

  minNotionalUSD: number;

  minAgeSeconds: number;

  minExecutedRatio: number;

  maxRefreshCount: number;

  maxDistanceATR: number;

}



/** Cấu hình Radar Cá Mập theo từng symbol. */

export const WHALE_SYMBOL_CONFIG: Record<AppTradeSymbol, WhaleSymbolConfig> = {

  BTCUSDT: {

    minNotionalUSD: 5_000_000,

    minAgeSeconds: 180,

    minExecutedRatio: 0.1,

    maxRefreshCount: 2,

    maxDistanceATR: 0.3,

  },

  BNBUSDT: {

    minNotionalUSD: 2_000_000,

    minAgeSeconds: 150,

    minExecutedRatio: 0.1,

    maxRefreshCount: 3,

    maxDistanceATR: 0.35,

  },

  SOLUSDT: {

    minNotionalUSD: 800_000,

    minAgeSeconds: 120,

    minExecutedRatio: 0.08,

    maxRefreshCount: 3,

    maxDistanceATR: 0.4,

  },

  NEARUSDT: {

    minNotionalUSD: 400_000,

    minAgeSeconds: 120,

    minExecutedRatio: 0.08,

    maxRefreshCount: 3,

    maxDistanceATR: 0.5,

  },

  XRPUSDT: {

    minNotionalUSD: 500_000,

    minAgeSeconds: 120,

    minExecutedRatio: 0.08,

    maxRefreshCount: 3,

    maxDistanceATR: 0.45,

  },

};



/** Chu kỳ quét Radar Cá Mập — 5 phút. */

export const WHALE_RADAR_INTERVAL_MS = 5 * 60 * 1000;

export const WHALE_RADAR_INTERVAL_MINUTES = 5;



/** Ngưỡng notional tối thiểu (USDT) — derived từ WHALE_SYMBOL_CONFIG (tương thích ngược). */

export const WHALE_MIN_NOTIONAL_USD: Record<AppTradeSymbol, number> = {

  BTCUSDT: WHALE_SYMBOL_CONFIG.BTCUSDT.minNotionalUSD,

  NEARUSDT: WHALE_SYMBOL_CONFIG.NEARUSDT.minNotionalUSD,

  SOLUSDT: WHALE_SYMBOL_CONFIG.SOLUSDT.minNotionalUSD,

  BNBUSDT: WHALE_SYMBOL_CONFIG.BNBUSDT.minNotionalUSD,

  XRPUSDT: WHALE_SYMBOL_CONFIG.XRPUSDT.minNotionalUSD,

};



/** Sức mạnh tường tối thiểu (× trung bình sổ lệnh). */

export const WHALE_MIN_STRENGTH = 37.5;



/** Giảm >70% hoặc biến mất = coi là gỡ lệnh. */

export const WHALE_PULL_RATIO = 0.3;



/** Khoảng cách giá tới tường (%) để nghi spoofing khi gỡ. */

export const WHALE_SPOOF_PROXIMITY_PCT = 0.5;

/** Tường quá sát giá hiện tại (< min) = market hugging — bỏ qua. */
export const WHALE_MIN_DISTANCE_ATR = 0.1;

/** Whale wall "gần" cho L7 confirmation — thay distancePct <= 2%. */
export const WHALE_NEARBY_MAX_DISTANCE_ATR = 0.5;



export const WHALE_RADAR_SYMBOLS: AppTradeSymbol[] = [

  'BTCUSDT',

  'NEARUSDT',

  'SOLUSDT',

  'BNBUSDT',

];

