import { describe, expect, it } from 'vitest';
import {
  evaluatePosition,
  evaluatePositionV2,
  type ActivePosition,
  type OwnDirectionScore,
} from './positionAdvisorV3';

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
  };
}

describe('evaluatePositionV2', () => {
  it('Hard block + đang lời → Chốt lời ngay', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: { hardBlocks: ['BTC dump mạnh'] },
        position: { currentPnlUSDT: 5 },
      }),
    );
    expect(r.type).toBe('CLOSE_URGENT');
    expect(r.label).toBe('Chốt lời ngay');
    expect(r.triggeredBy).toBe('HARD_BLOCK');
    expect(r.confidence).toBe(92);
  });

  it('Opposite score 12đ + lỗ nhẹ, thiếu maxLossUSDT → Cân nhắc đóng lệnh (an toàn)', () => {
    const r = evaluatePositionV2(
      v2Input({
        position: { currentPnlUSDT: -0.3 },
        currentPrice: 99.7,
        ownDirectionScore: { totalScore: 7 },
        oppositeDirectionScore: { totalScore: 12, decision: 'SETUP_NGON' },
      }),
    );
    expect(r.type).toBe('CLOSE_NOW');
    expect(r.label).toBe('Cân nhắc đóng lệnh');
    expect(r.triggeredBy).toBe('OPPOSITE_STRONG');
  });

  it('Opposite score 12đ + lỗ nhẹ, có maxLossUSDT → Đóng lệnh, đảo chiều', () => {
    const r = evaluatePositionV2(
      v2Input({
        position: { currentPnlUSDT: -0.3, maxLossUSDT: 1.5 },
        currentPrice: 99.7,
        ownDirectionScore: { totalScore: 7 },
        oppositeDirectionScore: { totalScore: 12, decision: 'SETUP_NGON' },
      }),
    );
    expect(r.type).toBe('CLOSE_REVERSE');
    expect(r.label).toBe('Đóng lệnh, đảo chiều');
    expect(r.triggeredBy).toBe('OPPOSITE_STRONG');
  });

  it('Score 11đ ổn định → Tiếp tục giữ', () => {
    const r = evaluatePositionV2(
      v2Input({
        currentPrice: 101,
        ownDirectionScore: { totalScore: 11.5 },
      }),
    );
    expect(r.type).toBe('HOLD');
    expect(r.label).toBe('Tiếp tục giữ');
    expect(r.triggeredBy).toBe('HOLD_STRONG');
    expect(r.confidence).toBe(85);
  });

  it('gộp reasons từ nhiều rule matched', () => {
    const r = evaluatePositionV2(
      v2Input({
        ownDirectionScore: {
          totalScore: 11.5,
          groupBlocks: ['Nhóm B yếu'],
        },
      }),
    );
    expect(r.triggeredBy).toBe('GROUP_BLOCK');
    expect(r.matchedRuleCount).toBeGreaterThan(1);
    expect(r.reasons.length).toBeGreaterThan(1);
  });
});

describe('evaluatePosition (deprecated wrapper)', () => {
  it('returns CLOSE_URGENT on BTC hard block when losing', () => {
    const r = evaluatePosition(
      { ...basePosition, currentPnlUSDT: -2 },
      98,
      { ...baseScore, hardBlocks: ['BTC dump mạnh'] },
      'TRENDING',
    );
    expect(r.type).toBe('CLOSE_URGENT');
    expect(r.label).toBe('Đóng khẩn cấp');
    expect(r.urgency).toBe('CRITICAL');
    expect(r.confidence).toBe(95);
  });

  it('returns CLOSE_URGENT when L8=0 on LONG with layer reason', () => {
    const r = evaluatePosition(
      { ...basePosition, currentPnlUSDT: -3 },
      98,
      {
        ...baseScore,
        layers: baseScore.layers.map((l) =>
          l.layerNumber === 8
            ? { ...l, score: 0, reason: 'BTC 24h -1.20%, 1h -0.40% — đỏ cả 2 khung' }
            : l,
        ),
      },
      'TRENDING',
    );
    expect(r.type).toBe('CLOSE_URGENT');
    expect(r.label).toBe('Đóng khẩn cấp');
    expect(r.reasons[0]).toContain('BTC 24h');
  });

  it('returns PARTIAL_TP1 when past TP1', () => {
    const r = evaluatePosition(basePosition, 112, baseScore, 'TRENDING');
    expect(r.type).toBe('PARTIAL_TP1');
    expect(r.label).toBe('Chốt 50% TP1');
  });

  it('returns HOLD when score >= 9 without blocks', () => {
    const r = evaluatePosition(
      basePosition,
      101,
      { ...baseScore, totalScore: 11.5 },
      'TRENDING',
    );
    expect(r.type).toBe('HOLD');
    expect(r.confidence).toBe(85);
  });

  it('returns HOLD_MOVE_SL when beyond 1.5R near TP1', () => {
    const r = evaluatePosition(
      basePosition,
      108,
      { ...baseScore, totalScore: 8 },
      'TRENDING',
    );
    expect(r.type).toBe('HOLD_MOVE_SL');
    expect(r.reasons).toContain('Thị trường trending — giữ phần còn lại chạy tiếp');
  });

  it('does not false-trigger L8 when layer data missing', () => {
    const r = evaluatePosition(
      basePosition,
      101,
      { ...baseScore, layers: [] },
      'TRENDING',
    );
    expect(r.triggeredBy).not.toBe('BTC_REVERSAL');
  });

  it('returns CLOSE_NOW on trap warning far from TP1', () => {
    const r = evaluatePosition(
      basePosition,
      101,
      {
        ...baseScore,
        warnings: ['CVD phân kỳ bearish'],
        layers: baseScore.layers.map((l) =>
          l.layerNumber === 5 ? { ...l, score: 0 } : l,
        ),
      },
      'RANGING',
    );
    expect(r.type).toBe('CLOSE_NOW');
    expect(r.confidence).toBe(75);
  });
});
