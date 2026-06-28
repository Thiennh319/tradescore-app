import { describe, it, expect } from 'vitest';
import {
  calculatePreliminaryScores,
  resolveVisibilityHysteresis,
  resolveTradeModeUpgrade,
} from '../visibilityManager';
import {
  DEFAULT_VISIBILITY_CONFIG,
  type MarketIntelligenceSnapshot,
  type PositionState,
  type VisibilityMode,
} from '../types';

function mockMI(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 50,
    trendDirection: 'NEUTRAL',
    trendExhaustion: 30,
    volumeDivergencePts: 0,
    reversalProbability: 20,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 50,
    btcAlignmentFactor: 0.8,
    btcDirection: 'NEUTRAL',
    marketState: 'Transition',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

function mockPosition(overrides: Partial<PositionState> = {}): PositionState {
  return {
    hasOpenPosition: false,
    openDirection: null,
    symbol: null,
    ...overrides,
  };
}

const gapZoneMI = (): MarketIntelligenceSnapshot =>
  mockMI({
    trendDirection: 'BULL',
    marketState: 'Transition',
    trendStrength: 50,
  });

const showFromInactiveMI = (): MarketIntelligenceSnapshot =>
  mockMI({
    trendDirection: 'BULL',
    marketState: 'HealthyUptrend',
    trendStrength: 65,
  });

describe('calculatePreliminaryScores', () => {
  it('BULL + HealthyUptrend + TS>=50 → buy 13, sell 3 (+3 TS cả 2 bên)', () => {
    const result = calculatePreliminaryScores(
      mockMI({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        trendStrength: 65,
      }),
    );
    expect(result.buyScorePreliminary).toBe(13);
    expect(result.sellScorePreliminary).toBe(3);
  });

  it('BEAR + StrongDowntrend + TS>=50 → sell 13, buy 3 (+3 TS cả 2 bên)', () => {
    const result = calculatePreliminaryScores(
      mockMI({
        trendDirection: 'BEAR',
        marketState: 'StrongDowntrend',
        trendStrength: 80,
      }),
    );
    expect(result.sellScorePreliminary).toBe(13);
    expect(result.buyScorePreliminary).toBe(3);
  });

  it('BULL nhưng LateUptrend + TS<50 → buy chỉ 5 (chỉ direction)', () => {
    const result = calculatePreliminaryScores(
      mockMI({
        trendDirection: 'BULL',
        marketState: 'LateUptrend',
        trendStrength: 40,
      }),
    );
    expect(result.buyScorePreliminary).toBe(5);
    expect(result.sellScorePreliminary).toBe(0);
  });

  it('NEUTRAL + Transition + TS=50 (biên) → buy 3, sell 3 (chỉ TS>=50 cộng cả 2 bên)', () => {
    const result = calculatePreliminaryScores(
      mockMI({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 50,
      }),
    );
    expect(result.buyScorePreliminary).toBe(3);
    expect(result.sellScorePreliminary).toBe(3);
  });

  it('TS=49 (dưới biên) → không cộng điểm TS cho cả 2 bên', () => {
    const result = calculatePreliminaryScores(
      mockMI({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        trendStrength: 49,
      }),
    );
    expect(result.buyScorePreliminary).toBe(10);
    expect(result.sellScorePreliminary).toBe(0);
  });

  it('Tất cả điều kiện đều không khớp → buy 0, sell 0', () => {
    const result = calculatePreliminaryScores(
      mockMI({
        trendDirection: 'NEUTRAL',
        marketState: 'Distribution',
        trendStrength: 30,
      }),
    );
    expect(result.buyScorePreliminary).toBe(0);
    expect(result.sellScorePreliminary).toBe(0);
  });
});

describe('resolveVisibilityHysteresis', () => {
  it('hasOpenPosition=true → luôn POSITION_MODE dù mọi chỉ số thấp', () => {
    const result = resolveVisibilityHysteresis(
      mockMI({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 10,
        reversalProbability: 5,
        trendExhaustion: 5,
      }),
      mockPosition({ hasOpenPosition: true }),
      'INACTIVE',
    );
    expect(result.mode).toBe('POSITION_MODE');
  });

  it('hasOpenPosition=true → POSITION_MODE dù previousMode là TRADE_MODE', () => {
    const result = resolveVisibilityHysteresis(
      mockMI({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 10,
        reversalProbability: 5,
        trendExhaustion: 5,
      }),
      mockPosition({ hasOpenPosition: true }),
      'TRADE_MODE',
    );
    expect(result.mode).toBe('POSITION_MODE');
  });

  it('Đủ điều kiện HIỆN (buy>=10) + previousMode=INACTIVE → WATCH_MODE', () => {
    const result = resolveVisibilityHysteresis(
      showFromInactiveMI(),
      mockPosition(),
      'INACTIVE',
    );
    expect(result.mode).toBe('WATCH_MODE');
  });

  it('Đủ điều kiện HIỆN qua reversalProbability>=60 (không qua buy/sell) + previousMode=INACTIVE → WATCH_MODE', () => {
    const result = resolveVisibilityHysteresis(
      mockMI({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 10,
        reversalProbability: 65,
      }),
      mockPosition(),
      'INACTIVE',
    );
    expect(result.mode).toBe('WATCH_MODE');
  });

  it('Đủ điều kiện HIỆN + previousMode=WATCH_MODE → giữ WATCH_MODE', () => {
    const result = resolveVisibilityHysteresis(
      showFromInactiveMI(),
      mockPosition(),
      'WATCH_MODE',
    );
    expect(result.mode).toBe('WATCH_MODE');
  });

  it('Đủ điều kiện HIỆN + previousMode=TRADE_MODE → giữ TRADE_MODE', () => {
    const result = resolveVisibilityHysteresis(
      showFromInactiveMI(),
      mockPosition(),
      'TRADE_MODE',
    );
    expect(result.mode).toBe('TRADE_MODE');
  });

  it('Dưới ngưỡng ẨN ở mọi chỉ số + !hasOpenPosition → INACTIVE', () => {
    const result = resolveVisibilityHysteresis(
      mockMI({
        trendDirection: 'NEUTRAL',
        marketState: 'Transition',
        trendStrength: 10,
        reversalProbability: 20,
        trendExhaustion: 20,
      }),
      mockPosition(),
      'WATCH_MODE',
    );
    expect(result.mode).toBe('INACTIVE');
  });

  it('buy_prelim=8 (vùng gap) → giữ previousMode=WATCH_MODE', () => {
    const result = resolveVisibilityHysteresis(
      gapZoneMI(),
      mockPosition(),
      'WATCH_MODE',
    );
    expect(result.mode).toBe('WATCH_MODE');
    expect(result.reason).toMatch(/trung gian|gap/i);
  });

  it('Cùng vùng gap như test 8 nhưng previousMode=INACTIVE → giữ INACTIVE', () => {
    const result = resolveVisibilityHysteresis(
      gapZoneMI(),
      mockPosition(),
      'INACTIVE',
    );
    expect(result.mode).toBe('INACTIVE');
  });

  it('Cùng vùng gap như test 8 nhưng previousMode=TRADE_MODE → giữ TRADE_MODE', () => {
    const result = resolveVisibilityHysteresis(
      gapZoneMI(),
      mockPosition(),
      'TRADE_MODE',
    );
    expect(result.mode).toBe('TRADE_MODE');
  });
});

describe('resolveTradeModeUpgrade', () => {
  it('hasOpenPosition=true → luôn POSITION_MODE bất kể currentMode/entryQuality', () => {
    expect(resolveTradeModeUpgrade('WATCH_MODE', true, 30)).toBe(
      'POSITION_MODE',
    );
  });

  it('hasOpenPosition=true + currentMode=TRADE_MODE + entryQuality cao → vẫn POSITION_MODE', () => {
    expect(resolveTradeModeUpgrade('TRADE_MODE', true, 95)).toBe(
      'POSITION_MODE',
    );
  });

  it('WATCH_MODE + entryQuality=70 (đúng ngưỡng) → TRADE_MODE', () => {
    expect(resolveTradeModeUpgrade('WATCH_MODE', false, 70)).toBe('TRADE_MODE');
  });

  it('WATCH_MODE + entryQuality=69 (dưới ngưỡng) → giữ WATCH_MODE', () => {
    expect(resolveTradeModeUpgrade('WATCH_MODE', false, 69)).toBe('WATCH_MODE');
  });

  it('WATCH_MODE + entryQuality=95 (cao) → TRADE_MODE', () => {
    expect(resolveTradeModeUpgrade('WATCH_MODE', false, 95)).toBe('TRADE_MODE');
  });

  it('TRADE_MODE + entryQuality=70 (đúng ngưỡng) → giữ TRADE_MODE', () => {
    expect(resolveTradeModeUpgrade('TRADE_MODE', false, 70)).toBe('TRADE_MODE');
  });

  it('TRADE_MODE + entryQuality=69 (giảm dưới ngưỡng) → hạ về WATCH_MODE', () => {
    expect(resolveTradeModeUpgrade('TRADE_MODE', false, 69)).toBe('WATCH_MODE');
  });

  it('TRADE_MODE + entryQuality=0 (rất thấp) → hạ về WATCH_MODE', () => {
    expect(resolveTradeModeUpgrade('TRADE_MODE', false, 0)).toBe('WATCH_MODE');
  });

  it('currentMode=INACTIVE + entryQuality cao → vẫn giữ INACTIVE (hàm này không xử lý INACTIVE)', () => {
    expect(resolveTradeModeUpgrade('INACTIVE', false, 95)).toBe('INACTIVE');
  });

  it('currentMode=POSITION_MODE + !hasOpenPosition + entryQuality thấp → vẫn giữ POSITION_MODE', () => {
    // Case biên, có thể không xảy ra thực tế nếu orchestrator đồng bộ đúng hasOpenPosition
    expect(resolveTradeModeUpgrade('POSITION_MODE', false, 10)).toBe(
      'POSITION_MODE',
    );
  });

  it('Dùng config tùy chỉnh (tradeModeEntryQualityThreshold=80) → ngưỡng đổi theo config', () => {
    expect(
      resolveTradeModeUpgrade('WATCH_MODE', false, 75, {
        ...DEFAULT_VISIBILITY_CONFIG,
        tradeModeEntryQualityThreshold: 80,
      }),
    ).toBe('WATCH_MODE');
  });
});
