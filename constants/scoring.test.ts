import { describe, expect, it } from 'vitest';
import {
  BINANCE_BASE_URL,
  COLORS,
  DECISION_LABELS_V2,
  DEFAULT_SETTINGS,
  FundingState,
  LAYER_NAMES,
  MANDATORY_LAYERS_V2,
  REGIME_WEIGHTS,
  SCORE_THRESHOLDS,
  SCORER_LAYER_NAMES,
  ANALYSIS_TIMEFRAMES,
  TIMEFRAMES,
  TRADE_SYMBOLS,
  classifyFundingState,
  getFundingStateLabel,
  type MarketRegime,
} from './scoring';

const REGIMES: MarketRegime[] = [
  'TRENDING_BULL',
  'TRENDING_BEAR',
  'MEAN_REVERSION',
  'HIGH_VOLATILITY_CHOP',
];

function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

describe('DEFAULT_SETTINGS', () => {
  it('matches Phase 1 risk & schedule config', () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });
});

describe('TRADE_SYMBOLS', () => {
  it('includes BTC, NEAR, SOL and BNB perpetuals', () => {
    expect(TRADE_SYMBOLS).toEqual(['BTCUSDT', 'NEARUSDT', 'SOLUSDT', 'BNBUSDT']);
  });
});

describe('TIMEFRAMES', () => {
  it('defines 5 multi-timeframe intervals in order', () => {
    expect(TIMEFRAMES).toEqual(['5m', '15m', '1h', '4h', '1d']);
  });
});

describe('ANALYSIS_TIMEFRAMES', () => {
  it('defines 3 selectable analysis intervals', () => {
    expect(ANALYSIS_TIMEFRAMES).toEqual(['1h', '4h', '1d']);
  });
});

describe('LAYER_NAMES', () => {
  it('has exactly 14 technical layers', () => {
    expect(LAYER_NAMES).toHaveLength(14);
  });

  it('includes SMC, CVD and Funding/OI layers', () => {
    expect(LAYER_NAMES).toContain('BOS_CHOCH');
    expect(LAYER_NAMES).toContain('CVD_DIVERGENCE');
    expect(LAYER_NAMES).toContain('FUNDING_OI');
  });
});

describe('REGIME_WEIGHTS', () => {
  it.each(REGIMES)('%s covers all 14 layers', (regime) => {
    const keys = Object.keys(REGIME_WEIGHTS[regime]);
    expect(keys).toHaveLength(LAYER_NAMES.length);
    for (const layer of LAYER_NAMES) {
      expect(REGIME_WEIGHTS[regime]).toHaveProperty(layer);
    }
  });

  it.each(REGIMES)('%s weights sum to 1.0', (regime) => {
    expect(sumWeights(REGIME_WEIGHTS[regime])).toBeCloseTo(1.0, 5);
  });

  it('amplifies BOS/CHoCH in trending regimes vs mean reversion', () => {
    const trendingBos = REGIME_WEIGHTS.TRENDING_BULL.BOS_CHOCH;
    const meanRevBos = REGIME_WEIGHTS.MEAN_REVERSION.BOS_CHOCH;
    expect(trendingBos).toBeGreaterThan(meanRevBos);
    expect(trendingBos).toBe(0.18);
    expect(meanRevBos).toBe(0.04);
  });

  it('amplifies Bollinger & RSI in mean reversion vs trending bull', () => {
    const mr = REGIME_WEIGHTS.MEAN_REVERSION;
    const bull = REGIME_WEIGHTS.TRENDING_BULL;
    expect(mr.BOLLINGER).toBeGreaterThan(bull.BOLLINGER);
    expect(mr.RSI).toBeGreaterThan(bull.RSI);
    expect(mr.BOLLINGER).toBe(0.16);
    expect(mr.RSI).toBe(0.15);
  });

  it('prioritizes volatility & liquidity in HIGH_VOLATILITY_CHOP', () => {
    const chop = REGIME_WEIGHTS.HIGH_VOLATILITY_CHOP;
    expect(chop.ATR_VOLATILITY).toBe(0.12);
    expect(chop.LIQUIDITY_POOL).toBe(0.11);
    expect(chop.ATR_VOLATILITY).toBeGreaterThan(chop.BOS_CHOCH);
  });
});

describe('COLORS', () => {
  it('uses Binance dark theme base colors', () => {
    expect(COLORS.background).toBe('#0B0E11');
    expect(COLORS.accent).toBe('#F0B90B');
    expect(COLORS.bullish).toBe('#0ECB81');
    expect(COLORS.bearish).toBe('#F6465D');
  });
});

describe('SCORE_THRESHOLDS', () => {
  it('orders long → neutral → short thresholds correctly (AI 0–100)', () => {
    const t = SCORE_THRESHOLDS;
    expect(t.strongLong).toBeGreaterThan(t.long);
    expect(t.long).toBeGreaterThan(t.neutralHigh);
    expect(t.neutralHigh).toBeGreaterThan(t.neutralLow);
    expect(t.neutralLow).toBeGreaterThan(t.short);
    expect(t.short).toBeGreaterThan(t.strongShort);
  });

  it('defines Phase 4 v2 decision bands on 15-point scale', () => {
    expect(SCORE_THRESHOLDS.NO_ENTRY_MAX).toBe(8);
    expect(SCORE_THRESHOLDS.WAIT_MAX).toBe(9);
    expect(SCORE_THRESHOLDS.CAN_ENTER_MAX).toBe(10);
    expect(SCORE_THRESHOLDS.CONFIDENT_MAX).toBe(11.5);
  });
});

describe('v2 scoring constants', () => {
  it('MANDATORY_LAYERS_V2 covers layers 1,3,6,8,9,10', () => {
    expect(MANDATORY_LAYERS_V2).toEqual([1, 3, 6, 8, 9, 10]);
  });

  it('SCORER_LAYER_NAMES has 10 display labels', () => {
    expect(Object.keys(SCORER_LAYER_NAMES)).toHaveLength(10);
    expect(SCORER_LAYER_NAMES[1]).toBe('Giá & EMA/SMA');
    expect(SCORER_LAYER_NAMES[10]).toBe('Tâm lý & Kỷ luật');
  });

  it('DECISION_LABELS_V2 includes all decision types', () => {
    expect(Object.keys(DECISION_LABELS_V2)).toEqual([
      'KHONG_VAO',
      'CHO_THEM',
      'CO_THE_VAO',
      'VAO_TU_TIN',
      'SETUP_NGON',
    ]);
  });
});

describe('BINANCE_BASE_URL', () => {
  it('points to Binance Futures REST API', () => {
    expect(BINANCE_BASE_URL).toBe('https://fapi.binance.com');
  });
});

describe('classifyFundingState', () => {
  it('EXTREME_LONG_EUPHORIA when current > 0.01% and velocity > 0', () => {
    expect(classifyFundingState(0.012, 0.001, 0)).toBe(
      FundingState.EXTREME_LONG_EUPHORIA,
    );
  });

  it('LONG_EUPHORIA_FADING when current > 0.005% and velocity < 0', () => {
    expect(classifyFundingState(0.008, -0.001, 0)).toBe(
      FundingState.LONG_EUPHORIA_FADING,
    );
  });

  it('NEUTRAL when |current| ≤ 0.005% and |velocity| ≤ 0.002%', () => {
    expect(classifyFundingState(0.003, 0.001, 0)).toBe(FundingState.NEUTRAL);
  });

  it('SHORT_EUPHORIA_FADING when current < -0.005% and velocity > 0', () => {
    expect(classifyFundingState(-0.008, 0.001, 0)).toBe(
      FundingState.SHORT_EUPHORIA_FADING,
    );
  });

  it('SHORT_SQUEEZE_BUILDING when current < -0.005% and velocity < 0', () => {
    expect(classifyFundingState(-0.008, -0.001, 0)).toBe(
      FundingState.SHORT_SQUEEZE_BUILDING,
    );
  });

  it('boundary: current = 0.005% and velocity = 0 → NEUTRAL', () => {
    expect(classifyFundingState(0.005, 0, 0)).toBe(FundingState.NEUTRAL);
  });

  it('boundary: current = 0.01% (not > 0.01) with positive velocity → LONG_FUNDING_ELEVATED', () => {
    expect(classifyFundingState(0.01, 0.001, 0)).toBe(
      FundingState.LONG_FUNDING_ELEVATED,
    );
  });

  it('LONG_FUNDING_ELEVATED when current = 0.0095% and velocity = 0', () => {
    expect(classifyFundingState(0.0095, 0, 0)).toBe(
      FundingState.LONG_FUNDING_ELEVATED,
    );
  });

  it('boundary: current = 0.0050001% and velocity = 0 → LONG_FUNDING_ELEVATED', () => {
    expect(classifyFundingState(0.0050001, 0, 0)).toBe(
      FundingState.LONG_FUNDING_ELEVATED,
    );
  });

  it('boundary: current = 0.01% and velocity = 0 → LONG_FUNDING_ELEVATED', () => {
    expect(classifyFundingState(0.01, 0, 0)).toBe(FundingState.LONG_FUNDING_ELEVATED);
  });

  it('boundary: current = 0.0100001% and velocity = 0 → NEUTRAL fallback', () => {
    expect(classifyFundingState(0.0100001, 0, 0)).toBe(FundingState.NEUTRAL);
  });

  it('boundary: current = 0.0100001% and velocity > 0 → EXTREME_LONG_EUPHORIA', () => {
    expect(classifyFundingState(0.0100001, 0.001, 0)).toBe(
      FundingState.EXTREME_LONG_EUPHORIA,
    );
  });

  it('boundary: velocity = 0.002% at neutral current → NEUTRAL', () => {
    expect(classifyFundingState(0.004, 0.002, 0)).toBe(FundingState.NEUTRAL);
  });
});

describe('getFundingStateLabel', () => {
  it('returns icon and text for each FundingState', () => {
    expect(getFundingStateLabel(FundingState.EXTREME_LONG_EUPHORIA)).toEqual({
      icon: '🔥',
      text: 'Long quá hưng phấn',
    });
    expect(getFundingStateLabel(FundingState.SHORT_SQUEEZE_BUILDING)).toEqual({
      icon: '⚡',
      text: 'Short đang bị ép mạnh',
    });
    expect(getFundingStateLabel(FundingState.LONG_FUNDING_ELEVATED)).toEqual({
      icon: '📊',
      text: 'Funding dương vừa phải',
    });
  });
});
