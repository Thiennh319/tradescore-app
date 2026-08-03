import { describe, expect, it } from 'vitest';
import type { DecisionEvaluation } from '../decisionEngine';
import { computePositionAdviserExplainResult } from '../positionAdviserExplainV41';
import {
  computeTradeExecutionPlannerResult,
  planTradeExecution,
} from '../tradeExecutionPlannerV41';
import { V41_ENGINE_ID } from '../foundation/engineIds';
import { buildV41EngineResult, validateV41EngineResult } from '../foundation/engineResult';
import {
  V41_DECISION_FOUNDATION_STATE,
  V41_CONFIDENCE_FOUNDATION_STATE,
} from '../foundation/states';

function mockDecision(evaluation: DecisionEvaluation, markPrice?: number) {
  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.DECISION,
    state: evaluation.decision,
    confidence: evaluation.confidence,
    strength: evaluation.strength,
    reviews: [],
    metrics: markPrice != null ? { markPrice } : {},
    debug: { raw: { evaluation } },
  });
}

function mockAdviser(decision: ReturnType<typeof mockDecision>, markPrice = 100) {
  const adviser = computePositionAdviserExplainResult(decision);
  return buildV41EngineResult({
    ...adviser,
    metrics: {
      ...adviser.metrics,
      markPrice,
      structureStopPrice: decision.state === 'LONG' ? 97.5 : 102.5,
    },
  });
}

describe('planTradeExecution', () => {
  it('LONG — sinh đầy đủ Entry / SL / TP / Risk', () => {
    const decision = mockDecision(
      {
        decision: V41_DECISION_FOUNDATION_STATE.LONG,
        confidence: 86,
        strength: 86,
        reasons: ['Đủ điều kiện kích hoạt LONG'],
        warnings: [],
      },
      100,
    );
    const adviser = mockAdviser(decision, 100);

    const plan = planTradeExecution({ decisionResult: decision, adviserResult: adviser });
    expect(plan).not.toBeNull();
    expect(plan && 'direction' in plan && plan.direction).toBe('LONG');

    if (plan && 'entry' in plan) {
      expect(plan.entry.entryPrice).toBe(100);
      expect(plan.entry.entryZoneLow).toBeLessThan(100);
      expect(plan.entry.entryZoneHigh).toBeGreaterThan(100);
      expect(['MARKET', 'LIMIT']).toContain(plan.entry.entryType);
      expect(plan.entry.entryReason.length).toBeGreaterThan(20);
      expect(plan.entry.entryReason).not.toContain('Calculated automatically');

      expect(plan.stopLoss.stopLoss).toBeLessThan(100);
      expect(plan.stopLoss.stopReason.length).toBeGreaterThan(10);

      expect(plan.takeProfit.tp1).toBeGreaterThan(100);
      expect(plan.takeProfit.tp2).toBeGreaterThan(plan.takeProfit.tp1);
      expect(plan.takeProfit.tp3).toBeGreaterThan(plan.takeProfit.tp2);
      expect(plan.takeProfit.tpReason).toContain('R:R');

      expect(plan.riskSummary.rewardRisk).toBeGreaterThanOrEqual(1);
      expect(plan.riskSummary.positionSizeRecommendationPct).toBeGreaterThan(0);
    }
  });

  it('SHORT — sinh đầy đủ Planner', () => {
    const decision = mockDecision(
      {
        decision: V41_DECISION_FOUNDATION_STATE.SHORT,
        confidence: 82,
        strength: 80,
        reasons: ['Đủ điều kiện kích hoạt SHORT'],
        warnings: [],
      },
      100,
    );
    const adviser = mockAdviser(decision, 100);

    const plan = planTradeExecution({ decisionResult: decision, adviserResult: adviser });
    expect(plan && 'direction' in plan && plan.direction).toBe('SHORT');

    if (plan && 'stopLoss' in plan) {
      expect(plan.stopLoss.stopLoss).toBeGreaterThan(100);
      expect(plan.takeProfit.tp1).toBeLessThan(100);
    }
  });

  it('WATCH — không sinh Entry / SL / TP', () => {
    const decision = mockDecision({
      decision: V41_DECISION_FOUNDATION_STATE.WATCH,
      confidence: 55,
      strength: 50,
      reasons: ['Có tín hiệu nhưng chưa đủ mạnh'],
      warnings: [],
    });
    const adviser = mockAdviser(decision, 100);

    const plan = planTradeExecution({ decisionResult: decision, adviserResult: adviser });
    expect(plan).toEqual({ watchMessage: 'Tiếp tục theo dõi.' });
  });

  it('IGNORE — không sinh Planner', () => {
    const decision = mockDecision({
      decision: V41_DECISION_FOUNDATION_STATE.IGNORE,
      confidence: 15,
      strength: 12,
      reasons: ['Confidence quá thấp'],
      warnings: [],
    });
    const adviser = mockAdviser(decision, 100);

    expect(
      planTradeExecution({ decisionResult: decision, adviserResult: adviser }),
    ).toBeNull();
    expect(
      computeTradeExecutionPlannerResult({
        decisionResult: decision,
        adviserResult: adviser,
      }),
    ).toBeNull();
  });
});

describe('computeTradeExecutionPlannerResult', () => {
  it('LONG — V41EngineResult hợp lệ với ReviewItem UL', () => {
    const decision = mockDecision(
      {
        decision: V41_DECISION_FOUNDATION_STATE.LONG,
        confidence: 86,
        strength: 86,
        reasons: ['LONG ok'],
        warnings: [],
      },
      100,
    );
    const adviser = mockAdviser(decision, 100);

    const result = computeTradeExecutionPlannerResult({
      decisionResult: decision,
      adviserResult: adviser,
    });

    expect(result).not.toBeNull();
    expect(result!.engineId).toBe(V41_ENGINE_ID.TRADE_SETUP);
    expect(result!.state).toBe('LONG');
    expect(validateV41EngineResult(result!).valid).toBe(true);
    expect(result!.capabilities.canTradePlan).toBe(true);
    expect(result!.capabilities.canEntry).toBe(true);
    expect(result!.reviews.some((r) => r.id.includes('entry_plan'))).toBe(true);
    expect(result!.reviews.some((r) => r.id.includes('stop_loss'))).toBe(true);
    expect(result!.reviews.some((r) => r.id.includes('take_profit'))).toBe(true);
    expect(result!.debug?.raw?.plan).toBeDefined();
  });

  it('WATCH — chỉ message theo dõi', () => {
    const decision = mockDecision({
      decision: V41_DECISION_FOUNDATION_STATE.WATCH,
      confidence: 50,
      strength: 48,
      reasons: ['watch'],
      warnings: [],
    });
    const adviser = mockAdviser(decision, 100);

    const result = computeTradeExecutionPlannerResult({
      decisionResult: decision,
      adviserResult: adviser,
    });

    expect(result!.state).toBe('WATCH');
    expect(result!.reviews[0].title).toContain('theo dõi');
    expect(result!.debug?.raw?.plan).toBeUndefined();
  });

  it('không đổi Decision state', () => {
    const decision = mockDecision(
      {
        decision: V41_DECISION_FOUNDATION_STATE.LONG,
        confidence: 86,
        strength: 86,
        reasons: [],
        warnings: [],
      },
      100,
    );
    const adviser = mockAdviser(decision, 100);
    const originalState = decision.state;

    computeTradeExecutionPlannerResult({ decisionResult: decision, adviserResult: adviser });
    expect(decision.state).toBe(originalState);
  });

  it('integration pipeline stub — confidence metrics không bắt buộc', () => {
    const decision = mockDecision(
      {
        decision: V41_DECISION_FOUNDATION_STATE.SHORT,
        confidence: 80,
        strength: 78,
        reasons: [],
        warnings: [],
      },
      50,
    );
    const adviser = buildV41EngineResult({
      engineId: V41_ENGINE_ID.POSITION_ADVISOR,
      state: 'SHORT',
      confidence: 80,
      strength: 78,
      reviews: [],
      metrics: { markPrice: 50, structureStopPrice: 51.2 },
      debug: {
        raw: {
          explainSummary: {
            decision: 'SHORT',
            nextAction: 'Khuyến nghị mở vị thế SHORT.',
            assessment: 'Đánh giá: SHORT.',
            advisorSummary: 'SHORT',
            reasonsSupporting: [],
            warningFactors: [],
            confidence: 80,
            strength: 78,
          },
        },
      },
    });

    const plan = planTradeExecution({ decisionResult: decision, adviserResult: adviser });
    expect(plan && 'direction' in plan).toBe(true);
    expect(decision.engineId).toBe(V41_ENGINE_ID.DECISION);
    expect(adviser.engineId).not.toBe(V41_ENGINE_ID.CONFIDENCE);
  });
});
