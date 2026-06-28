import { describe, expect, it } from 'vitest';
import { FundingState } from '../constants/scoring';
import type { SqueezeDirection, SqueezeLevel, SqueezeRiskResult } from '../types/squeezeRisk';
import {
  evaluatePositionV4,
  estimatePositionAtr,
  isInGracePeriod,
  resolveGraceAtr,
} from './positionAdvisorV4';
import {
  isHoldFamilyAction,
  isCloseFamilyAction,
} from './gracePeriod';
import type { ActivePosition, OwnDirectionScore } from './positionAdvisorV3';
import { evaluatePositionV2 } from './positionAdvisorV3';

const ATR = 10;
const ENTRY = 100;
const NOW = 1_700_000_000_000;

function basePosition(overrides: Partial<ActivePosition> = {}): ActivePosition {
  return {
    direction: 'LONG',
    entryPrice: ENTRY,
    sl: ENTRY - 2 * ATR,
    tp1: ENTRY + 2 * ATR,
    tp2: ENTRY + 4 * ATR,
    tp3: ENTRY + 6 * ATR,
    openedAt: NOW - 2 * 60_000,
    currentPnlPct: -1,
    currentPnlUSDT: -0.5,
    ...overrides,
  };
}

const cvdWeakScore: OwnDirectionScore = {
  totalScore: 7,
  direction: 'LONG',
  groupScores: { A: 2, B: 2, C: 3 },
  decision: 'CHO_THEM',
  hardBlocks: [],
  groupBlocks: [],
  warnings: ['CVD phân kỳ bearish — dòng tiền yếu'],
  layers: [
    { layerNumber: 1, score: 1 },
    { layerNumber: 5, score: 0 },
    { layerNumber: 8, score: 1 },
  ],
};

function v4Input(
  overrides: Partial<{
    position: Partial<ActivePosition>;
    currentPrice: number;
    ownDirectionScore: Partial<OwnDirectionScore>;
    now: number;
    atr1h: number;
  }> = {},
) {
  return {
    position: basePosition(overrides.position),
    currentPrice: overrides.currentPrice ?? ENTRY - 1,
    ownDirectionScore: { ...cvdWeakScore, ...overrides.ownDirectionScore },
    oppositeDirectionScore: { totalScore: 5, decision: 'KHONG_VAO', hardBlocks: [] },
    marketMode: 'RANGING' as const,
    atr1h: overrides.atr1h ?? ATR,
    now: overrides.now ?? NOW,
  };
}

describe('isInGracePeriod', () => {
  it('TRUE khi <20 phút và giá trong 0.5×ATR', () => {
    expect(
      isInGracePeriod(
        { entryPrice: ENTRY, openedAt: NOW - 8 * 60_000 },
        ENTRY - 0.3 * ATR,
        ATR,
        NOW,
      ),
    ).toBe(true);
  });

  it('FALSE khi giá đã chạy ≥0.5×ATR', () => {
    expect(
      isInGracePeriod(
        { entryPrice: ENTRY, openedAt: NOW - 2 * 60_000 },
        ENTRY - 0.6 * ATR,
        ATR,
        NOW,
      ),
    ).toBe(false);
  });

  it('FALSE khi đã quá 20 phút', () => {
    expect(
      isInGracePeriod(
        { entryPrice: ENTRY, openedAt: NOW - 25 * 60_000 },
        ENTRY - 0.3 * ATR,
        ATR,
        NOW,
      ),
    ).toBe(false);
  });
});

describe('estimatePositionAtr', () => {
  it('ước lượng từ khoảng cách SL', () => {
    expect(estimatePositionAtr(basePosition())).toBe(ATR);
  });
});

describe('evaluatePositionV4 grace period', () => {
  it('lệnh 2 phút, lỗ 1%, CVD divergence → HOLD (không CLOSE)', () => {
    const r = evaluatePositionV4(v4Input());
    expect(r.type).toBe('HOLD');
    expect(r.type).not.toBe('CLOSE_NOW');
    expect(r.gracePeriodActive).toBe(true);
    expect(r.graceSuppressedRules).toContain('CVD_DIVERGENCE');
    expect(r.label).toContain('mới mở');
    expect(r.label).toContain('CVD');
  });

  it('lệnh 2 phút nhưng giá chạy 0.6×ATR → CVD áp dụng bình thường', () => {
    const r = evaluatePositionV4(
      v4Input({ currentPrice: ENTRY - 0.6 * ATR }),
    );
    expect(r.gracePeriodActive).toBeUndefined();
    expect(r.type).toBe('CLOSE_NOW');
    expect(r.triggeredBy).toBe('CVD_DIVERGENCE');
  });

  it('lệnh 25 phút, giá đi ngang 0.3×ATR → thoát grace, CVD hoạt động', () => {
    const r = evaluatePositionV4(
      v4Input({
        position: { openedAt: NOW - 25 * 60_000 },
        currentPrice: ENTRY - 0.3 * ATR,
      }),
    );
    expect(r.gracePeriodActive).toBeUndefined();
    expect(r.type).toBe('CLOSE_NOW');
    expect(r.triggeredBy).toBe('CVD_DIVERGENCE');
  });

  it('lệnh 3 giờ, đang lời, CVD yếu gần TP1 → chốt theo thiết kế gốc', () => {
    const r = evaluatePositionV4(
      v4Input({
        position: {
          openedAt: NOW - 3 * 3_600_000,
          currentPnlUSDT: 8,
          currentPnlPct: 4,
          lastCVDDivergenceActive: true,
        },
        currentPrice: ENTRY + 1.5 * ATR,
        ownDirectionScore: {
          warnings: ['CVD phân kỳ bearish — bull trap'],
          layers: [
            { layerNumber: 5, score: 0 },
            { layerNumber: 8, score: 1 },
          ],
        },
      }),
    );
    expect(r.gracePeriodActive).toBeUndefined();
    expect(r.type).toBe('PARTIAL_TP1');
    expect(r.triggeredBy).toBe('CVD_DIVERGENCE');
  });

  it('EXTERNAL_RISK không bị grace — hard block vẫn CLOSE_URGENT', () => {
    const r = evaluatePositionV4(
      v4Input({
        ownDirectionScore: {
          hardBlocks: ['BTC dump mạnh'],
          warnings: ['CVD phân kỳ bearish'],
          layers: [{ layerNumber: 5, score: 0 }],
        },
      }),
    );
    expect(r.type).toBe('CLOSE_URGENT');
    expect(r.triggeredBy).toBe('HARD_BLOCK');
    expect(r.gracePeriodActive).toBeUndefined();
  });
});

describe('grace period ATR thật vs SL structure override', () => {
  const STRUCTURE_ENTRY = 100;
  const REAL_ATR_1H = 2; // 2% giá
  const STRUCTURE_SL = 93; // 7% cách entry — không phản ánh ATR

  function structurePosition() {
    return basePosition({
      entryPrice: STRUCTURE_ENTRY,
      sl: STRUCTURE_SL,
      tp1: STRUCTURE_ENTRY + 4,
      tp2: STRUCTURE_ENTRY + 8,
      tp3: STRUCTURE_ENTRY + 12,
      openedAt: NOW - 2 * 60_000,
    });
  }

  it('ngưỡng 0.5×ATR dùng atr1h thật (1%), không suy ngược từ SL (1.75%)', () => {
    const priceMove = 1.2;
    const currentPrice = STRUCTURE_ENTRY - priceMove;

    expect(resolveGraceAtr(structurePosition(), REAL_ATR_1H).atr).toBe(REAL_ATR_1H);
    expect(estimatePositionAtr(structurePosition())).toBe(3.5);

    expect(
      isInGracePeriod(
        { entryPrice: STRUCTURE_ENTRY, openedAt: NOW - 2 * 60_000 },
        currentPrice,
        REAL_ATR_1H,
        NOW,
      ),
    ).toBe(false);

    expect(
      isInGracePeriod(
        { entryPrice: STRUCTURE_ENTRY, openedAt: NOW - 2 * 60_000 },
        currentPrice,
        estimatePositionAtr(structurePosition()),
        NOW,
      ),
    ).toBe(true);
  });

  it('SL structure 7%, atr1h=2%, giá lệch 1.2 → CVD không bị grace (V3/V4)', () => {
    const input = {
      position: structurePosition(),
      currentPrice: STRUCTURE_ENTRY - 1.2,
      ownDirectionScore: cvdWeakScore,
      oppositeDirectionScore: { totalScore: 5, decision: 'KHONG_VAO', hardBlocks: [] },
      marketMode: 'RANGING' as const,
      atr1h: REAL_ATR_1H,
      now: NOW,
    };

    const v2 = evaluatePositionV2(input);
    const v4 = evaluatePositionV4(input);
    expect(v2.gracePeriodActive).toBeUndefined();
    expect(v4.gracePeriodActive).toBeUndefined();
    expect(v2.type).toBe('CLOSE_NOW');
    expect(v4.type).toBe('CLOSE_NOW');
    expect(v2.triggeredBy).toBe('CVD_DIVERGENCE');
  });
});

const stableScore: OwnDirectionScore = {
  totalScore: 10,
  direction: 'LONG',
  groupScores: { A: 3, B: 3, C: 4 },
  decision: 'VAO_TU_TIN',
  hardBlocks: [],
  groupBlocks: [],
  warnings: [],
  layers: [
    { layerNumber: 1, score: 1.5 },
    { layerNumber: 5, score: 1 },
    { layerNumber: 8, score: 1 },
  ],
};

function fundingV4Input(
  overrides: Partial<{
    position: Partial<ActivePosition>;
    currentPrice: number;
    ownDirectionScore: Partial<OwnDirectionScore>;
    oppositeDirectionScore: {
      totalScore?: number;
      decision?: string;
      hardBlocks?: string[];
    };
    marketMode: 'TRENDING' | 'RANGING';
    now: number;
    atr1h: number;
    currentFundingState: FundingState;
    currentSqueezeRisk: SqueezeRiskResult;
  }> = {},
) {
  return {
    position: basePosition({
      openedAt: NOW - 3 * 3_600_000,
      ...overrides.position,
    }),
    currentPrice: overrides.currentPrice ?? ENTRY,
    ownDirectionScore: { ...stableScore, ...overrides.ownDirectionScore },
    oppositeDirectionScore: {
      totalScore: 5,
      decision: 'KHONG_VAO',
      hardBlocks: [],
      ...overrides.oppositeDirectionScore,
    },
    marketMode: overrides.marketMode ?? ('RANGING' as const),
    atr1h: overrides.atr1h ?? ATR,
    now: overrides.now ?? NOW,
    currentFundingState: overrides.currentFundingState,
    currentSqueezeRisk: overrides.currentSqueezeRisk,
  };
}

function mockSqueezeRisk(
  level: SqueezeLevel,
  direction: SqueezeDirection,
): SqueezeRiskResult {
  return {
    score: level === 'EXTREME' ? 9 : 7,
    level,
    direction,
    components: {
      fundingCrowding: 0,
      oiExpansion: 0,
      lsCrowding: 0,
      priceOiDivergence: 0,
      whaleWallConfirmation: 0,
    },
    reasons: [],
    timestamp: NOW,
  };
}

describe('evaluatePositionV4 FUNDING_REVERSAL', () => {
  const fundingTransitionLong = {
    position: {
      direction: 'LONG' as const,
      currentPnlUSDT: 0.8,
      lastFundingState: FundingState.SHORT_SQUEEZE_BUILDING,
    },
    currentFundingState: FundingState.SHORT_EUPHORIA_FADING,
  };

  it('first funding transition → HOLD pending confirmation', () => {
    const r = evaluatePositionV4(fundingV4Input(fundingTransitionLong));
    expect(r.type).toBe('HOLD');
    expect(r.triggeredBy).toBe('FUNDING_REVERSAL');
    expect(r.reasons[0]).toContain('Đang xác nhận funding');
    expect(r.shouldSetFundingReversalPending).toBe(true);
  });

  it('second consecutive funding transition → PARTIAL_CLOSE_30', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        ...fundingTransitionLong,
        position: {
          ...fundingTransitionLong.position,
          lastFundingReversalPending: true,
        },
      }),
    );
    expect(r.type).toBe('PARTIAL_CLOSE_30');
    expect(r.triggeredBy).toBe('FUNDING_REVERSAL');
    expect(r.reasons[0]).toContain('chốt 30%');
  });

  it('Long lời 0.8 USDT, funding confirmed → PARTIAL_CLOSE_30', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        ...fundingTransitionLong,
        position: {
          ...fundingTransitionLong.position,
          lastFundingReversalPending: true,
        },
      }),
    );
    expect(r.type).toBe('PARTIAL_CLOSE_30');
    expect(r.triggeredBy).toBe('FUNDING_REVERSAL');
    expect(r.reasons[0]).toContain('chốt 30%');
  });

  it('Long 5 phút (Grace Period), funding đổi → HOLD (grace suppress)', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'LONG',
          openedAt: NOW - 5 * 60_000,
          currentPnlUSDT: 0.8,
          lastFundingState: FundingState.SHORT_SQUEEZE_BUILDING,
        },
        currentPrice: ENTRY - 0.3 * ATR,
        currentFundingState: FundingState.SHORT_EUPHORIA_FADING,
      }),
    );
    expect(r.type).toBe('HOLD');
    expect(r.triggeredBy).toBe('FUNDING_REVERSAL');
    expect(r.reasons[0]).toContain('Đang xác nhận funding');
    expect(r.shouldSetFundingReversalPending).toBe(true);
  });

  it('Short lỗ 60% maxLoss, funding đảo confirmed → CLOSE_NOW', () => {
    const maxLoss = 10;
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'SHORT',
          currentPnlUSDT: -6,
          maxLossUSDT: maxLoss,
          lastFundingState: FundingState.EXTREME_LONG_EUPHORIA,
          lastFundingReversalPending: true,
        },
        ownDirectionScore: { ...stableScore, direction: 'SHORT' },
        currentFundingState: FundingState.LONG_EUPHORIA_FADING,
      }),
    );
    expect(r.type).toBe('CLOSE_NOW');
    expect(r.triggeredBy).toBe('FUNDING_REVERSAL');
    expect(r.reasons[0]).toContain('đóng lệnh');
  });

  it('FUNDING_REVERSAL + lỗ, thiếu maxLossUSDT, confirmed → Đóng lệnh (an toàn)', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'SHORT',
          currentPnlUSDT: -6,
          lastFundingState: FundingState.EXTREME_LONG_EUPHORIA,
          lastFundingReversalPending: true,
        },
        ownDirectionScore: { ...stableScore, direction: 'SHORT' },
        currentFundingState: FundingState.LONG_EUPHORIA_FADING,
      }),
    );
    expect(r.type).toBe('CLOSE_NOW');
    expect(r.label).toBe('Đóng lệnh');
    expect(r.triggeredBy).toBe('FUNDING_REVERSAL');
  });

  it('no funding transition clears pending flag', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          lastFundingReversalPending: true,
          lastFundingState: FundingState.SHORT_SQUEEZE_BUILDING,
        },
        currentFundingState: FundingState.SHORT_SQUEEZE_BUILDING,
      }),
    );
    expect(r.shouldClearFundingReversalPending).toBe(true);
  });
});

describe('evaluatePositionV4 SQUEEZE_RISK_ALERT', () => {
  it('Long lời 0.5 USDT, squeeze HIGH → EXTREME (LONG_SQUEEZE) → PARTIAL_CLOSE_30', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'LONG',
          currentPnlUSDT: 0.5,
          lastSqueezeRiskLevel: 'HIGH',
          lastSqueezeRiskDirection: 'LONG_SQUEEZE',
        },
        currentSqueezeRisk: mockSqueezeRisk('EXTREME', 'LONG_SQUEEZE'),
      }),
    );
    expect(r.type).toBe('PARTIAL_CLOSE_30');
    expect(r.triggeredBy).toBe('SQUEEZE_RISK_ALERT');
    expect(r.reasons[0]).toContain('chốt 30%');
  });

  it('Long 5 phút (Grace Period), squeeze EXTREME → HOLD (grace suppress)', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'LONG',
          openedAt: NOW - 5 * 60_000,
          currentPnlUSDT: 0.5,
          lastSqueezeRiskLevel: 'HIGH',
          lastSqueezeRiskDirection: 'LONG_SQUEEZE',
        },
        currentPrice: ENTRY - 0.3 * ATR,
        currentSqueezeRisk: mockSqueezeRisk('EXTREME', 'LONG_SQUEEZE'),
      }),
    );
    expect(r.type).toBe('HOLD');
    expect(r.gracePeriodActive).toBe(true);
    expect(r.graceSuppressedRules).toContain('SQUEEZE_RISK_ALERT');
  });

  it('Short đang mở, LONG_SQUEEZE EXTREME (ngược hướng) → rule không kích hoạt', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'SHORT',
          lastSqueezeRiskLevel: 'HIGH',
          lastSqueezeRiskDirection: 'LONG_SQUEEZE',
        },
        ownDirectionScore: { ...stableScore, direction: 'SHORT' },
        currentSqueezeRisk: mockSqueezeRisk('EXTREME', 'LONG_SQUEEZE'),
      }),
    );
    expect(r.triggeredBy).not.toBe('SQUEEZE_RISK_ALERT');
  });

  it('Long đang mở, squeeze HIGH → HIGH → rule không kích hoạt', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'LONG',
          lastSqueezeRiskLevel: 'HIGH',
          lastSqueezeRiskDirection: 'LONG_SQUEEZE',
        },
        currentSqueezeRisk: mockSqueezeRisk('HIGH', 'LONG_SQUEEZE'),
      }),
    );
    expect(r.triggeredBy).not.toBe('SQUEEZE_RISK_ALERT');
  });

  it('Long lỗ 50% maxLoss, squeeze HIGH → EXTREME → MOVE_SL tighter (HOLD_MOVE_SL)', () => {
    const maxLoss = 10;
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'LONG',
          currentPnlUSDT: -5,
          maxLossUSDT: maxLoss,
          lastSqueezeRiskLevel: 'HIGH',
          lastSqueezeRiskDirection: 'LONG_SQUEEZE',
        },
        currentSqueezeRisk: mockSqueezeRisk('EXTREME', 'LONG_SQUEEZE'),
      }),
    );
    expect(r.type).toBe('HOLD_MOVE_SL');
    expect(r.triggeredBy).toBe('SQUEEZE_RISK_ALERT');
    expect(r.reasons[0]).toContain('dời SL');
  });

  it('SQUEEZE_RISK_ALERT + lỗ, thiếu maxLossUSDT → Dời SL gần hơn (an toàn)', () => {
    const r = evaluatePositionV4(
      fundingV4Input({
        position: {
          direction: 'LONG',
          currentPnlUSDT: -5,
          lastSqueezeRiskLevel: 'HIGH',
          lastSqueezeRiskDirection: 'LONG_SQUEEZE',
        },
        currentSqueezeRisk: mockSqueezeRisk('EXTREME', 'LONG_SQUEEZE'),
      }),
    );
    expect(r.type).toBe('HOLD_MOVE_SL');
    expect(r.label).toBe('Dời SL gần hơn — squeeze EXTREME');
    expect(r.triggeredBy).toBe('SQUEEZE_RISK_ALERT');
  });
});

describe('V3 và V4 nhất quán trong grace period', () => {
  it('lệnh 2 phút, CVD divergence → V2 và V4 cùng HOLD (không CLOSE)', () => {
    const input = v4Input();
    const v2 = evaluatePositionV2(input);
    const v4 = evaluatePositionV4(input);
    expect(v2.type).toBe('HOLD');
    expect(v4.type).toBe('HOLD');
    expect(v2.type).not.toBe('CLOSE_NOW');
    expect(v4.type).not.toBe('CLOSE_NOW');
    expect(v2.gracePeriodActive).toBe(true);
    expect(v4.gracePeriodActive).toBe(true);
    expect(v2.graceMinutesOpen).toBe(2);
    expect(v4.graceMinutesOpen).toBe(2);
    expect(isHoldFamilyAction(v2.type)).toBe(true);
    expect(isHoldFamilyAction(v4.type)).toBe(true);
    expect(isCloseFamilyAction(v2.type)).toBe(false);
    expect(isCloseFamilyAction(v4.type)).toBe(false);
  });
});
