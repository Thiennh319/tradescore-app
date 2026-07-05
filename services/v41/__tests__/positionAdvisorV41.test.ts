import { describe, expect, it } from 'vitest';
import {
  computeCurrentPnlPct,
  evaluatePositionV41,
  type PositionAdvisorV41Params,
} from '../positionAdvisorV41';
import type { ProtectionSnapshot } from '../protectionLayer';
import type { MarketIntelligenceSnapshot } from '../types';

function miSnapshot(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 50,
    trendDirection: 'BULL',
    trendExhaustion: 25,
    volumeDivergencePts: 0,
    reversalProbability: 30,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 72,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'HealthyUptrend',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

function neutralProtection(
  overrides: Partial<ProtectionSnapshot> = {},
): ProtectionSnapshot {
  return {
    stopHuntDetected: false,
    stopHuntRisk: 'LOW',
    volatilityRisk: 'NORMAL',
    volatilityAtrPct: 100,
    protectionWarnings: [],
    protectionPenalty: 0,
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<PositionAdvisorV41Params> = {},
): PositionAdvisorV41Params {
  return {
    snapshot: miSnapshot(),
    protection: neutralProtection(),
    openPosition: {
      entryPrice: 100,
      direction: 'LONG',
      size: 100,
      leverage: 5,
      sl: 95,
      tp1: 110,
      tp2: 120,
      tp3: 130,
      openedAt: Date.now() - 60_000,
    },
    markPrice: 102,
    ...overrides,
  };
}

function earlyWarning(
  severity: 'BLOCK' | 'WARNING_HARD' | 'WARNING_SOFT',
  direction: 'LONG' | 'SHORT' | 'BOTH' = 'LONG',
) {
  return {
    rawSeverity: severity,
    severity,
    signals30M: [],
    signals1H: [],
    signalCount: 1,
    volumeConfirmed: severity !== 'WARNING_SOFT',
    warningMessage: '⚠️ test warning',
    blockMessage: '🔴 Đảo chiều xác nhận 30M+1H+Volume — không vào lệnh',
    direction,
  };
}

describe('evaluatePositionV41', () => {
  it('EXTREME volatility → CLOSE_NOW CRITICAL', () => {
    const result = evaluatePositionV41(
      baseParams({
        protection: neutralProtection({ volatilityRisk: 'EXTREME' }),
      }),
    );

    expect(result.action).toBe('CLOSE_NOW');
    expect(result.urgency).toBe('CRITICAL');
    expect(result.label).toContain('Đóng khẩn cấp');
  });

  it('markPrice ≥ tp1 LONG → PARTIAL_TP1', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 110,
        openPosition: {
          ...baseParams().openPosition,
          tp1: 110,
          tp2: 120,
        },
      }),
    );

    expect(result.action).toBe('PARTIAL_TP1');
    expect(result.label).toBe('Chốt 50% tại TP1');
  });

  it('markPrice ≥ tp2 LONG → PARTIAL_TP2', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 120,
        openPosition: {
          ...baseParams().openPosition,
          tp1: 110,
          tp2: 120,
        },
      }),
    );

    expect(result.action).toBe('PARTIAL_TP2');
    expect(result.label).toBe('Chốt thêm 30% tại TP2');
  });

  it('50% đến TP1, sl < entry → MOVE_SL_BE', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 105,
        openPosition: {
          ...baseParams().openPosition,
          entryPrice: 100,
          sl: 95,
          tp1: 110,
        },
      }),
    );

    expect(result.action).toBe('MOVE_SL_BE');
    expect(result.breakEvenSuggested).toBe(true);
    expect(result.breakEvenPrice).toBe(100);
    expect(result.label).toBe('Dời SL về entry — bảo vệ vốn');
  });

  it('Qua TP1 + trend ≥ 60 → TRAILING_STOP', () => {
    const result = evaluatePositionV41(
      baseParams({
        snapshot: miSnapshot({ trendStrength: 70 }),
        markPrice: 112,
        openPosition: {
          ...baseParams().openPosition,
          sl: 100,
          tp1: 110,
          tp2: 130,
        },
      }),
    );

    expect(result.action).toBe('TRAILING_STOP');
    expect(result.trailingStopSuggested).toBe(true);
    expect(result.trailingStopPrice).toBeCloseTo(112 * 0.985, 5);
    expect(result.label).toBe('Trailing stop — trend còn mạnh');
  });

  it('Không rule nào → HOLD', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 101,
        snapshot: miSnapshot({ marketState: 'HealthyUptrend' }),
      }),
    );

    expect(result.action).toBe('HOLD');
    expect(result.urgency).toBe('LOW');
    expect(result.label).toBe('Giữ lệnh — theo dõi');
  });

  it('Distribution + LONG → CLOSE_NOW', () => {
    const result = evaluatePositionV41(
      baseParams({
        snapshot: miSnapshot({ marketState: 'Distribution' }),
        openPosition: {
          ...baseParams().openPosition,
          direction: 'LONG',
        },
      }),
    );

    expect(result.action).toBe('CLOSE_NOW');
    expect(result.urgency).toBe('CRITICAL');
  });

  it('Trend đảo BEAR + LONG TS≥60 → CLOSE_NOW', () => {
    const result = evaluatePositionV41(
      baseParams({
        snapshot: miSnapshot({ trendDirection: 'BEAR', trendStrength: 65 }),
        openPosition: {
          ...baseParams().openPosition,
          direction: 'LONG',
        },
      }),
    );

    expect(result.action).toBe('CLOSE_NOW');
    expect(result.urgency).toBe('CRITICAL');
  });
});

describe('evaluatePositionV41 — early warning rules', () => {
  it('BLOCK + LONG lời → CLOSE_NOW CRITICAL', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 104,
        earlyWarning: earlyWarning('BLOCK', 'LONG'),
      }),
    );

    expect(result.action).toBe('CLOSE_NOW');
    expect(result.urgency).toBe('CRITICAL');
    expect(result.label).toBe('Chốt lời ngay — đảo chiều xác nhận 30M+1H');
  });

  it('BLOCK + LONG lỗ → CLOSE_NOW CRITICAL', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 98,
        earlyWarning: earlyWarning('BLOCK', 'LONG'),
      }),
    );

    expect(result.action).toBe('CLOSE_NOW');
    expect(result.urgency).toBe('CRITICAL');
    expect(result.label).toBe('Đóng khẩn cấp — đảo chiều xác nhận 30M+1H');
  });

  it('BLOCK + direction SHORT + lệnh LONG → không trigger', () => {
    const result = evaluatePositionV41(
      baseParams({
        snapshot: miSnapshot({ marketState: 'HealthyUptrend' }),
        markPrice: 101,
        earlyWarning: earlyWarning('BLOCK', 'SHORT'),
        openPosition: {
          ...baseParams().openPosition,
          direction: 'LONG',
        },
      }),
    );

    expect(result.action).toBe('HOLD');
    expect(result.label).toBe('Giữ lệnh — theo dõi');
  });

  it('WARNING_HARD + lời 30% TP1 + sl chưa BE → MOVE_SL_BE HIGH', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 103,
        openPosition: {
          ...baseParams().openPosition,
          entryPrice: 100,
          sl: 95,
          tp1: 110,
        },
        earlyWarning: earlyWarning('WARNING_HARD', 'LONG'),
      }),
    );

    expect(result.action).toBe('MOVE_SL_BE');
    expect(result.urgency).toBe('HIGH');
    expect(result.label).toBe('Siết SL về entry — cảnh báo đảo chiều 1H');
  });

  it('WARNING_HARD + sl đã BE → HOLD MEDIUM', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 102,
        openPosition: {
          ...baseParams().openPosition,
          sl: 100,
        },
        earlyWarning: earlyWarning('WARNING_HARD', 'LONG'),
      }),
    );

    expect(result.action).toBe('HOLD');
    expect(result.urgency).toBe('MEDIUM');
    expect(result.label).toBe('Giữ — SL đã an toàn');
  });

  it('WARNING_SOFT → HOLD LOW', () => {
    const result = evaluatePositionV41(
      baseParams({
        earlyWarning: earlyWarning('WARNING_SOFT', 'LONG'),
      }),
    );

    expect(result.action).toBe('HOLD');
    expect(result.urgency).toBe('LOW');
    expect(result.label).toBe('Giữ — tín hiệu 30M, theo dõi thêm');
  });

  it('earlyWarning undefined → rule cũ chạy bình thường', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 101,
        snapshot: miSnapshot({ marketState: 'HealthyUptrend' }),
      }),
    );

    expect(result.action).toBe('HOLD');
    expect(result.label).toBe('Giữ lệnh — theo dõi');
  });

  it('Priority: BLOCK (110) > CRITICAL_CLOSE cũ (90)', () => {
    const result = evaluatePositionV41(
      baseParams({
        protection: neutralProtection({ volatilityRisk: 'EXTREME' }),
        earlyWarning: earlyWarning('BLOCK', 'LONG'),
      }),
    );

    expect(result.action).toBe('CLOSE_NOW');
    expect(result.label).toBe('Chốt lời ngay — đảo chiều xác nhận 30M+1H');
  });
});

describe('computeCurrentPnlPct', () => {
  it('LONG đúng', () => {
    expect(computeCurrentPnlPct(100, 102, 'LONG', 5)).toBeCloseTo(10, 5);
  });

  it('SHORT đúng', () => {
    expect(computeCurrentPnlPct(100, 98, 'SHORT', 5)).toBeCloseTo(10, 5);
  });
});

describe('evaluatePositionV41 — momentum reversal (priority 108)', () => {
  const momentumShortConfirmed = {
    momentumLong: 0,
    momentumShort: 2,
    momentumConfirmedLong: false,
    momentumConfirmedShort: true,
    signalsLong: [],
    signalsShort: ['SELL_VOLUME_SPIKE_1H'],
    tpMultiplier: 1,
    slMultiplier: 1,
  };

  it('LONG + momentumShort + EX≥60 + lời 60% TP1 → PARTIAL_TP1 HIGH', () => {
    const result = evaluatePositionV41(
      baseParams({
        snapshot: miSnapshot({ trendExhaustion: 65 }),
        markPrice: 106,
        momentum: momentumShortConfirmed,
        openPosition: {
          ...baseParams().openPosition,
          entryPrice: 100,
          sl: 95,
          tp1: 110,
        },
      }),
    );

    expect(result.action).toBe('PARTIAL_TP1');
    expect(result.urgency).toBe('HIGH');
    expect(result.label).toBe('Chốt 50% — Momentum SHORT xuất hiện');
  });

  it('LONG + momentumShort + EX≥60 + lời 30% TP1 → MOVE_SL_BE MEDIUM', () => {
    const result = evaluatePositionV41(
      baseParams({
        snapshot: miSnapshot({ trendExhaustion: 65 }),
        markPrice: 103,
        momentum: momentumShortConfirmed,
        openPosition: {
          ...baseParams().openPosition,
          entryPrice: 100,
          sl: 95,
          tp1: 110,
        },
      }),
    );

    expect(result.action).toBe('MOVE_SL_BE');
    expect(result.urgency).toBe('MEDIUM');
    expect(result.label).toBe('Siết SL — Momentum SHORT xuất hiện');
    expect(result.breakEvenSuggested).toBe(true);
  });
});

describe('evaluatePositionV41 — exhaustion rescue (priority 85)', () => {
  it('CAPITULATION LONG đang lỗ → HOLD (chờ bounce)', () => {
    const result = evaluatePositionV41(
      baseParams({
        markPrice: 98,
        snapshot: miSnapshot({
          marketState: 'HealthyUptrend',
          trendDirection: 'BULL',
          trendStrength: 50,
        }),
        exhaustion: {
          exhaustionDetected: true,
          exhaustionType: 'CAPITULATION',
          exhaustionStrength: 80,
          direction: 'LONG',
          confThreshold: 60,
          eqThreshold: 80,
          tpMultiplier: 1.2,
          slMultiplier: 1,
        },
        openPosition: {
          ...baseParams().openPosition,
          direction: 'LONG',
          entryPrice: 100,
          sl: 95,
        },
      }),
    );

    expect(result.action).toBe('HOLD');
    expect(result.urgency).toBe('LOW');
    expect(result.label).toBe('Giữ — Exhaustion CAPITULATION có thể đảo chiều');
  });
});
