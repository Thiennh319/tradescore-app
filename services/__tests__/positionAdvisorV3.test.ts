import { describe, expect, it } from 'vitest';
import {
  evaluatePositionV2,
  type ActivePosition,
  type OwnDirectionScore,
} from '../positionAdvisorV3';

const basePosition: ActivePosition = {
  direction: 'LONG',
  entryPrice: 100,
  sl: 95,
  tp1: 110,
  tp2: 120,
  tp3: 130,
  openedAt: Date.now() - 2 * 3_600_000,
  currentPnlPct: 2,
  currentPnlUSDT: 5,
};

const baseScore: OwnDirectionScore = {
  totalScore: 10,
  direction: 'LONG',
  groupScores: { A: 4, B: 3, C: 3 },
  decision: 'VAO_TU_TIN',
  hardBlocks: [],
  groupBlocks: [],
  warnings: [],
  layers: [
    { layerNumber: 1, score: 1.5 },
    { layerNumber: 3, score: 1.2 },
    { layerNumber: 5, score: 1 },
    { layerNumber: 8, score: 1 },
  ],
};

function v2Input(
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
    lastRecommendationType: 'HOLD' | 'CLOSE_NOW' | 'CLOSE_REVERSE';
  }> = {},
) {
  return {
    position: { ...basePosition, ...overrides.position },
    currentPrice: overrides.currentPrice ?? 102,
    ownDirectionScore: { ...baseScore, ...overrides.ownDirectionScore },
    oppositeDirectionScore: {
      totalScore: 0,
      decision: 'KHONG_VAO',
      hardBlocks: [],
      ...overrides.oppositeDirectionScore,
    },
    marketMode: overrides.marketMode ?? ('TRENDING' as const),
    lastRecommendationType: overrides.lastRecommendationType,
  };
}

describe('HOLD_STRONG hysteresis', () => {
  it('enters when score >= 9.0 without prior HOLD', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { totalScore: 9.0 },
      }),
    );
    expect(r.triggeredBy).toBe('HOLD_STRONG');
  });

  it('does not enter when score < 9.0 without prior HOLD', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { totalScore: 8.9 },
      }),
    );
    expect(r.triggeredBy).not.toBe('HOLD_STRONG');
  });

  it('stays HOLD_STRONG when score oscillates 8.8–9.2 with last HOLD', () => {
    for (const score of [9.2, 8.8, 9.1, 8.9]) {
      const r = evaluatePositionV2(
        v2Input({
          ownDirectionScore: { totalScore: score },
          lastRecommendationType: 'HOLD',
        }),
      );
      expect(r.triggeredBy).toBe('HOLD_STRONG');
    }
  });

  it('exits HOLD_STRONG when score < 8.5 with last HOLD', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { totalScore: 8.4 },
        lastRecommendationType: 'HOLD',
      }),
    );
    expect(r.triggeredBy).not.toBe('HOLD_STRONG');
  });
});

describe('HOLD_CONDITIONAL hysteresis', () => {
  it('enters when score >= 7.0 without prior HOLD', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { totalScore: 7.0 },
      }),
    );
    expect(r.triggeredBy).toBe('HOLD_CONDITIONAL');
  });

  it('does not enter when score < 7.0 without prior HOLD', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { totalScore: 6.9 },
      }),
    );
    expect(r.triggeredBy).not.toBe('HOLD_CONDITIONAL');
  });

  it('stays HOLD_CONDITIONAL when score oscillates 6.6–7.2 with last HOLD', () => {
    for (const score of [7.2, 6.6, 7.0, 6.8]) {
      const r = evaluatePositionV2(
        v2Input({
          ownDirectionScore: { totalScore: score },
          lastRecommendationType: 'HOLD',
        }),
      );
      expect(r.triggeredBy).toBe('HOLD_CONDITIONAL');
    }
  });

  it('exits HOLD_CONDITIONAL when score < 6.5 with last HOLD', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { totalScore: 6.4 },
        lastRecommendationType: 'HOLD',
      }),
    );
    expect(r.triggeredBy).not.toBe('HOLD_CONDITIONAL');
  });
});

describe('OPPOSITE_STRONG hysteresis', () => {
  const oppositeBase = {
    ownDirectionScore: { totalScore: 7 },
    position: { currentPnlUSDT: 5 },
  };

  it('enters when opposite score >= 11.0 without prior CLOSE_REVERSE', () => {
    const r = evaluatePositionV2(
      v2Input({
        ...oppositeBase,
        oppositeDirectionScore: { totalScore: 11.0, decision: 'SETUP_NGON' },
      }),
    );
    expect(r.triggeredBy).toBe('OPPOSITE_STRONG');
  });

  it('does not match when opposite score = 10.3', () => {
    const r = evaluatePositionV2(
      v2Input({
        ...oppositeBase,
        oppositeDirectionScore: { totalScore: 10.3, decision: 'SETUP_NGON' },
      }),
    );
    expect(r.triggeredBy).not.toBe('OPPOSITE_STRONG');
  });

  it('stays OPPOSITE_STRONG when opposite oscillates 10.8–11.2 with last CLOSE_REVERSE', () => {
    for (const oppositeScore of [11.2, 10.8, 11.2, 10.8]) {
      const r = evaluatePositionV2(
        v2Input({
          ...oppositeBase,
          oppositeDirectionScore: { totalScore: oppositeScore, decision: 'SETUP_NGON' },
          lastRecommendationType: 'CLOSE_REVERSE',
        }),
      );
      expect(r.triggeredBy).toBe('OPPOSITE_STRONG');
    }
  });
});

describe('CVD_DIVERGENCE consecutive scan', () => {
  const cvdScore = {
    warnings: ['CVD phân kỳ bearish'],
    layers: [
      { layerNumber: 1, score: 1.5 },
      { layerNumber: 3, score: 1.2 },
      { layerNumber: 5, score: 0 },
      { layerNumber: 8, score: 1 },
    ],
  };

  it('first scan near TP1 sets flag without triggering CVD_DIVERGENCE', () => {
    const r = evaluatePositionV2(
      v2Input({
        currentPrice: 107,
        ownDirectionScore: cvdScore,
      }),
    );
    expect(r.triggeredBy).not.toBe('CVD_DIVERGENCE');
    expect(r.shouldSetCVDFlag).toBe(true);
  });

  it('second consecutive scan triggers CVD_DIVERGENCE', () => {
    const r = evaluatePositionV2(
      v2Input({
        currentPrice: 107,
        ownDirectionScore: cvdScore,
        position: { lastCVDDivergenceActive: true },
      }),
    );
    expect(r.triggeredBy).toBe('CVD_DIVERGENCE');
    expect(r.shouldSetCVDFlag).toBe(true);
  });

  it('triggers immediately when far from TP1 (dist < 70%)', () => {
    const r = evaluatePositionV2(
      v2Input({
        currentPrice: 102,
        ownDirectionScore: cvdScore,
      }),
    );
    expect(r.triggeredBy).toBe('CVD_DIVERGENCE');
  });
});
