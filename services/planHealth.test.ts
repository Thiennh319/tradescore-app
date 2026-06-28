import { describe, expect, it, vi } from 'vitest';
import { FundingState } from '../constants/scoring';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import {
  buildPlanHealthFromSignalRow,
  calculatePlanHealth,
  formatMultiConfirmationCancelNote,
  formatPlanHealthBadge,
} from './planHealth';
import { evaluatePendingPlanAdvisor } from './pendingPlanAdvisor';
import { mapCancelReasonToSkipReason } from './journalService';

function mockSqueeze(
  level: SqueezeRiskResult['level'],
  direction: SqueezeRiskResult['direction'],
): SqueezeRiskResult {
  return {
    score: level === 'EXTREME' ? 9 : 6,
    level,
    direction,
    components: {
      fundingCrowding: 1,
      oiExpansion: 1,
      lsCrowding: 1,
      priceOiDivergence: 1,
      whaleWallConfirmation: 1,
    },
    reasons: [],
    timestamp: Date.now(),
  };
}

const neutralFunding = { fundingState: FundingState.NEUTRAL };

describe('calculatePlanHealth', () => {
  it('Test 1: chỉ Squeeze EXTREME → NORMAL, không auto cancel', () => {
    const health = calculatePlanHealth(
      mockSqueeze('EXTREME', 'LONG_SQUEEZE'),
      neutralFunding,
      0,
      'LONG',
    );
    expect(health.score).toBe(70);
    expect(health.status).toBe('NORMAL');
    expect(health.autoCancel).toBe(false);
    expect(evaluatePendingPlanAdvisor(health).shouldAutoCancel).toBe(false);
  });

  it('Test 2: Squeeze EXTREME + CVD Divergence → WEAK, không hủy', () => {
    const health = calculatePlanHealth(
      mockSqueeze('EXTREME', 'LONG_SQUEEZE'),
      neutralFunding,
      -0.5,
      'LONG',
    );
    expect(health.score).toBe(45);
    expect(health.status).toBe('WEAK');
    expect(health.autoCancel).toBe(false);
    expect(formatPlanHealthBadge(health)).toContain('Squeeze EXTREME');
  });

  it('Test 3: cả 3 confirmation → CRITICAL, auto cancel', () => {
    const health = calculatePlanHealth(
      mockSqueeze('EXTREME', 'LONG_SQUEEZE'),
      { fundingState: FundingState.LONG_EUPHORIA_FADING },
      -0.5,
      'LONG',
    );
    expect(health.score).toBe(25);
    expect(health.status).toBe('CRITICAL');
    expect(health.autoCancel).toBe(true);

    const action = evaluatePendingPlanAdvisor(health);
    expect(action.shouldAutoCancel).toBe(true);
    expect(action.ruleName).toBe('PLAN_HEALTH_CRITICAL');
    expect(action.priority).toBe(72);
    expect(action.message).toContain('Squeeze + CVD + Funding');

    const note = formatMultiConfirmationCancelNote(health.penalties);
    expect(note).toBe('SQUEEZE_EXTREME + CVD_DIVERGENCE + FUNDING_REVERSAL');
    expect(mapCancelReasonToSkipReason('MULTI_CONFIRMATION_CANCEL')).toBe(
      'MULTI_CONFIRMATION_CANCEL',
    );
  });

  it('Test 4: Squeeze HIGH → không penalty', () => {
    const health = calculatePlanHealth(
      mockSqueeze('HIGH', 'LONG_SQUEEZE'),
      neutralFunding,
      0,
      'LONG',
    );
    expect(health.score).toBe(100);
    expect(health.status).toBe('STRONG');
    expect(health.penalties).toHaveLength(0);
  });

  it('Test 5: Long setup + SHORT_SQUEEZE EXTREME → không penalty squeeze', () => {
    const health = calculatePlanHealth(
      mockSqueeze('EXTREME', 'SHORT_SQUEEZE'),
      neutralFunding,
      0,
      'LONG',
    );
    expect(health.score).toBe(100);
    expect(health.status).toBe('STRONG');
  });

  it('MACD_REVERSAL + RSI_EXTREME penalties khi histogram/RSI ngược hướng', () => {
    const health = calculatePlanHealth(
      mockSqueeze('HIGH', 'NONE'),
      neutralFunding,
      0,
      'LONG',
      { h1: -1, h4: -1 },
      { h1: 75, h4: 75 },
    );
    expect(health.score).toBe(65);
    expect(health.status).toBe('NORMAL');
    expect(health.penalties.map((p) => p.reason)).toEqual([
      'MACD_REVERSAL',
      'RSI_EXTREME',
    ]);
    expect(health.autoCancel).toBe(false);
  });

  it('autoCancel khi >=3 tín hiệu (không cần đủ Squeeze+CVD+Funding)', () => {
    const health = calculatePlanHealth(
      mockSqueeze('EXTREME', 'LONG_SQUEEZE'),
      neutralFunding,
      -0.5,
      'LONG',
      { h1: -1, h4: -1 },
      { h1: 50, h4: 50 },
    );
    expect(health.penalties.map((p) => p.reason)).toEqual([
      'SQUEEZE_EXTREME',
      'CVD_DIVERGENCE',
      'MACD_REVERSAL',
    ]);
    expect(health.score).toBe(25);
    expect(health.autoCancel).toBe(true);
  });

  it('SHORT: MACD histogram dương cả 2 khung → MACD_REVERSAL', () => {
    const health = calculatePlanHealth(
      mockSqueeze('HIGH', 'NONE'),
      neutralFunding,
      0,
      'SHORT',
      { h1: 1, h4: 1 },
      { h1: 50, h4: 50 },
    );
    expect(health.penalties.some((p) => p.reason === 'MACD_REVERSAL')).toBe(true);
    expect(health.score).toBe(80);
  });
});

function mockSignalRowLayers(
  layers: { layer: number; score: number }[],
  squeeze: SqueezeRiskResult,
) {
  return {
    squeezeRisk: squeeze,
    l6Detail: { fundingState: FundingState.NEUTRAL },
    layers,
    v4: { longLayers: layers, shortLayers: layers },
  };
}

describe('buildPlanHealthFromSignalRow', () => {
  it('thiếu squeeze/l6 → STRONG mặc định', () => {
    expect(buildPlanHealthFromSignalRow('LONG', undefined).status).toBe('STRONG');
  });

  it('SHORT L3 tốt (score 2) → không penalty MACD oan', () => {
    const health = buildPlanHealthFromSignalRow(
      'SHORT',
      mockSignalRowLayers(
        [
          { layer: 2, score: 2 },
          { layer: 3, score: 2 },
          { layer: 5, score: 1 },
        ],
        mockSqueeze('HIGH', 'NONE'),
      ),
    );
    expect(health.penalties.some((p) => p.reason === 'MACD_REVERSAL')).toBe(false);
    expect(health.score).toBe(100);
  });

  it('SHORT L3 vi phạm (score 0) → MACD_REVERSAL', () => {
    const health = buildPlanHealthFromSignalRow(
      'SHORT',
      mockSignalRowLayers(
        [
          { layer: 2, score: 2 },
          { layer: 3, score: 0 },
          { layer: 5, score: 1 },
        ],
        mockSqueeze('HIGH', 'NONE'),
      ),
    );
    expect(health.penalties.some((p) => p.reason === 'MACD_REVERSAL')).toBe(true);
    expect(health.score).toBe(80);
  });

  it('LONG L2 vi phạm (score 0) → RSI_EXTREME', () => {
    const health = buildPlanHealthFromSignalRow(
      'LONG',
      mockSignalRowLayers(
        [
          { layer: 2, score: 0 },
          { layer: 3, score: 2 },
          { layer: 5, score: 1 },
        ],
        mockSqueeze('HIGH', 'NONE'),
      ),
    );
    expect(health.penalties.some((p) => p.reason === 'RSI_EXTREME')).toBe(true);
    expect(health.score).toBe(85);
  });
});
