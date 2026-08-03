/**
 * V4.1 Task 2.1 — Market Context Filter (Anti-Noise Confirmation Layer).
 * Không phải engine mới — lớp xác nhận sau Trend Reversal ACTIVE.
 * Chỉ hạ ACTIVE → WATCH khi context phủ định; không sinh entry/SL/TP.
 */

import { buildBTCContext, type BTCContext } from './btcContextBuilder';
import type { KlineV41 } from './indicators';
import { computeVolatilityRisk } from './protectionLayer';
import type {
  ComputeTrendReversalParams,
  TrendReversalResult,
} from './reversalDetector';
import { computeTrendReversal } from './reversalDetector';
import type { TrendDirection } from './types';

const FUNDING_EXTREME_THRESHOLD = 0.0003; // ±0.03% — đồng bộ exhaustionEngine
const OI_BUILDUP_PCT = 1.5;
const OI_DECLINE_PCT = -1.5;
const BTC_STRONG_THRESHOLD = 75;

export type WhaleMarketSignal =
  | 'WALL'
  | 'ABSORPTION'
  | 'DISTRIBUTION'
  | 'ACCUMULATION'
  | 'NONE';

export interface WhaleContextInput {
  signal?: WhaleMarketSignal;
  /** Whale wall / absorption chặn hướng đảo chiều kỳ vọng. */
  blocksReversal?: boolean;
}

export interface MarketContextFilterParams {
  trendDirection: TrendDirection;
  /** BTC context có sẵn — nếu thiếu sẽ build từ btcKlines4H. */
  btcContext?: BTCContext;
  btcKlines4H?: KlineV41[];
  fundingRate?: number;
  /** % thay đổi OI gần nhất. */
  oiDeltaPct?: number;
  /** % thay đổi giá gần nhất (cùng khung với OI). */
  priceChangePct?: number;
  whale?: WhaleContextInput;
  /** Klines 4H cho volatility context (protectionLayer ATR). */
  klines4H?: KlineV41[];
}

export interface MarketContextDimensionResult {
  id: 'btc' | 'funding' | 'oi' | 'whale' | 'volatility';
  pass: boolean;
  title: string;
  description: string;
  skipped?: boolean;
}

export interface MarketContextFilterResult {
  pass: boolean;
  applied: boolean;
  dimensions: {
    btc: MarketContextDimensionResult;
    funding: MarketContextDimensionResult;
    oi: MarketContextDimensionResult;
    whale: MarketContextDimensionResult;
    volatility: MarketContextDimensionResult;
  };
  failedDimensions: MarketContextDimensionResult['id'][];
}

export type TrendReversalWithContextResult = TrendReversalResult & {
  marketContext?: MarketContextFilterResult;
  /** State trước khi áp context (chỉ set khi context được áp). */
  preContextState?: TrendReversalResult['state'];
  /** Alt trend từ pipeline — Confidence/Decision đọc qua envelope. */
  trendDirection?: TrendDirection;
};

function resolveBtcContext(params: MarketContextFilterParams): BTCContext {
  if (params.btcContext) return params.btcContext;
  if (params.btcKlines4H && params.btcKlines4H.length > 0) {
    return buildBTCContext(params.btcKlines4H);
  }
  return {
    btcTrendStrength: 50,
    btcDirection: 'NEUTRAL',
    btcStrengthBand: 'none',
    btcAlignmentFactor: 0.75,
  };
}

/** 1. BTC Context — dump/pump/sideway vs hướng đảo chiều kỳ vọng. */
export function evaluateBtcMarketContext(
  btc: BTCContext,
  trendDirection: TrendDirection,
): MarketContextDimensionResult {
  const base: Omit<MarketContextDimensionResult, 'pass' | 'title' | 'description'> = {
    id: 'btc',
  };

  if (trendDirection === 'NEUTRAL') {
    return {
      ...base,
      pass: true,
      skipped: true,
      title: 'BTC — không áp dụng (NEUTRAL)',
      description: 'Alt trend NEUTRAL — bỏ qua BTC context',
    };
  }

  const strong =
    btc.btcStrengthBand === 'strong' || btc.btcTrendStrength >= BTC_STRONG_THRESHOLD;
  const moderateUp =
    btc.btcDirection === 'BULL' &&
    (btc.btcStrengthBand === 'moderate' || btc.btcStrengthBand === 'strong');
  const moderateDown =
    btc.btcDirection === 'BEAR' &&
    (btc.btcStrengthBand === 'moderate' || btc.btcStrengthBand === 'strong');

  if (trendDirection === 'BULL') {
    if (btc.btcDirection === 'BULL' && strong) {
      return {
        ...base,
        pass: false,
        title: 'BTC pump mạnh — phủ định đảo bearish',
        description: `BTC BULL strength ${Math.round(btc.btcTrendStrength)} — pump bất thường chặn đảo chiều`,
      };
    }
    if (btc.btcDirection === 'BEAR' && moderateDown) {
      return {
        ...base,
        pass: true,
        title: 'BTC đồng thuận xu hướng giảm',
        description: `BTC BEAR strength ${Math.round(btc.btcTrendStrength)} — hỗ trợ đảo bearish`,
      };
    }
    if (btc.btcDirection === 'NEUTRAL' || btc.btcStrengthBand === 'weak' || btc.btcStrengthBand === 'none') {
      return {
        ...base,
        pass: true,
        title: 'BTC sideway — không chặn đảo bearish',
        description: 'BTC NEUTRAL/weak — không phủ định tín hiệu',
      };
    }
    if (btc.btcDirection === 'BULL' && moderateUp) {
      return {
        ...base,
        pass: false,
        title: 'BTC pump — phủ định đảo bearish',
        description: `BTC BULL moderate — chưa đồng thuận đảo chiều`,
      };
    }
    return {
      ...base,
      pass: true,
      title: 'BTC đồng thuận xu hướng',
      description: `BTC ${btc.btcDirection} band ${btc.btcStrengthBand}`,
    };
  }

  if (btc.btcDirection === 'BEAR' && strong) {
    return {
      ...base,
      pass: false,
      title: 'BTC dump mạnh — phủ định đảo bullish',
      description: `BTC BEAR strength ${Math.round(btc.btcTrendStrength)} — dump mạnh chặn đảo chiều`,
    };
  }
  if (btc.btcDirection === 'BULL' && moderateUp) {
    return {
      ...base,
      pass: true,
      title: 'BTC đồng thuận xu hướng tăng',
      description: `BTC BULL strength ${Math.round(btc.btcTrendStrength)} — hỗ trợ đảo bullish`,
    };
  }
  if (btc.btcDirection === 'NEUTRAL' || btc.btcStrengthBand === 'weak' || btc.btcStrengthBand === 'none') {
    return {
      ...base,
      pass: true,
      title: 'BTC sideway — không chặn đảo bullish',
      description: 'BTC NEUTRAL/weak — không phủ định tín hiệu',
    };
  }
  if (btc.btcDirection === 'BEAR' && moderateDown) {
    return {
      ...base,
      pass: false,
      title: 'BTC dump — phủ định đảo bullish',
      description: `BTC BEAR moderate — chưa đồng thuận đảo chiều`,
    };
  }
  return {
    ...base,
    pass: true,
    title: 'BTC đồng thuận xu hướng',
    description: `BTC ${btc.btcDirection} band ${btc.btcStrengthBand}`,
  };
}

/** 2. Funding — cực đoan / trái hướng / squeeze. */
export function evaluateFundingMarketContext(
  fundingRate: number | undefined,
  trendDirection: TrendDirection,
): MarketContextDimensionResult {
  const base: Omit<MarketContextDimensionResult, 'pass' | 'title' | 'description'> = {
    id: 'funding',
  };

  if (fundingRate == null || !Number.isFinite(fundingRate)) {
    return {
      ...base,
      pass: true,
      skipped: true,
      title: 'Funding trung tính — không có dữ liệu',
      description: 'Funding rate không khả dụng — không chặn ACTIVE',
    };
  }

  const pct = (fundingRate * 100).toFixed(3);

  if (trendDirection === 'BULL') {
    if (fundingRate <= -FUNDING_EXTREME_THRESHOLD) {
      return {
        ...base,
        pass: false,
        title: 'Funding squeeze âm — bất lợi đảo bearish',
        description: `Funding ${pct}% — short squeeze risk`,
      };
    }
    if (fundingRate >= FUNDING_EXTREME_THRESHOLD) {
      return {
        ...base,
        pass: true,
        title: 'Funding dương cực đoan — long crowded',
        description: `Funding ${pct}% — xác nhận áp lực long`,
      };
    }
    return {
      ...base,
      pass: true,
      title: 'Funding trung tính',
      description: `Funding ${pct}% — trong vùng trung tính`,
    };
  }

  if (trendDirection === 'BEAR') {
    if (fundingRate >= FUNDING_EXTREME_THRESHOLD) {
      return {
        ...base,
        pass: false,
        title: 'Funding dương cực đoan — bất lợi đảo bullish',
        description: `Funding ${pct}% — long squeeze risk cho đảo bullish`,
      };
    }
    if (fundingRate <= -FUNDING_EXTREME_THRESHOLD) {
      return {
        ...base,
        pass: true,
        title: 'Funding âm cực đoan — short crowded',
        description: `Funding ${pct}% — xác nhận áp lực short`,
      };
    }
    return {
      ...base,
      pass: true,
      title: 'Funding trung tính',
      description: `Funding ${pct}% — trong vùng trung tính`,
    };
  }

  return {
    ...base,
    pass: true,
    skipped: true,
    title: 'Funding — không áp dụng',
    description: 'NEUTRAL trend',
  };
}

/** 3. Open Interest — buildup / decline / divergence / squeeze. */
export function evaluateOiMarketContext(
  oiDeltaPct: number | undefined,
  priceChangePct: number | undefined,
  trendDirection: TrendDirection,
): MarketContextDimensionResult {
  const base: Omit<MarketContextDimensionResult, 'pass' | 'title' | 'description'> = {
    id: 'oi',
  };

  if (oiDeltaPct == null || !Number.isFinite(oiDeltaPct)) {
    return {
      ...base,
      pass: true,
      skipped: true,
      title: 'OI — không có dữ liệu',
      description: 'Open Interest không khả dụng — không chặn ACTIVE',
    };
  }

  const price = priceChangePct ?? 0;

  if (trendDirection === 'BULL') {
    if (oiDeltaPct >= OI_BUILDUP_PCT && price > 0.5) {
      return {
        ...base,
        pass: false,
        title: 'OI tăng cùng giá — không xác nhận đảo bearish',
        description: `ΔOI ${oiDeltaPct.toFixed(1)}% với giá +${price.toFixed(1)}% — continuation`,
      };
    }
    if (oiDeltaPct <= OI_DECLINE_PCT) {
      return {
        ...base,
        pass: true,
        title: 'OI giảm — deleveraging xác nhận',
        description: `ΔOI ${oiDeltaPct.toFixed(1)}% — dòng tiền rút`,
      };
    }
    if (oiDeltaPct >= OI_BUILDUP_PCT && price < -0.5) {
      return {
        ...base,
        pass: true,
        title: 'OI divergence — trapped longs',
        description: `ΔOI +${oiDeltaPct.toFixed(1)}% nhưng giá ${price.toFixed(1)}%`,
      };
    }
    if (oiDeltaPct <= -3 && price > 1) {
      return {
        ...base,
        pass: false,
        title: 'OI squeeze — không xác nhận',
        description: 'OI giảm mạnh trong pump — squeeze ngược hướng đảo',
      };
    }
    return {
      ...base,
      pass: true,
      title: 'OI xác nhận dòng tiền',
      description: `ΔOI ${oiDeltaPct.toFixed(1)}%`,
    };
  }

  if (trendDirection === 'BEAR') {
    if (oiDeltaPct >= OI_BUILDUP_PCT && price < -0.5) {
      return {
        ...base,
        pass: false,
        title: 'OI tăng cùng giá giảm — không xác nhận đảo bullish',
        description: `ΔOI ${oiDeltaPct.toFixed(1)}% với giá ${price.toFixed(1)}%`,
      };
    }
    if (oiDeltaPct <= OI_DECLINE_PCT) {
      return {
        ...base,
        pass: true,
        title: 'OI giảm — deleveraging xác nhận',
        description: `ΔOI ${oiDeltaPct.toFixed(1)}%`,
      };
    }
    if (oiDeltaPct >= OI_BUILDUP_PCT && price > 0.5) {
      return {
        ...base,
        pass: true,
        title: 'OI divergence — short covering',
        description: `ΔOI +${oiDeltaPct.toFixed(1)}% với giá +${price.toFixed(1)}%`,
      };
    }
    if (oiDeltaPct <= -3 && price < -1) {
      return {
        ...base,
        pass: false,
        title: 'OI squeeze — không xác nhận',
        description: 'OI giảm mạnh trong dump — squeeze ngược hướng đảo',
      };
    }
    return {
      ...base,
      pass: true,
      title: 'OI xác nhận dòng tiền',
      description: `ΔOI ${oiDeltaPct.toFixed(1)}%`,
    };
  }

  return {
    ...base,
    pass: true,
    skipped: true,
    title: 'OI — không áp dụng',
    description: 'NEUTRAL trend',
  };
}

/** 4. Whale — wall / absorption / distribution / accumulation. */
export function evaluateWhaleMarketContext(
  whale: WhaleContextInput | undefined,
  trendDirection: TrendDirection,
): MarketContextDimensionResult {
  const base: Omit<MarketContextDimensionResult, 'pass' | 'title' | 'description'> = {
    id: 'whale',
  };

  const signal = whale?.signal ?? 'NONE';
  const blocks = whale?.blocksReversal === true;

  if (trendDirection === 'BULL') {
    if (signal === 'DISTRIBUTION') {
      return {
        ...base,
        pass: true,
        title: 'Whale Distribution — xác nhận đảo bearish',
        description: 'Whale phân phối — đồng thuận đảo chiều',
      };
    }
    if (signal === 'ACCUMULATION') {
      return {
        ...base,
        pass: false,
        title: 'Whale Accumulation — phủ định đảo bearish',
        description: 'Whale tích lũy — chưa đồng thuận đảo chiều',
      };
    }
    if (signal === 'ABSORPTION' && blocks) {
      return {
        ...base,
        pass: false,
        title: 'Whale Absorption — hấp thụ áp lực bán',
        description: 'Whale hấp thụ — phủ định đảo bearish',
      };
    }
    if (signal === 'WALL' && blocks) {
      return {
        ...base,
        pass: false,
        title: 'Whale Wall — chặn đảo bearish',
        description: 'Whale wall gần giá — phủ định đảo chiều',
      };
    }
    if (signal === 'WALL') {
      return {
        ...base,
        pass: true,
        title: 'Whale Wall — không chặn hướng đảo',
        description: 'Whale wall không chặn đảo bearish',
      };
    }
    return {
      ...base,
      pass: true,
      skipped: signal === 'NONE',
      title: 'Whale không phủ định',
      description: signal === 'NONE' ? 'Không có tín hiệu whale' : `Whale ${signal} — không chặn`,
    };
  }

  if (trendDirection === 'BEAR') {
    if (signal === 'ACCUMULATION') {
      return {
        ...base,
        pass: true,
        title: 'Whale Accumulation — xác nhận đảo bullish',
        description: 'Whale tích lũy — đồng thuận đảo chiều',
      };
    }
    if (signal === 'DISTRIBUTION') {
      return {
        ...base,
        pass: false,
        title: 'Whale Distribution — phủ định đảo bullish',
        description: 'Whale phân phối — chưa đồng thuận đảo chiều',
      };
    }
    if (signal === 'ABSORPTION' && blocks) {
      return {
        ...base,
        pass: false,
        title: 'Whale Absorption — hấp thụ áp lực mua',
        description: 'Whale hấp thụ — phủ định đảo bullish',
      };
    }
    if (signal === 'WALL' && blocks) {
      return {
        ...base,
        pass: false,
        title: 'Whale Wall — chặn đảo bullish',
        description: 'Whale wall gần giá — phủ định đảo chiều',
      };
    }
    return {
      ...base,
      pass: true,
      skipped: signal === 'NONE',
      title: 'Whale không phủ định',
      description: signal === 'NONE' ? 'Không có tín hiệu whale' : `Whale ${signal} — không chặn`,
    };
  }

  return {
    ...base,
    pass: true,
    skipped: true,
    title: 'Whale — không áp dụng',
    description: 'NEUTRAL trend',
  };
}

/** 5. Volatility — quá thấp / quá cao. */
export function evaluateVolatilityMarketContext(
  klines4H: KlineV41[] | undefined,
): MarketContextDimensionResult {
  const base: Omit<MarketContextDimensionResult, 'pass' | 'title' | 'description'> = {
    id: 'volatility',
  };

  if (!klines4H || klines4H.length < 10) {
    return {
      ...base,
      pass: true,
      skipped: true,
      title: 'Volatility — không có dữ liệu',
      description: 'Klines 4H không đủ — không chặn ACTIVE',
    };
  }

  const { volatilityRisk, atrPct } = computeVolatilityRisk(klines4H);

  if (volatilityRisk === 'LOW') {
    return {
      ...base,
      pass: false,
      title: 'Volatility quá thấp — không giao dịch',
      description: `ATR ratio ${atrPct.toFixed(1)}% — thị trường quá nén`,
    };
  }
  if (volatilityRisk === 'EXTREME' || volatilityRisk === 'HIGH') {
    return {
      ...base,
      pass: false,
      title: 'Volatility quá cao — không bắt dao rơi',
      description: `ATR risk ${volatilityRisk} (${atrPct.toFixed(1)}%)`,
    };
  }

  return {
    ...base,
    pass: true,
    title: 'Volatility phù hợp',
    description: `ATR risk ${volatilityRisk} (${atrPct.toFixed(1)}%)`,
  };
}

/** Đánh giá toàn bộ 5 chiều market context. */
export function evaluateMarketContext(
  params: MarketContextFilterParams,
): MarketContextFilterResult {
  const btc = resolveBtcContext(params);
  const dimensions = {
    btc: evaluateBtcMarketContext(btc, params.trendDirection),
    funding: evaluateFundingMarketContext(params.fundingRate, params.trendDirection),
    oi: evaluateOiMarketContext(
      params.oiDeltaPct,
      params.priceChangePct,
      params.trendDirection,
    ),
    whale: evaluateWhaleMarketContext(params.whale, params.trendDirection),
    volatility: evaluateVolatilityMarketContext(params.klines4H),
  };

  const failedDimensions = (Object.keys(dimensions) as MarketContextDimensionResult['id'][]).filter(
    (key) => !dimensions[key].pass && !dimensions[key].skipped,
  );

  const hardFails = (Object.keys(dimensions) as MarketContextDimensionResult['id'][]).filter(
    (key) => !dimensions[key].pass,
  );

  return {
    pass: hardFails.length === 0,
    applied: true,
    dimensions,
    failedDimensions,
  };
}

const CONTEXT_DOWNGRADE_CONFIDENCE_CAP = 69;

/**
 * Áp Market Context lên kết quả Trend Reversal.
 * Chỉ xử lý khi trend state === ACTIVE; ngược lại trả nguyên.
 */
export function applyMarketContextFilter(
  trendResult: TrendReversalResult,
  params: MarketContextFilterParams,
): TrendReversalWithContextResult {
  const withDirection: TrendReversalWithContextResult = {
    ...trendResult,
    trendDirection: params.trendDirection,
  };

  if (trendResult.state !== 'ACTIVE') {
    return withDirection;
  }

  const marketContext = evaluateMarketContext(params);

  if (marketContext.pass) {
    return {
      ...withDirection,
      preContextState: 'ACTIVE',
      marketContext,
    };
  }

  return {
    ...withDirection,
    state: 'WATCH',
    preContextState: 'ACTIVE',
    marketContext,
    detail: {
      ...trendResult.detail,
      confidence: Math.min(trendResult.detail.confidence, CONTEXT_DOWNGRADE_CONFIDENCE_CAP),
    },
  };
}

/** Pipeline đầy đủ: Trend Reversal → Market Context → state cuối. */
export function evaluateTrendReversalWithContext(
  trendParams: ComputeTrendReversalParams,
  contextParams: Omit<MarketContextFilterParams, 'trendDirection'>,
): TrendReversalWithContextResult {
  const trendResult = computeTrendReversal(trendParams);
  return applyMarketContextFilter(trendResult, {
    ...contextParams,
    trendDirection: trendParams.trendDirection,
  });
}
